# apps/billing/services.py
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from apps.tenants.models import Lease
from apps.notifications.services import NotificationService
from .models import Payment, UtilityBill, UtilityAllocation


class PaymentService:
    """
    Handles all payment business logic.
    Uses atomic transaction to ensure ledger consistency.
    """

    @staticmethod
    @transaction.atomic
    def record_payment(lease, amount, method, reference,
                       payment_date, period_month, notes, recorded_by):
        """
        Records a manual payment and updates the lease ledger.
        Returns the created Payment object.
        """
        balance_before = lease.balance_due
        balance_after = balance_before - Decimal(str(amount))

        payment = Payment.objects.create(
            lease=lease,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            payment_method=method,
            reference_number=reference,
            payment_date=payment_date,
            period_month=period_month,
            notes=notes,
            recorded_by=recorded_by,
            status='confirmed',
        )

        lease.balance_due = balance_after
        ArrearsDetectionService.evaluate_lease(lease)
        lease.save()

        NotificationService.notify_payment_received(payment)
        return payment

    @staticmethod
    def generate_receipt(payment) -> dict:
        """Returns a receipt-formatted dictionary for printing or PDF."""
        lease = payment.lease
        return {
            'receipt_number': f"RCP-{str(payment.id)[:8].upper()}",
            'date': payment.payment_date.isoformat(),
            'tenant': lease.tenant.user.get_full_name(),
            'unit': f"{lease.unit.property.name} — Unit {lease.unit.unit_number}",
            'amount_paid': str(payment.amount),
            'payment_method': payment.get_payment_method_display(),
            'reference': payment.reference_number,
            'balance_before': str(payment.balance_before),
            'balance_after': str(payment.balance_after),
            'period': payment.period_month.strftime('%B %Y') if payment.period_month else '',
            'status': 'PAID IN FULL' if payment.balance_after <= 0 else 'PARTIAL PAYMENT',
            'recorded_by': payment.recorded_by.get_full_name() if payment.recorded_by else '',
        }


class ArrearsDetectionService:
    """
    Smart arrears detection – automatically flags tenants who are behind on rent.
    
    ALGORITHM:
    A lease is in arrears if balance_due > 0 AND
    today's day-of-month is greater than the grace period day (5th).
    This matches Zambian landlord practice: 5 days grace after the 1st.
    """

    GRACE_PERIOD_DAYS = 5

    @classmethod
    def evaluate_lease(cls, lease: Lease) -> bool:
        """
        Evaluates and updates arrears status for a single lease.
        Called after every payment and on the daily scheduled job.
        Returns True if in arrears, False if clear.
        """
        today = timezone.now().date()
        # Grace period ends on the 5th day of the month
        past_grace_period = today.day > cls.GRACE_PERIOD_DAYS

        if lease.balance_due > 0 and past_grace_period:
            lease.is_in_arrears = True
            # Number of days after the grace period
            lease.arrears_days = today.day - cls.GRACE_PERIOD_DAYS
        else:
            lease.is_in_arrears = False
            lease.arrears_days = 0

        return lease.is_in_arrears

    @classmethod
    def run_portfolio_check(cls, landlord) -> dict:
        """
        Runs arrears detection across ALL active leases for a landlord.
        Called daily by Celery task. Returns summary statistics.
        """
        from apps.properties.models import Property

        active_leases = Lease.objects.filter(
            status='active',
            unit__property__owner=landlord
        ).select_related('tenant__user', 'unit__property')

        newly_flagged = []
        newly_cleared = []
        total_arrears = Decimal('0.00')

        for lease in active_leases:
            was_in_arrears = lease.is_in_arrears
            now_in_arrears = cls.evaluate_lease(lease)
            lease.save(update_fields=['is_in_arrears', 'arrears_days'])

            if now_in_arrears:
                total_arrears += lease.balance_due
                if not was_in_arrears:
                    newly_flagged.append(lease)
                    NotificationService.notify_rent_overdue(lease)
            elif was_in_arrears and not now_in_arrears:
                newly_cleared.append(lease)

        return {
            'checked': active_leases.count(),
            'in_arrears': active_leases.filter(is_in_arrears=True).count(),
            'newly_flagged': len(newly_flagged),
            'newly_cleared': len(newly_cleared),
            'total_arrears_zmw': str(total_arrears),
        }


