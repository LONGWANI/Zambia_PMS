# apps/tenants/models.py
from django.db import models
from django.utils import timezone
from core.models import TimeStampedModel
from apps.authentication.models import User
from apps.properties.models import Unit


class Tenant(TimeStampedModel):
    """
    Zambia-specific tenant profile extending the base User.
    NRC (National Registration Card) is required for formal lease agreements
    under Zambian property law.
    """
    user              = models.OneToOneField(User, on_delete=models.CASCADE,
                                             related_name='tenant_profile')
    nrc_number        = models.CharField(max_length=20, unique=True,
                                         null=True, blank=True)
    emergency_contact = models.CharField(max_length=200, blank=True)
    emergency_phone   = models.CharField(max_length=20, blank=True)
    employer_name     = models.CharField(max_length=200, blank=True)
    employer_phone    = models.CharField(max_length=20, blank=True)
    notes             = models.TextField(blank=True)  # landlord's private notes

    class Meta:
        db_table = 'tenants'
        ordering = ['user__last_name', 'user__first_name']

    def __str__(self):
        return self.user.get_full_name()

    @property
    def active_lease(self):
        return self.leases.filter(status='active').first()

    @property
    def has_active_lease(self):
        return self.leases.filter(status='active').exists()


class LeaseStatus(models.TextChoices):
    PENDING    = 'pending',    'Pending'
    ACTIVE     = 'active',     'Active'
    EXPIRED    = 'expired',    'Expired'
    TERMINATED = 'terminated', 'Terminated'


class Lease(TimeStampedModel):
    """
    The legal agreement binding a Tenant to a Unit.

    balance_due is the running ledger balance:
      - Positive: tenant owes money (most common)
      - Zero: fully paid up
      - Negative: tenant is in credit (overpaid)

    is_in_arrears and arrears_days are set by the ArrearsDetectionService,
    not by the model itself. The model stores; the service decides.
    This respects Single Responsibility Principle.
    """
    tenant         = models.ForeignKey(Tenant, on_delete=models.RESTRICT,
                                       related_name='leases')
    unit           = models.ForeignKey(Unit, on_delete=models.RESTRICT,
                                       related_name='leases')
    start_date     = models.DateField()
    end_date       = models.DateField(null=True, blank=True)  # None = open-ended
    monthly_rent   = models.DecimalField(max_digits=12, decimal_places=2)
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2,
                                         default=0)
    balance_due    = models.DecimalField(max_digits=12, decimal_places=2,
                                         default=0)
    status         = models.CharField(max_length=20, choices=LeaseStatus.choices,
                                      default=LeaseStatus.PENDING, db_index=True)
    is_in_arrears  = models.BooleanField(default=False, db_index=True)
    arrears_days   = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'leases'
        ordering = ['-created_at']

    def __str__(self):
        return (f"Lease: {self.tenant} @ {self.unit} "
                f"({self.start_date} → {self.end_date or 'open'})")

    def is_expired(self):
        """Check if lease end_date has passed."""
        if self.end_date is None:
            return False
        return self.end_date < timezone.now().date()

    def remaining_days(self):
        """Days until lease expiry. None if open-ended."""
        if self.end_date is None:
            return None
        delta = self.end_date - timezone.now().date()
        return max(delta.days, 0)