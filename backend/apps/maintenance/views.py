from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from apps.authentication.permissions import IsLandlordOrReadOnly
from .models import MaintenanceRequest
from .serializers import MaintenanceRequestSerializer, ResolveMaintenanceSerializer

class MaintenanceRequestViewSet(viewsets.ModelViewSet):
    serializer_class = MaintenanceRequestSerializer
    permission_classes = [IsLandlordOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        qs = MaintenanceRequest.objects.select_related('tenant__user', 'unit__property')
        if user.is_admin:
            return qs.all()
        if user.is_landlord:
            return qs.filter(unit__property__owner=user)
        # Tenant sees only their own requests
        return qs.filter(tenant__user=user)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        req = self.get_object()
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