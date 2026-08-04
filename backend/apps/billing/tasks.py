# backend/apps/tasks.py
import calendar
import logging
from datetime import date
from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from .services import ArrearsDetectionService
from apps.notifications.services import NotificationService
from apps.tenants.models import Lease

logger = logging.getLogger(__name__)
User = get_user_model()


def _get_lease_due_dates(lease, today: date):
    """
    Helper to calculate upcoming and previous rent due dates safely.
    Handles leap years, short months, and year boundary shifts (Dec -> Jan).
    """
    start_day = lease.start_date.day if getattr(lease, 'start_date', None) else 1

    # 1. Calculate next upcoming due date
    target_year = today.year
    target_month = today.month

    if today.day > start_day:
        if target_month == 12:
            target_month = 1
            target_year += 1
        else:
            target_month += 1

    max_days_next = calendar.monthrange(target_year, target_month)[1]
    next_due_day = min(start_day, max_days_next)
    next_due_date = date(target_year, target_month, next_due_day)
    days_until_due = (next_due_date - today).days

    # 2. Calculate previous (most recent) due date for overdue tracking
    prev_year = today.year
    prev_month = today.month

    if today.day < start_day:
        if prev_month == 1:
            prev_month = 12
            prev_year -= 1
        else:
            prev_month -= 1

    max_days_prev = calendar.monthrange(prev_year, prev_month)[1]
    prev_due_day = min(start_day, max_days_prev)
    prev_due_date = date(prev_year, prev_month, prev_due_day)
    days_overdue = (today - prev_due_date).days

    return next_due_date, days_until_due, prev_due_date, days_overdue


@shared_task
def process_rent_due_reminders():
    """
    Runs daily via Celery/Cron to dispatch rent due notifications.
    Fires at 14, 7, 3, 1, 0 days before due date, and every 3 days overdue.
    """
    today = timezone.now().date()
    active_leases = Lease.objects.filter(
        status='active',
        tenant__isnull=False
    ).select_related('tenant__user', 'unit__property')

    processed_count = 0
    notifications_sent = 0

    for lease in active_leases:
        processed_count += 1
        tenant_user = lease.tenant.user
        rent_amount = getattr(
            lease, 'monthly_rent',
            getattr(lease, 'rent_amount', getattr(lease.unit, 'rent_amount', '0.00'))
        )
        balance_due = getattr(lease, 'balance_due', rent_amount)

        next_due_date, days_until_due, prev_due_date, days_overdue = _get_lease_due_dates(lease, today)
        notification_msg = None
        title = "Rent Due Reminder"

        # Reminder logic: 14, 7, 3, 1 days prior
        if days_until_due in [14, 7, 3, 1]:
            notification_msg = (
                f"Reminder: Your rent of ZMW {rent_amount} is due in "
                f"{days_until_due} days on {next_due_date.strftime('%d %b %Y')}."
            )
        # Due today
        elif days_until_due == 0:
            title = "Urgent: Rent Due Today"
            notification_msg = f"Urgent: Your rent of ZMW {rent_amount} is due today!"
        # Overdue check: Every 3 days past due date if an unpaid balance exists
        elif balance_due > 0 and days_overdue > 0 and (days_overdue % 3 == 0):
            title = "OVERDUE RENT ALERT"
            notification_msg = (
                f"OVERDUE ALERT: Your rent payment is {days_overdue} days overdue. "
                f"Please settle ZMW {balance_due} immediately."
            )

        if notification_msg:
            try:
                # 1. Create In-App Notification
                if hasattr(NotificationService, '_create'):
                    NotificationService._create(
                        user=tenant_user,
                        notif_type='rent_due',
                        title=title,
                        message=notification_msg,
                        related_id=lease.id,
                        related_type='lease'
                    )

                # 2. Log Mock Email/SMS Transmission
                logger.info(
                    f"[MOCK EMAIL/SMS SENT] To: {tenant_user.email} | "
                    f"Phone: {getattr(tenant_user, 'phone_number', 'N/A')} | "
                    f"Message: {notification_msg}"
                )
                print(f"[MOCK EMAIL/SMS SENT] To: {tenant_user.email} | Message: {notification_msg}")
                notifications_sent += 1

            except Exception as e:
                logger.error(f"Failed to send rent reminder for Lease #{lease.id}: {e}")

    return {
        'status': 'success',
        'leases_evaluated': processed_count,
        'notifications_sent': notifications_sent
    }


@shared_task
def run_daily_arrears_check():
    """Evaluates arrears status for all landlords in the portfolio."""
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
    """Dispatches warning notifications for leases expiring in 30 or 7 days."""
    today = timezone.now().date()
    for days in [30, 7]:
        target_date = today + timezone.timedelta(days=days)
        expiring_leases = Lease.objects.filter(
            status='active',
            end_date=target_date
        ).select_related('tenant__user', 'unit__property')

        for lease in expiring_leases:
            try:
                NotificationService.notify_lease_expiry_warning(lease, days)
            except Exception as e:
                logger.error(f"Lease expiry warning failed for lease {lease.id}: {e}")