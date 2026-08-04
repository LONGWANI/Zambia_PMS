import uuid
from django.db import models
from django.utils import timezone
from core.models import TimeStampedModel
from apps.authentication.models import User
from apps.properties.models import Unit

class Tenant(TimeStampedModel):
    # This acts as a secondary link to the User model if specific tenant-only metadata is needed.
    # Note: Core profile fields are now in the User model directly.
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='tenant_profile', unique=True)
    employer_name = models.CharField(max_length=200, blank=True)
    employer_phone = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'tenants'
        ordering = ['user__last_name', 'user__first_name']
        indexes = [models.Index(fields=['user_id'])]

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
    lease_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.RESTRICT, related_name='leases')
    unit = models.ForeignKey(Unit, on_delete=models.RESTRICT, related_name='leases')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    
    monthly_rent = models.DecimalField(max_digits=12, decimal_places=2)
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_frequency = models.CharField(max_length=20, default='Monthly')
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # ─── Digital Lease Agreement Fields ─────────────────────────────
    late_payment_policy = models.TextField(default="A late fee of 5% applies if rent is not received within 5 days of due date.")
    utility_responsibilities = models.TextField(default="Tenant is responsible for allocated utility splits.")
    maintenance_responsibilities = models.TextField(default="Tenant handles minor interior maintenance.")
    termination_conditions = models.TextField(default="30 days written notice required prior to termination.")
    special_conditions = models.TextField(blank=True, null=True)
    
    landlord_signature = models.CharField(max_length=150, blank=True, null=True)
    tenant_signature = models.CharField(max_length=150, blank=True, null=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    pdf_document = models.FileField(upload_to='leases/', null=True, blank=True)
    
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
        return f"Lease #{self.lease_id}: {self.tenant} @ {self.unit}"

    def is_expired(self):
        if self.end_date is None:
            return False
        return self.end_date < timezone.now().date()

    def remaining_days(self):
        if self.end_date is None:
            return None
        delta = self.end_date - timezone.now().date()
        return max(delta.days, 0)