# apps/billing/services.py
from datetime import date, timedelta
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from apps.tenants.models import Lease
from apps.properties.models import UnitStatus
from apps.notifications.services import NotificationService
from .models import Payment, UtilityBill, UtilityAllocation

MAX_PREPAID_MONTHS = 240  # safety cap


def get_monthly_rent(lease):
    """Return monthly rent from lease or fallback to unit.rent_amount."""
    if hasattr(lease, 'monthly_rent') and lease.monthly_rent is not None:
        return Decimal(str(lease.monthly_rent)).quantize(Decimal('0.01'))
    return Decimal(str(getattr(lease.unit, 'rent_amount', Decimal('0.00')) or 0)).quantize(Decimal('0.01'))


class PaymentService:
    """
    Handles all payment business logic.
    Uses atomic transactions to ensure ledger consistency.
    """

    @staticmethod
    @transaction.atomic
    def record_payment(lease, amount, method, reference,
                       payment_date, period_month, notes, recorded_by,
                       charge_type='rent', utility_allocation=None):
        """
        Creates a pending payment. Does NOT update lease balance.
        """
        payment = Payment.objects.create(
            lease=lease,
            amount=amount,
            balance_before=None,
            balance_after=None,
            payment_method=method,
            reference_number=reference,
            payment_date=payment_date,
            period_month=period_month,
            notes=notes,
            recorded_by=recorded_by,
            status='pending',
            prepaid_allocations=[],
            charge_type=charge_type,
            utility_allocation=utility_allocation,
        )
        return payment

    @staticmethod
    @transaction.atomic
    def approve_payment(payment, approved_by=None):
        if payment.status != 'pending':
            raise ValueError('Only pending payments can be approved.')

        lease = payment.lease
        balance_before = Decimal(str(lease.balance_due or 0))
        amount = Decimal(str(payment.amount))

        if amount <= 0:
            raise ValueError('Payment amount must be positive.')

        balance_after = (balance_before - amount).quantize(Decimal('0.01'))

        prepaid_allocations = []
        if balance_after < 0:
            surplus = abs(balance_after)
            monthly_rent = get_monthly_rent(lease)
            if monthly_rent > 0:
                today_first = timezone.now().date().replace(day=1)
                start_month = payment.period_month or payment.payment_date.replace(day=1)
                if start_month < today_first:
                    start_month = today_first

                months_allocated = 0
                while surplus > 0 and months_allocated < MAX_PREPAID_MONTHS:
                    alloc_amount = min(monthly_rent, surplus)
                    prepaid_allocations.append({
                        'month': start_month.isoformat(),
                        'amount': str(alloc_amount.quantize(Decimal('0.01'))),
                    })
                    surplus -= alloc_amount
                    start_month = (start_month.replace(day=28) + timedelta(days=4)).replace(day=1)
                    months_allocated += 1

        payment.balance_before = balance_before
        payment.balance_after = balance_after
        payment.prepaid_allocations = prepaid_allocations
        payment.status = 'confirmed'
        payment.approved_by = approved_by
        payment.approved_at = timezone.now()
        payment.save()

        lease.balance_due = balance_after
        ArrearsDetectionService.evaluate_lease(lease)
        lease.save(update_fields=['balance_due', 'is_in_arrears', 'arrears_days', 'updated_at'])

        # ─── NEW: send receipt email + notification ──────────────────────
        NotificationService.send_payment_receipt(payment)
        return payment

    @staticmethod
    def generate_receipt(payment) -> dict:
        lease = payment.lease
        balance_after = payment.balance_after

        if balance_after is None:
            status_label = 'PENDING APPROVAL'
        elif balance_after < 0:
            status_label = 'OVERPAID — CREDIT APPLIED'
        elif balance_after == 0:
            status_label = 'PAID IN FULL'
        else:
            status_label = 'PARTIAL PAYMENT'

        prepaid_months = []
        for alloc in (payment.prepaid_allocations or []):
            raw_month = alloc.get('month')
            try:
                month_val = date.fromisoformat(raw_month) if raw_month else None
            except (ValueError, TypeError):
                month_val = None
            prepaid_months.append({
                'month': month_val,
                'amount': str(alloc.get('amount', '0.00')),
            })

        return {
            'receipt_number': f"RCP-{str(payment.id)[:8].upper()}",
            'date': payment.payment_date.isoformat(),
            'tenant': lease.tenant.user.get_full_name(),
            'unit': f"{lease.unit.property.name} — Unit {lease.unit.unit_number}",
            'charge_type': payment.get_charge_type_display(),
            'amount_paid': str(payment.amount),
            'payment_method': payment.get_payment_method_display(),
            'reference': payment.reference_number,
            'balance_before': str(payment.balance_before) if payment.balance_before is not None else '0.00',
            'balance_after': str(payment.balance_after) if payment.balance_after is not None else '0.00',
            'period': payment.period_month.strftime('%B %Y') if payment.period_month else '',
            'status': status_label,
            'recorded_by': payment.recorded_by.get_full_name() if payment.recorded_by else '',
            'approved_by': payment.approved_by.get_full_name() if payment.approved_by else '',
            'prepaid_months': prepaid_months,
            'total_prepaid': str(payment.total_prepaid) if payment.is_prepaid else '0.00',
        }


