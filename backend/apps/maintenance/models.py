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
    assigned_to      = models.CharField(max_length=200, blank=True)
    estimated_cost   = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    actual_cost      = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    resolved_at      = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'maintenance_requests'
        ordering = ['-priority', '-created_at']

    def __str__(self):
        return f"[{self.priority.upper()}] {self.title} — {self.unit}"