class UtilityBillService:
    """
    Utility bill auto-split algorithm.
    Supports three strategies: equal, by floor area, by occupant count.
    """

    @staticmethod
    @transaction.atomic
    def split_bill(bill: UtilityBill) -> list:
        """Splits a UtilityBill into UtilityAllocation rows."""
        if bill.status == 'split':
            raise ValueError('This bill has already been split.')

        occupied_units = bill.property.units.filter(
            status='occupied'
        ).select_related('current_lease')

        if not occupied_units.exists():
            raise ValueError('No occupied units found for this property.')

        # Delete any previous allocations before re-splitting
        bill.allocations.all().delete()

        method = bill.split_method
        if method == 'equal':
            allocations = UtilityBillService._split_equal(bill, occupied_units)
        elif method == 'by_area':
            allocations = UtilityBillService._split_by_area(bill, occupied_units)
        elif method == 'by_occupants':
            allocations = UtilityBillService._split_by_occupants(bill, occupied_units)
        else:
            raise ValueError(f"Unknown split method: {method}")

        bill.status = 'split'
        bill.save(update_fields=['status', 'updated_at'])

        for allocation in allocations:
            NotificationService.notify_utility_bill(allocation)

        return allocations

    @staticmethod
    def _split_equal(bill, units) -> list:
        n = units.count()
        share = (bill.total_amount / n).quantize(Decimal('0.01'))
        remainder = bill.total_amount - (share * n)
        basis = Decimal(str(round(1 / n, 4)))

        allocations = []
        for i, unit in enumerate(units):
            amount = share + remainder if i == 0 else share
            allocations.append(UtilityAllocation.objects.create(
                bill=bill,
                unit=unit,
                allocated_amount=amount,
                allocation_basis=basis,
            ))
        return allocations

    @staticmethod
    def _split_by_area(bill, units) -> list:
        total_area = sum(u.floor_area_sqm for u in units if u.floor_area_sqm)
        if not total_area or total_area == 0:
            return UtilityBillService._split_equal(bill, units)

        allocations = []
        running_total = Decimal('0.00')
        units_list = list(units)

        for i, unit in enumerate(units_list):
            area = unit.floor_area_sqm or (total_area / len(units_list))
            basis = Decimal(str(round(float(area / total_area), 4)))

            if i == len(units_list) - 1:
                amount = bill.total_amount - running_total
            else:
                amount = (bill.total_amount * basis).quantize(Decimal('0.01'))
                running_total += amount

            allocations.append(UtilityAllocation.objects.create(
                bill=bill,
                unit=unit,
                allocated_amount=amount,
                allocation_basis=basis,
            ))
        return allocations

    @staticmethod
    def _split_by_occupants(bill, units) -> list:
        # Count occupants per unit – default to 1 if lease has no occupant_count field
        occupant_counts = {}
        for unit in units:
            lease = unit.current_lease
            # The Lease model currently does not have occupant_count.
            # This is a placeholder; you may add an occupant_count field later.
            occupant_counts[unit.id] = getattr(lease, 'occupant_count', 1) or 1

        total_occupants = sum(occupant_counts.values())
        allocations = []
        running_total = Decimal('0.00')
        units_list = list(units)

        for i, unit in enumerate(units_list):
            occupants = occupant_counts[unit.id]
            basis = Decimal(str(round(occupants / total_occupants, 4)))

            if i == len(units_list) - 1:
                amount = bill.total_amount - running_total
            else:
                amount = (bill.total_amount * basis).quantize(Decimal('0.01'))
                running_total += amount

            allocations.append(UtilityAllocation.objects.create(
                bill=bill,
                unit=unit,
                allocated_amount=amount,
                allocation_basis=basis,
            ))
        return allocations