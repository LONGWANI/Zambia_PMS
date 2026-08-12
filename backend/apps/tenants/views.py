from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import models
from .models import Tenant, Lease
from .serializers import TenantSerializer, TenantCreateSerializer, LeaseSerializer
from apps.authentication.permissions import IsLandlord, IsAdmin
import logging

logger = logging.getLogger(__name__)


class TenantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLandlord]

    def get_permissions(self):
        # Allow any authenticated user to access the 'current' action
        if self.action == 'current':
            return [permissions.IsAuthenticated()]
        return [IsLandlord()]

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
            qs = Tenant.objects.filter(
                models.Q(leases__unit__property__owner=user) |
                models.Q(user__assigned_unit__property__owner=user)
            ).distinct().select_related('user').prefetch_related('leases__unit__property')

        logger.info(f"Tenant queryset count: {qs.count()}")
        return qs

    def create(self, request, *args, **kwargs):
        logger.info(f"Creating tenant with data: {request.data}")
        serializer = self.get_serializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            logger.error(f"Validation errors: {serializer.errors}")
        serializer.is_valid(raise_exception=True)
        tenant = serializer.save()
        logger.info(f"Tenant created with ID: {tenant.id}")
        logger.info(f"Leases for tenant: {tenant.leases.count()}")

        output_serializer = TenantSerializer(tenant)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='current')
    def current(self, request):
        """Return the Tenant profile for the authenticated user."""
        user = request.user
        if not user.is_authenticated:
            return Response({"detail": "Not authenticated"}, status=401)
        try:
            tenant = Tenant.objects.get(user=user)
        except Tenant.DoesNotExist:
            return Response({"detail": "No tenant profile found."}, status=404)
        serializer = self.get_serializer(tenant)
        return Response(serializer.data)


class LeaseViewSet(viewsets.ModelViewSet):
    serializer_class = LeaseSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        user = self.request.user
        qs = Lease.objects.select_related('tenant__user', 'unit__property')
        if user.is_admin:
            return qs.all()
        return qs.filter(unit__property__owner=user)