class ArrearsDetectionService:
    GRACE_PERIOD_DAYS = 5

    @classmethod
    def evaluate_lease(cls, lease: Lease) -> bool:
        today = timezone.now().date()
        past_grace_period = today.day > cls.GRACE_PERIOD_DAYS

        if lease.balance_due and lease.balance_due > 0 and past_grace_period:
            lease.is_in_arrears = True
            lease.arrears_days = today.day - cls.GRACE_PERIOD_DAYS
        else:
            lease.is_in_arrears = False
            lease.arrears_days = 0

        return lease.is_in_arrears

    @classmethod
    def run_portfolio_check(cls, landlord) -> dict:
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
    @classmethod
    @transaction.atomic
    def create_and_split_bill(cls, property_obj, utility_type, total_amount,
                               billing_period, split_method='equal',
                               manual_allocations=None) -> UtilityBill:
        bill = UtilityBill.objects.create(
            property=property_obj,
            utility_type=utility_type,
            total_amount=Decimal(str(total_amount)),
            billing_period=billing_period,
            split_method=split_method,
            status='pending'
        )
        cls.split_bill(bill, manual_allocations=manual_allocations)
        return bill

    @classmethod
    @transaction.atomic
    def split_bill(cls, bill: UtilityBill, manual_allocations=None) -> list:
        if bill.status == 'split':
            raise ValueError('This bill has already been split.')

        occupied_units = bill.property.units.filter(
            status=UnitStatus.OCCUPIED
        ).select_related('current_lease')

        if not occupied_units.exists():
            raise ValueError('Cannot split utility bill: No occupied units found.')

        bill.allocations.all().delete()

        method = bill.split_method
        if method == 'equal':
            allocations = cls._split_equal(bill, occupied_units)
        elif method == 'by_area':
            allocations = cls._split_by_area(bill, occupied_units)
        elif method == 'by_occupants':
            allocations = cls._split_by_occupants(bill, occupied_units)
        elif method == 'manual':
            allocations = cls._split_manual(bill, occupied_units, manual_allocations)
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
        total_area = sum(u.floor_area_sqm for u in units if getattr(u, 'floor_area_sqm', None))
        if not total_area or total_area == 0:
            return UtilityBillService._split_equal(bill, units)

        allocations = []
        running_total = Decimal('0.00')
        units_list = list(units)

        for i, unit in enumerate(units_list):
            area = getattr(unit, 'floor_area_sqm', None) or (total_area / len(units_list))
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
        occupant_counts = {}
        for unit in units:
            lease = getattr(unit, 'current_lease', None)
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

    @staticmethod
    def _split_manual(bill, units, manual_allocations: list) -> list:
        if not manual_allocations:
            raise ValueError("Manual allocation list cannot be empty.")

        units_dict = {unit.id: unit for unit in units}
        allocations = []

        for item in manual_allocations:
            unit_id = item.get('unit_id')
            if unit_id not in units_dict:
                continue

            unit = units_dict[unit_id]
            amt = Decimal(str(item['amount'])).quantize(Decimal('0.01'))
            basis = Decimal(str(round(amt / bill.total_amount, 4))) if bill.total_amount > 0 else Decimal('0.00')

            allocations.append(UtilityAllocation.objects.create(
                bill=bill,
                unit=unit,
                allocated_amount=amt,
                allocation_basis=basis,
            ))

        return allocations