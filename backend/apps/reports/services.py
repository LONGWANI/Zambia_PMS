# apps/reports/services.py
from decimal import Decimal
from django.db.models import Sum, Count, Q, Avg
from django.db.models.functions import TruncMonth
from django.utils import timezone
from datetime import date, timedelta
from apps.billing.models import Payment, Expense
from apps.tenants.models import Lease
from apps.properties.models import Property


class ReportService:
    """Read-only service — all methods return aggregated data for dashboards and reports."""

    @staticmethod
    def financial_summary(user, months: int = 12) -> dict:
        """
        Revenue vs Expenses for the last N months.
        Powers the main dashboard line chart.
        """
        cutoff = timezone.now().date() - timedelta(days=months * 30)

        # ─── Revenue (payments) ──────────────────────────────────────
        payments = Payment.objects.filter(
            payment_date__gte=cutoff,
            status='confirmed',
        )
        if not user.is_admin:
            payments = payments.filter(lease__unit__property__owner=user)

        total_collected = payments.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        monthly_revenue = (
            payments
            .annotate(month=TruncMonth('payment_date'))
            .values('month')
            .annotate(total=Sum('amount'))
            .order_by('month')
        )

        # ─── Expenses (from Expense model) ──────────────────────────
        expenses = Expense.objects.filter(expense_date__gte=cutoff)
        if not user.is_admin:
            # If the user is a landlord, only show expenses for their properties
            expenses = expenses.filter(property__owner=user)

        monthly_expenses = (
            expenses
            .annotate(month=TruncMonth('expense_date'))
            .values('month')
            .annotate(total=Sum('amount'))
            .order_by('month')
        )

        # ─── Merge revenue and expenses into a single monthly dict ──
        month_dict = {}
        for item in monthly_revenue:
            month = item['month'].strftime('%b %Y')
            month_dict[month] = {
                'month': month,
                'total_revenue': float(item['total']),
                'total_expenses': 0,
            }
        for item in monthly_expenses:
            month = item['month'].strftime('%b %Y')
            if month in month_dict:
                month_dict[month]['total_expenses'] = float(item['total'])
            else:
                month_dict[month] = {
                    'month': month,
                    'total_revenue': 0,
                    'total_expenses': float(item['total']),
                }

        # Sort by month
        monthly_breakdown = sorted(month_dict.values(), key=lambda x: x['month'])

        return {
            'total_collected': str(total_collected),
            'months_covered': months,
            'monthly_breakdown': [
                {
                    'month': item['month'],
                    'amount': str(item['total_revenue']),  # keep for backward compatibility
                    'total_revenue': item['total_revenue'],
                    'total_expenses': item['total_expenses'],
                    'net_profit': item['total_revenue'] - item['total_expenses'],
                }
                for item in monthly_breakdown
            ],
        }

    @staticmethod
    def arrears_report(user) -> dict:
        """All tenants in arrears — for the landlord's dashboard alert panel."""
        leases = Lease.objects.filter(
            status='active',
            is_in_arrears=True,
        )
        if not user.is_admin:
            leases = leases.filter(unit__property__owner=user)

        leases = leases.select_related('tenant__user', 'unit__property')

        total_outstanding = leases.aggregate(
            total=Sum('balance_due')
        )['total'] or Decimal('0.00')

        return {
            'total_in_arrears': leases.count(),
            'total_outstanding_zmw': str(total_outstanding),
            'tenants': [
                {
                    'tenant_name': l.tenant.user.get_full_name(),
                    'phone': l.tenant.user.phone,
                    'unit': l.unit.unit_number,
                    'property': l.unit.property.name,
                    'balance_due': str(l.balance_due),
                    'arrears_days': l.arrears_days,
                    'monthly_rent': str(l.monthly_rent),
                }
                for l in leases.order_by('-balance_due')
            ],
        }

    @staticmethod
    def _calculate_change(monthly_breakdown: list) -> float:
        """
        Calculate month-over-month revenue change percentage.
        Uses the last two months in the breakdown.
        """
        if len(monthly_breakdown) < 2:
            return 0.0
        current = float(monthly_breakdown[-1]['amount'])
        previous = float(monthly_breakdown[-2]['amount'])
        if previous == 0:
            return 0.0
        return round(((current - previous) / previous) * 100, 1)

    @staticmethod
    def dashboard_kpis(user) -> dict:
        """
        Single endpoint powering the entire dashboard.
        Returns portfolio summary, revenue, arrears, monthly trend, and notifications.
        """
        from apps.properties.services import PropertyService
        from apps.notifications.models import Notification

        portfolio = PropertyService.get_portfolio_summary(user)
        arrears = ReportService.arrears_report(user)
        finance_1m = ReportService.financial_summary(user, months=1)
        finance_6m = ReportService.financial_summary(user, months=6)
        unread_notifs = Notification.objects.filter(
            user=user, is_read=False
        ).count()

        return {
            'portfolio': portfolio,
            'this_month_revenue': finance_1m['total_collected'],
            'arrears_count': arrears['total_in_arrears'],
            'arrears_total': arrears['total_outstanding_zmw'],
            'revenue_change_percent': ReportService._calculate_change(finance_6m['monthly_breakdown']),
            'monthly_revenue': finance_6m['monthly_breakdown'],
            'unread_notifications': unread_notifs,
        }