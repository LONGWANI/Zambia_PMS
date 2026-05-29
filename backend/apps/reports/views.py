from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from apps.notifications.models import Notification

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Dynamically pulls unread notifications for the dashboard alert count
        unread_notifications = Notification.objects.filter(user=request.user, is_read=False).count()
        
        data = {
            "summary": {
                "total_properties": 0,
                "active_leases": 0,
                "occupancy_rate": 0,
                "total_revenue": 0,
                "pending_maintenance": 0,
                "unread_notifications": unread_notifications
            }
        }
        return Response(data, status=status.HTTP_200_OK)

class FinancialReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {
            "financials": {
                "total_collected": 0,
                "total_pending": 0,
                "expenses": 0,
                "net_income": 0
            }
        }
        return Response(data, status=status.HTTP_200_OK)

class ArrearsReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {
            "arrears": []
        }
        return Response(data, status=status.HTTP_200_OK)