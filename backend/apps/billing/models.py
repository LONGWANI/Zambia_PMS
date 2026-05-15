# apps/billing/models.py
from django.db import models
from core.models import TimeStampedModel
from apps.tenants.models import Lease
from apps.properties.models import Property, Unit


class PaymentMethod(models.TextChoices):
    CASH          = 'cash',          'Cash'
    BANK_TRANSFER = 'bank_transfer', 'Bank Transfer'
    MOBILE_MONEY  = 'mobile_money',  'Mobile Money (MTN/Airtel)'
    CHEQUE        = 'cheque',        'Cheque'


class Payment(TimeStampedModel):
    """
    An immutable financial record of money received.

    KEY DESIGN DECISION — Immutability:
    Payments are NEVER updated after creation. If an error occurs, a reversal
    payment is created (status='reversed'). This creates a full audit trail —
    essential for financial reporting and dispute resolution.

    balance_before/after creates a bank-statement-style ledger per lease.
    """
    lease            = models.ForeignKey(Lease, on_delete=models.RESTRICT,
                                         related_name='payments')
    amount           = models.DecimalField(max_digits=12, decimal_places=2)
    balance_before   = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after    = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method   = models.CharField(max_length=50, choices=PaymentMethod.choices)
    reference_number = models.CharField(max_length=100, blank=True)
    payment_date     = models.DateField()
    period_month     = models.DateField(null=True, blank=True)  # which month it covers
    notes            = models.TextField(blank=True)
    recorded_by      = models.ForeignKey('authentication.User',
                                         on_delete=models.SET_NULL,
                                         null=True, related_name='recorded_payments')
    status           = models.CharField(max_length=20, default='confirmed',
                                        choices=[('confirmed','Confirmed'),
                                                 ('pending','Pending'),
                                                 ('reversed','Reversed')])

    class Meta:
        db_table = 'payments'
        ordering = ['-payment_date', '-created_at']
        # No updated_at override needed — TimeStampedModel has it, but payments
        # should never be updated. Enforce this in the service layer.

    def __str__(self):
        return f"ZMW {self.amount} — {self.lease} on {self.payment_date}"


class UtilityType(models.TextChoices):
    ELECTRICITY = 'electricity', 'Electricity (ZESCO)'
    WATER       = 'water',       'Water (LWSC)'
    INTERNET    = 'internet',    'Internet'
    GARBAGE     = 'garbage',     'Garbage Collection'
    OTHER       = 'other',       'Other'


class SplitMethod(models.TextChoices):
    EQUAL      = 'equal',        'Equal Split'
    BY_AREA    = 'by_area',      'By Floor Area'
    BY_PERSONS = 'by_occupants', 'By Number of Occupants'
    CUSTOM     = 'custom',       'Custom Weights'


class UtilityBill(TimeStampedModel):
    """
    A utility bill for an entire property (e.g. ZMW 850 ZESCO bill for the whole block).
    The UtilityBillSplitService creates UtilityAllocation rows to distribute the cost.

    billing_period is stored as the FIRST DAY of the month (e.g. 2025-03-01).
    This makes date arithmetic simple and consistent.
    """
    property       = models.ForeignKey(Property, on_delete=models.RESTRICT,
                                       related_name='utility_bills')
    utility_type   = models.CharField(max_length=50, choices=UtilityType.choices)
    total_amount   = models.DecimalField(max_digits=12, decimal_places=2)
    split_method   = models.CharField(max_length=30, choices=SplitMethod.choices,
                                      default=SplitMethod.EQUAL)
    billing_period = models.DateField()   # First of the billing month
    due_date       = models.DateField(null=True, blank=True)
    invoice_number = models.CharField(max_length=100, blank=True)
    status         = models.CharField(max_length=20, default='pending',
                                      choices=[('pending','Pending'),
                                               ('split','Split'),
                                               ('paid','Paid'),
                                               ('overdue','Overdue')])
    notes          = models.TextField(blank=True)

    class Meta:
        db_table = 'utility_bills'
        ordering = ['-billing_period']
        unique_together = [['property', 'utility_type', 'billing_period']]

    def __str__(self):
        period = self.billing_period.strftime('%B %Y')
        return f"{self.get_utility_type_display()} — {self.property.name} ({period})"


class UtilityAllocation(TimeStampedModel):
    """
    One unit's share of a utility bill.
    Created by the UtilityBillSplitService — never created directly.

    allocation_basis stores the fraction used (e.g. 0.3333 for equal 3-way split,
    or 45.5 sqm for area-based split). This makes the calculation auditable.
    """
    bill             = models.ForeignKey(UtilityBill, on_delete=models.CASCADE,
                                         related_name='allocations')
    unit             = models.ForeignKey(Unit, on_delete=models.RESTRICT,
                                         related_name='utility_allocations')
    allocated_amount = models.DecimalField(max_digits=12, decimal_places=2)
    allocation_basis = models.DecimalField(max_digits=10, decimal_places=4,
                                           null=True, blank=True)
    is_paid          = models.BooleanField(default=False)
    paid_at          = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'utility_allocations'
        unique_together = [['bill', 'unit']]

    def __str__(self):
        return f"ZMW {self.allocated_amount} — {self.unit} for {self.bill}"