from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import models
from django.utils import timezone
from .models import Tenant, Lease
from .serializers import TenantSerializer, TenantCreateSerializer, LeaseSerializer
from apps.authentication.permissions import IsLandlord, IsAdmin
from apps.properties.models import Unit, UnitStatus
import logging

logger = logging.getLogger(__name__)


class TenantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsLandlord]

    def get_permissions(self):
        if self.action in ['current', 'accept_lease', 'mark_password_changed']:
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

    @action(detail=False, methods=['post'], url_path='accept-lease')
    def accept_lease(self, request):
        """Mark the lease agreement as accepted for the current tenant."""
        user = request.user
        if not user.is_authenticated or not user.is_tenant:
            return Response({"detail": "Only tenants can accept a lease."}, status=403)

        try:
            tenant = user.tenant_profile
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant profile not found."}, status=404)

        if tenant.lease_accepted:
            return Response({"detail": "Lease already accepted."}, status=400)

        if not tenant.active_lease:
            return Response({"detail": "You do not have an active lease to accept."}, status=400)

        tenant.lease_accepted = True
        tenant.lease_accepted_at = timezone.now()
        tenant.save()
        return Response({"detail": "Lease agreement accepted successfully."}, status=200)

    @action(detail=False, methods=['post'], url_path='mark-password-changed')
    def mark_password_changed(self, request):
        """Record that the tenant has changed their temporary password."""
        user = request.user
        if not user.is_authenticated or not user.is_tenant:
            return Response({"detail": "Only tenants can perform this action."}, status=403)

        try:
            tenant = user.tenant_profile
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant profile not found."}, status=404)

        tenant.password_changed = True
        tenant.save()
        return Response({"detail": "Password change recorded."}, status=200)

    @action(detail=True, methods=['post'], url_path='assign-unit')
    def assign_unit(self, request, pk=None):
        logger.info(f"Assign-unit called for tenant {pk} with data: {request.data}")
        tenant = self.get_object()
        unit_id = request.data.get('unit_id')
        if not unit_id:
            return Response({'error': 'unit_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_unit = Unit.objects.get(id=unit_id)
        except Unit.DoesNotExist:
            return Response({'error': 'Unit not found'}, status=status.HTTP_404_NOT_FOUND)

        # Check if unit is vacant (or available)
        if new_unit.status not in [UnitStatus.VACANT, UnitStatus.AVAILABLE]:
            return Response({'error': f'Unit is not available (current status: {new_unit.status})'},
                            status=status.HTTP_400_BAD_REQUEST)

        current_lease = tenant.active_lease
        if not current_lease:
            return Response({'error': 'Tenant has no active lease to reassign'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Free the old unit
        old_unit = current_lease.unit
        old_unit.status = UnitStatus.VACANT
        old_unit.current_tenant = None
        old_unit.save()

        # Move the lease to the new unit
        current_lease.unit = new_unit
        current_lease.save()

        # Occupy the new unit
        new_unit.status = UnitStatus.OCCUPIED
        new_unit.current_tenant = tenant.user
        new_unit.save()

        logger.info(f"Tenant {tenant.id} reassigned from unit {old_unit.id} to {new_unit.id}")
        return Response({'status': 'Unit reassigned successfully'}, status=status.HTTP_200_OK)


class LeaseViewSet(viewsets.ModelViewSet):
    serializer_class = LeaseSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        user = self.request.user
        qs = Lease.objects.select_related('tenant__user', 'unit__property')
        if user.is_admin:
            return qs.all()
        return qs.filter(unit__property__owner=user)