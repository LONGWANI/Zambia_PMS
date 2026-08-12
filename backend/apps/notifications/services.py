# apps/notifications/services.py
from .models import Notification, NotificationType


class NotificationService:
    """
    Centralised notification dispatcher.
    """

    @staticmethod
    def _create(user, notif_type, title, message,
                related_id=None, related_type=None):
        return Notification.objects.create(
            user=user,
            notification_type=notif_type,
            title=title,
            message=message,
            related_object_id=related_id,
            related_object_type=related_type,
        )

    @classmethod
    def notify_payment_received(cls, payment):
        """Notify tenant that a payment was recorded."""
        lease = payment.lease
        tenant_user = lease.tenant.user
        # Use the current balance from the lease (should be updated by PaymentService)
        balance_after = lease.balance_due
        cls._create(
            user=tenant_user,
            notif_type=NotificationType.PAYMENT_RECEIVED,
            title='Payment Received',
            message=(
                f"Your payment of ZMW {payment.amount} has been recorded. "
                f"Outstanding balance: ZMW {balance_after}."
            ),
            related_id=payment.id,
            related_type='payment',
        )

    @classmethod
    def notify_rent_overdue(cls, lease):
        tenant_user = lease.tenant.user
        cls._create(
            user=tenant_user,
            notif_type=NotificationType.RENT_OVERDUE,
            title='Rent Overdue',
            message=(
                f"Your rent of ZMW {lease.balance_due} is overdue by "
                f"{lease.arrears_days} days. Please pay immediately."
            ),
            related_id=lease.id,
            related_type='lease',
        )

    @classmethod
    def notify_utility_bill(cls, allocation):
        lease = allocation.unit.current_lease
        if not lease:
            return
        tenant_user = lease.tenant.user
        bill = allocation.bill
        period = bill.billing_period.strftime('%B %Y')
        cls._create(
            user=tenant_user,
            notif_type=NotificationType.UTILITY_BILL,
            title=f'{bill.get_utility_type_display()} Bill — {period}',
            message=(
                f"Your share of the {bill.get_utility_type_display().lower()} "
                f"bill for {period} is ZMW {allocation.allocated_amount}."
            ),
            related_id=allocation.id,
            related_type='utility_allocation',
        )

    @classmethod
    def notify_lease_expiry_warning(cls, lease, days_remaining: int):
        tenant_user = lease.tenant.user
        cls._create(
            user=tenant_user,
            notif_type=NotificationType.LEASE_EXPIRY,
            title='Lease Expiring Soon',
            message=(
                f"Your lease for Unit {lease.unit.unit_number} at "
                f"{lease.unit.property.name} expires in {days_remaining} days "
                f"on {lease.end_date}."
            ),
            related_id=lease.id,
            related_type='lease',
        )