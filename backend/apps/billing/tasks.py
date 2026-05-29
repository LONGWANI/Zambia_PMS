import logging
from celery import shared_task
from django.contrib.auth import get_user_model
from .services import ArrearsDetectionService
from apps.notifications.services import NotificationService
from apps.tenants.models import Lease
from django.utils import timezone

logger = logging.getLogger(__name__)
User = get_user_model()

@shared_task
def run_daily_arrears_check():
    landlords = User.objects.filter(role='landlord', is_active=True)
    results = []
    for landlord in landlords:
        try:
            result = ArrearsDetectionService.run_portfolio_check(landlord)
            results.append({landlord.email: result})
        except Exception as e:
            logger.error(f"Arrears check failed for {landlord.email}: {e}")
    return results

@shared_task
def send_lease_expiry_warnings():
    today = timezone.now().date()
    for days in [30, 7]:
        target_date = today + timezone.timedelta(days=days)
        expiring_leases = Lease.objects.filter(status='active', end_date=target_date).select_related('tenant__user', 'unit__property')
        for lease in expiring_leases:
            try:
                NotificationService.notify_lease_expiry_warning(lease, days)
            except Exception as e:
                logger.error(f"Lease expiry warning failed for lease {lease.id}: {e}")