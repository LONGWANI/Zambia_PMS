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

    WHY @transaction.atomic:
    Recording a payment touches two tables: creates a Payment row AND
    updates Lease.balance_due. If either fails, both must roll back —
    otherwise the ledger becomes inconsistent. atomic() ensures this.
    """

    @staticmethod
    @transaction.atomic
    def record_payment(lease, amount, method, reference,
                       payment_date, period_month, notes, recorded_by):
        """
        Records a manual payment and updates the lease ledger.
        Returns the created Payment object.
        """
        # Step 1: Snapshot the balance BEFORE this payment
        balance_before = lease.balance_due

        # Step 2: Calculate new balance
        # Positive balance_due = tenant owes. Payment reduces it.
        balance_after = balance_before - Decimal(str(amount))

        # Step 3: Create the immutable payment record
        payment = Payment.objects.create(
            lease            = lease,
            amount           = amount,
            balance_before   = balance_before,
            balance_after    = balance_after,
            payment_method   = method,
            reference_number = reference,
            payment_date     = payment_date,
            period_month     = period_month,
            notes            = notes,
            recorded_by      = recorded_by,
            status           = 'confirmed',
        )

        # Step 4: Update the lease ledger
        lease.balance_due = balance_after

        # Step 5: Run arrears detection — updates is_in_arrears flag
        ArrearsDetectionService.evaluate_lease(lease)

        lease.save()

        # Step 6: Fire notification to tenant
        NotificationService.notify_payment_received(payment)

        return payment

    @staticmethod
    def generate_receipt(payment) -> dict:
        """Returns a receipt-formatted dictionary for printing or PDF generation."""
        lease = payment.lease
        return {
            'receipt_number':  f"RCP-{str(payment.id)[:8].upper()}",
            'date':            payment.payment_date.isoformat(),
            'tenant':          lease.tenant.user.get_full_name(),
            'unit':            f"{lease.unit.property.name} — Unit {lease.unit.unit_number}",
            'amount_paid':     str(payment.amount),
            'payment_method':  payment.get_payment_method_display(),
            'reference':       payment.reference_number,
            'balance_before':  str(payment.balance_before),
            'balance_after':   str(payment.balance_after),
            'period':          payment.period_month.strftime('%B %Y') if payment.period_month else '',
            'status':          'PAID IN FULL' if payment.balance_after <= 0 else 'PARTIAL PAYMENT',
            'recorded_by':     payment.recorded_by.get_full_name() if payment.recorded_by else '',
        }
    # apps/billing/services.py (continued)

class ArrearsDetectionService:
    """
    Smart arrears detection — automatically flags tenants who are behind on rent.

    ALGORITHM:
    A lease is in arrears if balance_due > 0 AND
    today is past the 5th of the current month (grace period).

    This maps to real Zambian landlord practice: most landlords allow
    5 days after the 1st before chasing payment.
    """

    GRACE_PERIOD_DAYS = 5

    @classmethod
    def evaluate_lease(cls, lease: Lease) -> bool:
        """
        Evaluates and updates arrears status for a single lease.
        Called after every payment and on the daily scheduled job.
        Returns True if in arrears, False if clear.
        """
        today             = timezone.now().date()
        grace_cutoff      = today.replace(day=cls.GRACE_PERIOD_DAYS)
        past_grace_period = today > grace_cutoff

        if lease.balance_due > 0 and past_grace_period:
            # Calculate how many days overdue
            lease.is_in_arrears = True
            lease.arrears_days  = (today - grace_cutoff).days
        else:
            lease.is_in_arrears = False
            lease.arrears_days  = 0

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

        newly_flagged   = []
        newly_cleared   = []
        total_arrears   = Decimal('0.00')

        for lease in active_leases:
            was_in_arrears = lease.is_in_arrears
            now_in_arrears = cls.evaluate_lease(lease)
            lease.save(update_fields=['is_in_arrears', 'arrears_days'])

            if now_in_arrears:
                total_arrears += lease.balance_due
                if not was_in_arrears:
                    newly_flagged.append(lease)
                    # Send overdue notification (first time flag)
                    NotificationService.notify_rent_overdue(lease)

            elif was_in_arrears and not now_in_arrears:
                newly_cleared.append(lease)

        return {
            'checked':        active_leases.count(),
            'in_arrears':     active_leases.filter(is_in_arrears=True).count(),
            'newly_flagged':  len(newly_flagged),
            'newly_cleared':  len(newly_cleared),
            'total_arrears_zmw': str(total_arrears),
        }
    # apps/billing/services.py (continued)

class UtilityBillService:
    """
    The utility bill auto-split algorithm.

    REAL-WORLD PROBLEM: A landlord in Kamwala receives a single ZMW 1,200
    ZESCO bill for a block of 4 units. How is it split?

    Three strategies — all implemented:
    1. EQUAL:        Each unit pays 1/N of the total
    2. BY_AREA:      Units pay proportionally to their floor area (sqm)
    3. BY_OCCUPANTS: Units pay by number of adult occupants on the lease
    4. CUSTOM:       Landlord specifies weights manually (future feature)
    """

    @staticmethod
    @transaction.atomic
    def split_bill(bill: UtilityBill) -> list:
        """
        Splits a UtilityBill into UtilityAllocation rows.

        WHY atomic: creates N allocation rows + updates bill.status.
        If any allocation fails to save, the whole split is rolled back.
        The landlord gets a clear error rather than a partial split.
        """
        if bill.status == 'split':
            raise ValueError('This bill has already been split.')

        # Get all OCCUPIED units in the property
        occupied_units = bill.property.units.filter(
            status='occupied'
        ).select_related('current_lease')

        if not occupied_units.exists():
            raise ValueError('No occupied units found for this property.')

        # Delete any previous (failed) allocations before re-splitting
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

        # Notify all affected tenants
        for allocation in allocations:
            NotificationService.notify_utility_bill(allocation)

        return allocations

    @staticmethod
    def _split_equal(bill, units) -> list:
        """
        Equal split: total / N units.

        EDGE CASE — Rounding: ZMW 100 / 3 = ZMW 33.33... recurring.
        We give the first unit the rounding adjustment so the sum always
        equals the total. This is the standard accounting approach.
        """
        n          = units.count()
        share      = (bill.total_amount / n).quantize(Decimal('0.01'))
        remainder  = bill.total_amount - (share * n)  # rounding difference
        basis      = Decimal(str(round(1 / n, 4)))

        allocations = []
        for i, unit in enumerate(units):
            amount = share + remainder if i == 0 else share  # first unit absorbs remainder
            alloc  = UtilityAllocation.objects.create(
                bill             = bill,
                unit             = unit,
                allocated_amount = amount,
                allocation_basis = basis,
            )
            allocations.append(alloc)

        return allocations

    @staticmethod
    def _split_by_area(bill, units) -> list:
        """
        Area-based split: unit pays proportionally to its floor area.

        Example: Unit A = 60sqm, Unit B = 40sqm, total = 100sqm
        Unit A pays 60% of the bill, Unit B pays 40%.

        WHY: Fairer for mixed unit types (1BR and 3BR in the same block).
        A 3-bedroom unit uses more water/electricity than a studio.
        """
        total_area = sum(
            u.floor_area_sqm for u in units if u.floor_area_sqm
        )
        if not total_area or total_area == 0:
            # Fallback: if no areas defined, use equal split
            return UtilityBillService._split_equal(bill, units)

        allocations = []
        running_total = Decimal('0.00')

        units_list = list(units)
        for i, unit in enumerate(units_list):
            area  = unit.floor_area_sqm or (total_area / len(units_list))
            basis = Decimal(str(round(float(area / total_area), 4)))

            if i == len(units_list) - 1:
                # Last unit gets the exact remainder to avoid rounding drift
                amount = bill.total_amount - running_total
            else:
                amount = (bill.total_amount * basis).quantize(Decimal('0.01'))
                running_total += amount

            alloc = UtilityAllocation.objects.create(
                bill             = bill,
                unit             = unit,
                allocated_amount = amount,
                allocation_basis = basis,
            )
            allocations.append(alloc)

        return allocations

    @staticmethod
    def _split_by_occupants(bill, units) -> list:
        """
        Occupant-based split: unit pays proportionally to the number
        of people on its lease. Fairest for water bills.

        Occupant count defaults to 1 if lease not found.
        """
        # Count occupants per unit from active leases
        # (future: add occupant_count field to Lease model)
        occupant_counts = {}
        for unit in units:
            lease = unit.current_lease
            occupant_counts[unit.id] = getattr(lease, 'occupant_count', 1) or 1

        total_occupants = sum(occupant_counts.values())
        allocations     = []
        running_total   = Decimal('0.00')
        units_list      = list(units)

        for i, unit in enumerate(units_list):
            occupants = occupant_counts[unit.id]
            basis     = Decimal(str(round(occupants / total_occupants, 4)))

            if i == len(units_list) - 1:
                amount = bill.total_amount - running_total
            else:
                amount = (bill.total_amount * basis).quantize(Decimal('0.01'))
                running_total += amount

            alloc = UtilityAllocation.objects.create(
                bill             = bill,
                unit             = unit,
                allocated_amount = amount,
                allocation_basis = basis,
            )
            allocations.append(alloc)

        return allocations