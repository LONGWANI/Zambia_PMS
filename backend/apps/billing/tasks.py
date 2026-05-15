# apps/billing/tasks.py
from celery import shared_task
from django.contrib.auth import get_user_model
from .services import ArrearsDetectionService
from apps.notifications.services import NotificationService
from apps.tenants.models import Lease
from django.utils import timezone

User = get_user_model()


@shared_task
def run_daily_arrears_check():
    """
    Runs every day at 08:00 Africa/Lusaka time.
    Checks all active leases across all landlords.
    Configured in Celery beat schedule in settings.
    """
    landlords = User.objects.filter(role='landlord', is_active=True)
    results   = []
    for landlord in landlords:
        result = ArrearsDetectionService.run_portfolio_check(landlord)
        results.append({landlord.email: result})
    return results


@shared_task
def send_lease_expiry_warnings():
    """
    Runs weekly. Warns tenants whose lease expires within 30 or 7 days.
    Gives them time to negotiate renewal — a key Zambian property pain point.
    """
    today    = timezone.now().date()
    warnings = [30, 7]  # days before expiry

    for days in warnings:
        target_date = today + timezone.timedelta(days=days)
        expiring_leases = Lease.objects.filter(
            status   = 'active',
            end_date = target_date,
        ).select_related('tenant__user', 'unit__property')

        for lease in expiring_leases:
            NotificationService.notify_lease_expiry_warning(lease, days)


# config/settings/base.py — add this
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'daily-arrears-check': {
        'task':     'apps.billing.tasks.run_daily_arrears_check',
        'schedule': crontab(hour=8, minute=0),  # 08:00 Lusaka time
    },
    'weekly-lease-expiry-warnings': {
        'task':     'apps.billing.tasks.send_lease_expiry_warnings',
        'schedule': crontab(day_of_week=1, hour=9, minute=0),  # Monday 09:00
    },
}
CELERY_TIMEZONE = 'Africa/Lusaka'