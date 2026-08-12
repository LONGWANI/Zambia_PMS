from django.db import models
from core.models import TimeStampedModel
from apps.tenants.models import Lease
from apps.properties.models import Property, Unit
from apps.authentication.models import User


class PaymentProvider(models.TextChoices):
    PAYPAL = 'paypal', 'PayPal Sandbox'
    STRIPE = 'stripe', 'Stripe Test Mode'
    FLUTTERWAVE = 'flutterwave', 'Flutterwave Test Mode'
    PAYSTACK = 'paystack', 'Paystack Test Mode'


class PaymentGatewaySettings(TimeStampedModel):
    landlord = models.OneToOneField(User, on_delete=models.CASCADE, related_name='gateway_settings')
    provider = models.CharField(max_length=20, choices=PaymentProvider.choices, default=PaymentProvider.PAYSTACK)
    account_name = models.CharField(max_length=150)
    merchant_id_or_email = models.CharField(max_length=150)
    public_key = models.CharField(max_length=255, blank=True)
    secret_key = models.CharField(max_length=255, blank=True)
    is_enabled = models.BooleanField(default=True)

    class Meta:
        db_table = 'payment_gateway_settings'


class PaymentMethod(models.TextChoices):
    CASH          = 'cash',          'Cash'
    BANK_TRANSFER = 'bank_transfer', 'Bank Transfer'
    MOBILE_MONEY  = 'mobile_money',  'Mobile Money (MTN/Airtel)'
    CHEQUE        = 'cheque',        'Cheque'
    GATEWAY       = 'sandbox_gateway', 'Online Sandbox Gateway'


class Payment(TimeStampedModel):
    lease            = models.ForeignKey(Lease, on_delete=models.RESTRICT, related_name='payments')
    charge_type      = models.CharField(
        max_length=30,
        choices=[('rent', 'Rent'), ('utility', 'Utility'), ('maintenance', 'Maintenance'), ('deposit', 'Security Deposit')],
        default='rent'
    )
    amount           = models.DecimalField(max_digits=12, decimal_places=2)
    balance_before   = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after    = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method   = models.CharField(max_length=50, choices=PaymentMethod.choices)
    reference_number = models.CharField(max_length=100, blank=True)
    payment_date     = models.DateField()
    due_date         = models.DateField(null=True, blank=True)
    period_month     = models.DateField(null=True, blank=True)
    notes            = models.TextField(blank=True)
    receipt_pdf      = models.FileField(upload_to='receipts/', null=True, blank=True)
    recorded_by      = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='recorded_payments')
    status           = models.CharField(
        max_length=20,
        default='pending',
        choices=[('confirmed', 'Confirmed'), ('pending', 'Pending'), ('reversed', 'Reversed')]
    )

    class Meta:
        db_table = 'payments'
        ordering = ['-payment_date', '-created_at']

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
    property       = models.ForeignKey(Property, on_delete=models.RESTRICT, related_name='utility_bills')
    utility_type   = models.CharField(max_length=50, choices=UtilityType.choices)
    total_amount   = models.DecimalField(max_digits=12, decimal_places=2)
    split_method   = models.CharField(max_length=30, choices=SplitMethod.choices, default=SplitMethod.EQUAL)
    billing_period = models.DateField()
    due_date       = models.DateField(null=True, blank=True)
    invoice_number = models.CharField(max_length=100, blank=True)
    status         = models.CharField(
        max_length=20,
        default='pending',
        choices=[('pending', 'Pending'), ('split', 'Split'), ('paid', 'Paid'), ('overdue', 'Overdue')]
    )
    notes          = models.TextField(blank=True)

    class Meta:
        db_table = 'utility_bills'
        ordering = ['-billing_period']
        unique_together = [['property', 'utility_type', 'billing_period']]

    def __str__(self):
        return f"{self.get_utility_type_display()} — {self.property.name}"


class UtilityAllocation(TimeStampedModel):
    bill             = models.ForeignKey(UtilityBill, on_delete=models.CASCADE, related_name='allocations')
    unit             = models.ForeignKey(Unit, on_delete=models.RESTRICT, related_name='utility_allocations')
    tenant           = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    allocated_amount = models.DecimalField(max_digits=12, decimal_places=2)
    allocation_basis = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    is_paid          = models.BooleanField(default=False)
    paid_at          = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'utility_allocations'
        unique_together = [['bill', 'unit']]

    def __str__(self):
        return f"ZMW {self.allocated_amount} — {self.unit}"


# ─── NEW: Expense model for maintenance costs ───────────────────────────────

class ExpenseCategory(models.TextChoices):
    MAINTENANCE = 'maintenance', 'Maintenance & Repairs'
    UTILITIES   = 'utilities',   'Utilities'
    TAXES       = 'taxes',       'Property Taxes'
    INSURANCE   = 'insurance',   'Insurance'
    OTHER       = 'other',       'Other'


class Expense(TimeStampedModel):
    """
    Records operating expenses (maintenance, utilities, etc.)
    """
    amount          = models.DecimalField(max_digits=12, decimal_places=2)
    category        = models.CharField(max_length=50, choices=ExpenseCategory.choices, default=ExpenseCategory.MAINTENANCE)
    description     = models.TextField(blank=True)
    expense_date    = models.DateField()
    maintenance     = models.ForeignKey(
        'maintenance.MaintenanceRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses'
    )
    property        = models.ForeignKey(
        'properties.Property',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses'
    )
    recorded_by     = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_expenses'
    )

    class Meta:
        db_table = 'billing_expenses'
        ordering = ['-expense_date']
        indexes = [
            models.Index(fields=['expense_date']),
            models.Index(fields=['category']),
        ]

    def __str__(self):
        return f"{self.category} – {self.amount} ({self.expense_date})"