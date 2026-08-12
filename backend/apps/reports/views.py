# apps/reports/views.py
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .services import ReportService

logger = logging.getLogger(__name__)

class DashboardView(APIView):
    """Returns portfolio occupancy summary for the frontend."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            from apps.properties.services import PropertyService
            user = request.user
            portfolio = PropertyService.get_portfolio_summary(user)
            return Response({
                'portfolio': {
                    'total_units': portfolio.get('total_units', 0),
                    'occupied_units': portfolio.get('occupied_units', 0),
                }
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"DashboardView error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class FinancialReportView(APIView):
    """Returns 6‑month revenue breakdown (and expenses if available)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            months = request.query_params.get('months', 6)
            months = int(months) if months.isdigit() else 6
            user = request.user
            finance = ReportService.financial_summary(user, months=months)

            monthly_summary = []
            for item in finance.get('monthly_breakdown', []):
                # Use the new fields from the service
                monthly_summary.append({
                    'month': item['month'],
                    'total_revenue': item['total_revenue'],
                    'total_expenses': item['total_expenses'],
                    'net_profit': item['net_profit'],
                })

            return Response({'monthly_summary': monthly_summary}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"FinancialReportView error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ArrearsReportView(APIView):
    """Returns a list of all tenants currently in arrears."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            arrears = ReportService.arrears_report(user)
            arrears_list = []
            for t in arrears.get('tenants', []):
                arrears_list.append({
                    'tenant_name': t['tenant_name'],
                    'property_name': t['property'],
                    'unit_number': t['unit'],
                    'balance_due': t['balance_due'],
                    'days_overdue': t['arrears_days'],
                })
            return Response({'arrears_list': arrears_list}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"ArrearsReportView error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)