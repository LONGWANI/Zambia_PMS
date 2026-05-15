# apps/maintenance/models.py
from django.db import models
from core.models import TimeStampedModel
from apps.tenants.models import Tenant
from apps.properties.models import Unit


class Priority(models.TextChoices):
    LOW       = 'low',       'Low'
    MEDIUM    = 'medium',    'Medium'
    HIGH      = 'high',      'High'
    EMERGENCY = 'emergency', 'Emergency'


class RequestStatus(models.TextChoices):
    OPEN        = 'open',        'Open'
    IN_PROGRESS = 'in_progress', 'In Progress'
    RESOLVED    = 'resolved',    'Resolved'
    CLOSED      = 'closed',      'Closed'
    REJECTED    = 'rejected',    'Rejected'


class MaintenanceRequest(TimeStampedModel):
    """
    A tenant's report of a maintenance issue.
    Workflow: Tenant submits (OPEN) → Landlord assigns (IN_PROGRESS)
              → Work done (RESOLVED) → Tenant confirms (CLOSED)

    estimated_cost and actual_cost allow landlords to track maintenance
    spend per unit — feeds directly into the Expenses module.
    """
    tenant           = models.ForeignKey(Tenant, on_delete=models.RESTRICT,
                                         related_name='maintenance_requests')
    unit             = models.ForeignKey(Unit, on_delete=models.RESTRICT,
                                         related_name='maintenance_requests')
    title            = models.CharField(max_length=200)
    description      = models.TextField()
    priority         = models.CharField(max_length=20, choices=Priority.choices,
                                        default=Priority.MEDIUM, db_index=True)
    status           = models.CharField(max_length=20, choices=RequestStatus.choices,
                                        default=RequestStatus.OPEN, db_index=True)
    assigned_to      = models.CharField(max_length=200, blank=True)  # contractor name
    estimated_cost   = models.DecimalField(max_digits=12, decimal_places=2,
                                           null=True, blank=True)
    actual_cost      = models.DecimalField(max_digits=12, decimal_places=2,
                                           null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    resolved_at      = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'maintenance_requests'
        ordering = ['-priority', '-created_at']

    def __str__(self):
        return f"[{self.priority.upper()}] {self.title} — {self.unit}"


# apps/notifications/models.py
class NotificationType(models.TextChoices):
    RENT_DUE          = 'rent_due',          'Rent Due'
    RENT_OVERDUE      = 'rent_overdue',      'Rent Overdue'
    PAYMENT_RECEIVED  = 'payment_received',  'Payment Received'
    MAINTENANCE_UPDATE = 'maintenance_update', 'Maintenance Update'
    UTILITY_BILL      = 'utility_bill',      'Utility Bill'
    LEASE_EXPIRY      = 'lease_expiry',      'Lease Expiry Warning'
    GENERAL           = 'general',           'General'


class Notification(TimeStampedModel):
    from apps.authentication.models import User

    user                = models.ForeignKey(User, on_delete=models.CASCADE,
                                            related_name='notifications')
    notification_type   = models.CharField(max_length=50,
                                           choices=NotificationType.choices)
    title               = models.CharField(max_length=200)
    message             = models.TextField()
    related_object_id   = models.UUIDField(null=True, blank=True)   # FK to trigger source
    related_object_type = models.CharField(max_length=50, blank=True)
    is_read             = models.BooleanField(default=False, db_index=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.notification_type}] → {self.user}"