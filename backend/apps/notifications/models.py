from django.db import models
from core.models import TimeStampedModel
from apps.authentication.models import User

class NotificationType(models.TextChoices):
    RENT_DUE           = 'rent_due',           'Rent Due'
    RENT_OVERDUE       = 'rent_overdue',       'Rent Overdue'
    PAYMENT_RECEIVED   = 'payment_received',   'Payment Received'
    MAINTENANCE_UPDATE = 'maintenance_update', 'Maintenance Update'
    UTILITY_BILL       = 'utility_bill',       'Utility Bill'
    LEASE_EXPIRY       = 'lease_expiry',       'Lease Expiry Warning'
    GENERAL            = 'general',            'General'

class Notification(TimeStampedModel):
    # Unique related_name avoids clashes with other models
    user                = models.ForeignKey(User, on_delete=models.CASCADE,
                                            related_name='general_notifications')
    notification_type   = models.CharField(max_length=50, choices=NotificationType.choices)
    title               = models.CharField(max_length=200)
    message             = models.TextField()
    related_object_id   = models.UUIDField(null=True, blank=True)
    related_object_type = models.CharField(max_length=50, blank=True)
    is_read             = models.BooleanField(default=False, db_index=True)

    class Meta:
        # Unique db_table avoids 'notifications' table collision
        db_table = 'app_notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user_id', 'is_read']),
        ]

    def __str__(self):
        return f"[{self.notification_type}] → {self.user}"