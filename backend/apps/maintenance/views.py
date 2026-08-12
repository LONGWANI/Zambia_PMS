# apps/maintenance/views.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from apps.authentication.permissions import IsLandlordOrReadOnly
from .models import MaintenanceRequest
from .serializers import MaintenanceRequestSerializer, ResolveMaintenanceSerializer

# ─── Imports for notifications and expenses ─────────────────────────────
from apps.notifications.services import NotificationService
from apps.billing.models import Expense, ExpenseCategory  # <-- new import
import logging

logger = logging.getLogger(__name__)


class MaintenanceRequestViewSet(viewsets.ModelViewSet):
    serializer_class = MaintenanceRequestSerializer
    permission_classes = [IsLandlordOrReadOnly]

    def get_permissions(self):
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
            tenant = user.tenant_profile
            active_lease = tenant.active_lease
            if not active_lease:
                raise serializers.ValidationError("You do not have an active lease to submit a maintenance request.")
            request_obj = serializer.save(tenant=tenant, unit=active_lease.unit)
            # Notify landlord
            landlord = active_lease.unit.property.owner
            NotificationService._create(
                user=landlord,
                notif_type='maintenance_update',
                title='New Maintenance Request',
                message=f"{tenant.user.get_full_name()} has submitted a maintenance request: {request_obj.title}",
                related_id=request_obj.id,
                related_type='maintenance',
            )
            # Notify tenant (confirmation)
            NotificationService._create(
                user=user,
                notif_type='maintenance_update',
                title='Maintenance Request Received',
                message=f"Your request '{request_obj.title}' has been submitted and is pending review.",
                related_id=request_obj.id,
                related_type='maintenance',
            )
        else:
            # Landlords: tenant and unit must be in the validated data
            request_obj = serializer.save()
            tenant = request_obj.tenant
            if tenant:
                NotificationService._create(
                    user=tenant.user,
                    notif_type='maintenance_update',
                    title='Maintenance Request Created',
                    message=f"A maintenance request '{request_obj.title}' has been created for your unit.",
                    related_id=request_obj.id,
                    related_type='maintenance',
                )

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        req = self.get_object()
        if not (request.user.is_admin or request.user.is_landlord):
            return Response(
                {"detail": "You do not have permission to resolve this request."},
                status=status.HTTP_403_FORBIDDEN
            )

        resolver_serializer = ResolveMaintenanceSerializer(data=request.data)
        if not resolver_serializer.is_valid():
            return Response(resolver_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        req.status = 'resolved'
        req.resolution_notes = resolver_serializer.validated_data['resolution_notes']
        if resolver_serializer.validated_data.get('actual_cost'):
            req.actual_cost = resolver_serializer.validated_data['actual_cost']
        if resolver_serializer.validated_data.get('contractor'):
            req.assigned_to = resolver_serializer.validated_data['contractor']
        req.resolved_at = timezone.now()
        req.save()

        # ─── Create an expense record if actual_cost is provided ────
        actual_cost = resolver_serializer.validated_data.get('actual_cost')
        if actual_cost and actual_cost > 0:
            # Determine the property from the unit
            property_obj = req.unit.property if req.unit else None
            Expense.objects.create(
                amount=actual_cost,
                category=ExpenseCategory.MAINTENANCE,
                description=f"Maintenance: {req.title} – {req.resolution_notes[:100]}",
                expense_date=timezone.now().date(),
                maintenance=req,
                property=property_obj,
                recorded_by=request.user,
            )

        # ─── Notify tenant that the issue is resolved ────────────────
        NotificationService._create(
            user=req.tenant.user,
            notif_type='maintenance_update',
            title='Maintenance Request Resolved',
            message=f"Your request '{req.title}' has been resolved. Notes: {req.resolution_notes}",
            related_id=req.id,
            related_type='maintenance',
        )

        return Response({
            'status': 'resolved',
            'id': str(req.id),
            'message': 'Maintenance request resolved successfully.'
        })