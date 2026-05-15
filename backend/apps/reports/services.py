# apps/reports/services.py
from decimal import Decimal
from django.db.models import Sum, Count, Q, Avg
from django.utils import timezone
from datetime import date, timedelta
from apps.billing.models import Payment
from apps.tenants.models import Lease
from apps.properties.models import Property


class ReportService:
    """Read-only service — all methods return aggregated data for the dashboard."""

    @staticmethod
    def financial_summary(landlord, months: int = 12) -> dict:
        """
        Revenue vs Expenses for the last N months.
        Powers the main dashboard line chart.
        """
        cutoff = timezone.now().date() - timedelta(days=months * 30)

        payments = Payment.objects.filter(
            lease__unit__property__owner = landlord,
            payment_date__gte            = cutoff,
            status                       = 'confirmed',
        )

        total_collected = payments.aggregate(
            total=Sum('amount'))['total'] or Decimal('0.00')

        # Monthly breakdown for Chart.js
        from django.db.models.functions import TruncMonth
        monthly = (
            payments
            .annotate(month=TruncMonth('payment_date'))
            .values('month')
            .annotate(total=Sum('amount'))
            .order_by('month')
        )

        return {
            'total_collected':  str(total_collected),
            'months_covered':   months,
            'monthly_breakdown': [
                {
                    'month':  m['month'].strftime('%b %Y'),
                    'amount': str(m['total']),
                }
                for m in monthly
            ],
        }

    @staticmethod
    def arrears_report(landlord) -> dict:
        """All tenants in arrears — for the landlord's dashboard alert panel."""
        arrears_leases = Lease.objects.filter(
            status             = 'active',
            is_in_arrears      = True,
            unit__property__owner = landlord,
        ).select_related('tenant__user', 'unit__property')

        total_outstanding = arrears_leases.aggregate(
            total=Sum('balance_due'))['total'] or Decimal('0.00')

        return {
            'total_in_arrears':     arrears_leases.count(),
            'total_outstanding_zmw': str(total_outstanding),
            'tenants': [
                {
                    'tenant_name':    l.tenant.user.get_full_name(),
                    'phone':          l.tenant.user.phone,
                    'unit':           l.unit.unit_number,
                    'property':       l.unit.property.name,
                    'balance_due':    str(l.balance_due),
                    'arrears_days':   l.arrears_days,
                    'monthly_rent':   str(l.monthly_rent),
                }
                for l in arrears_leases.order_by('-balance_due')
            ],
        }

    @staticmethod
    def dashboard_kpis(landlord) -> dict:
        """
        Single endpoint powering the entire dashboard.
        Aggregates data from all domains in one call.
        """
        from apps.properties.services import PropertyService
        from apps.notifications.models import Notification

        portfolio     = PropertyService.get_portfolio_summary(landlord)
        arrears       = ReportService.arrears_report(landlord)
        finance       = ReportService.financial_summary(landlord, months=1)
        unread_notifs = Notification.objects.filter(
            user=landlord, is_read=False
        ).count()

        return {
            'portfolio':          portfolio,
            'this_month_revenue': finance['total_collected'],
            'arrears_count':      arrears['total_in_arrears'],
            'arrears_total':      arrears['total_outstanding_zmw'],
            'unread_notifications': unread_notifs,
        }