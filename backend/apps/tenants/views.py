from rest_framework import viewsets, permissions
from rest_framework.response import Response
from .models import Tenant, Lease
from .serializers import TenantSerializer, LeaseSerializer
from apps.authentication.permissions import IsLandlord, IsAdmin

class TenantViewSet(viewsets.ModelViewSet):
    serializer_class = TenantSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return Tenant.objects.select_related('user').prefetch_related('leases__unit__property')
        # Landlords see only tenants who have leases on their properties
        return Tenant.objects.filter(
            leases__unit__property__owner=user
        ).distinct().select_related('user').prefetch_related('leases__unit__property')

class LeaseViewSet(viewsets.ModelViewSet):
    serializer_class = LeaseSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        user = self.request.user
        qs = Lease.objects.select_related('tenant__user', 'unit__property')
        if user.is_admin:
            return qs.all()
        return qs.filter(unit__property__owner=user)