from django.db import models
from django.utils import timezone
from core.models import TimeStampedModel
from apps.authentication.models import User
from apps.properties.models import Unit

class Tenant(TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE,
                                related_name='tenant_profile', unique=True)  # ADD unique=True
    nrc_number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    emergency_contact = models.CharField(max_length=200, blank=True)
    emergency_phone = models.CharField(max_length=20, blank=True)
    employer_name = models.CharField(max_length=200, blank=True)
    employer_phone = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'tenants'
        ordering = ['user__last_name', 'user__first_name']
        indexes = [
            models.Index(fields=['user_id']),
            models.Index(fields=['nrc_number']),
        ]

    def __str__(self):
        return self.user.get_full_name()

    @property
    def active_lease(self):
        return self.leases.filter(status='active').first()

    @property
    def has_active_lease(self):
        return self.leases.filter(status='active').exists()

class LeaseStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    ACTIVE = 'active', 'Active'
    EXPIRED = 'expired', 'Expired'
    TERMINATED = 'terminated', 'Terminated'

class Lease(TimeStampedModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.RESTRICT, related_name='leases')
    unit = models.ForeignKey(Unit, on_delete=models.RESTRICT, related_name='leases')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    monthly_rent = models.DecimalField(max_digits=12, decimal_places=2)
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=LeaseStatus.choices, default=LeaseStatus.PENDING, db_index=True)
    is_in_arrears = models.BooleanField(default=False, db_index=True)
    arrears_days = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'leases'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['unit_id']),
            models.Index(fields=['status']),
            models.Index(fields=['is_in_arrears']),
        ]

    def __str__(self):
        return f"Lease: {self.tenant} @ {self.unit} ({self.start_date} → {self.end_date or 'open'})"

    def is_expired(self):
        if self.end_date is None:
            return False
        return self.end_date < timezone.now().date()

    def remaining_days(self):
        if self.end_date is None:
            return None
        delta = self.end_date - timezone.now().date()
        return max(delta.days, 0)