from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from apps.authentication.permissions import IsLandlordOrReadOnly, IsLandlord
from .models import MaintenanceRequest
from .serializers import MaintenanceRequestSerializer, ResolveMaintenanceSerializer

class MaintenanceRequestViewSet(viewsets.ModelViewSet):
    serializer_class = MaintenanceRequestSerializer
    # Default permission: only landlords can list/update/delete; anyone can create
    permission_classes = [IsLandlordOrReadOnly]

    def get_permissions(self):
        """
        Override to allow creation for authenticated users (including tenants).
        """
        if self.action == 'create':
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        user = self.request.user
        qs = MaintenanceRequest.objects.select_related('tenant__user', 'unit__property')
        if user.is_admin:
            return qs.all()
        if user.is_landlord:
            return qs.filter(unit__property__owner=user)
        # Tenant: only their own requests
        return qs.filter(tenant__user=user)

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_tenant:
            # For tenants: auto-assign tenant and unit from their active lease
            tenant = user.tenant_profile  # assuming OneToOne relation
            active_lease = tenant.active_lease
            if not active_lease:
                raise serializers.ValidationError("You do not have an active lease to submit a maintenance request.")
            serializer.save(tenant=tenant, unit=active_lease.unit)
        else:
            # For landlords/admins: they specify tenant and unit in the request data
            # The serializer already validates they own the property (via the unit)
            serializer.save()

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        req = self.get_object()
        # Only landlords can resolve
        if not (request.user.is_admin or request.user.is_landlord):
            return Response({"detail": "You do not have permission to resolve this request."}, status=403)
        serializer = ResolveMaintenanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        req.status = 'resolved'
        req.resolution_notes = serializer.validated_data['resolution_notes']
        if serializer.validated_data.get('actual_cost'):
            req.actual_cost = serializer.validated_data['actual_cost']
        if serializer.validated_data.get('contractor'):
            req.assigned_to = serializer.validated_data['contractor']
        req.resolved_at = timezone.now()
        req.save()
        return Response({'status': 'resolved', 'id': str(req.id)})