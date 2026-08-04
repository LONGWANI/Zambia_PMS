from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from django.db import models
from .models import Tenant, Lease
from .serializers import TenantSerializer, TenantCreateSerializer, LeaseSerializer
from apps.authentication.permissions import IsLandlord, IsAdmin
import logging

logger = logging.getLogger(__name__)


class TenantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLandlord]

    def get_serializer_class(self):
        if self.action == 'create':
            return TenantCreateSerializer
        return TenantSerializer

    def get_queryset(self):
        user = self.request.user
        logger.info(f"Tenant list requested by user: {user} (is_admin: {user.is_admin})")

        if user.is_admin:
            qs = Tenant.objects.select_related('user').prefetch_related('leases__unit__property')
        else:
            # For landlords, include tenants that:
            # - have a lease on any unit belonging to the landlord's properties, OR
            # - are directly assigned as current_tenant on a unit belonging to the landlord
            qs = Tenant.objects.filter(
                models.Q(leases__unit__property__owner=user) |
                models.Q(user__assigned_unit__property__owner=user)
            ).distinct().select_related('user').prefetch_related('leases__unit__property')

        count = qs.count()
        logger.info(f"Tenant queryset count: {count}")
        return qs

    def create(self, request, *args, **kwargs):
        logger.info(f"Creating tenant with data: {request.data}")
        serializer = self.get_serializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            logger.error(f"Validation errors: {serializer.errors}")
        serializer.is_valid(raise_exception=True)
        tenant = serializer.save()
        logger.info(f"Tenant created with ID: {tenant.id}")

        # Also log the lease count for this tenant after creation
        lease_count = tenant.leases.count()
        logger.info(f"Leases for tenant: {lease_count}")

        output_serializer = TenantSerializer(tenant)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class LeaseViewSet(viewsets.ModelViewSet):
    serializer_class = LeaseSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        user = self.request.user
        qs = Lease.objects.select_related('tenant__user', 'unit__property')
        if user.is_admin:
            return qs.all()
        return qs.filter(unit__property__owner=user)