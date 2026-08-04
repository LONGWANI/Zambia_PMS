from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from apps.authentication.permissions import IsLandlord, IsPropertyOwner
from .models import Property, Unit
from .serializers import PropertySerializer, UnitSerializer
from .services import PropertyService

class PropertyViewSet(viewsets.ModelViewSet):
    serializer_class = PropertySerializer
    permission_classes = [IsLandlord]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['city', 'district', 'property_type']
    search_fields = ['name', 'address', 'city']
    ordering_fields = ['name', 'created_at', 'city']

    def get_queryset(self):
        user = self.request.user
        qs = Property.objects.prefetch_related('units').select_related('owner')
        if user.is_admin:
            return qs.all()
        return qs.filter(owner=user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            return [IsLandlord(), IsPropertyOwner()]
        return [IsLandlord()]

    @action(detail=True, methods=['get'], url_path='occupancy')
    def occupancy(self, request, pk=None):
        property_obj = self.get_object()
        data = PropertyService.get_occupancy_summary(property_obj)
        return Response(data)

    # ─── NEW: List units for this property ──────────────────────────
    @action(detail=True, methods=['get'], url_path='units')
    def units(self, request, pk=None):
        """
        Returns all units belonging to this property.
        Accessible via /api/properties/{id}/units/
        """
        property_obj = self.get_object()

        # Ensure the user owns this property or is admin
        user = request.user
        if not (user.is_admin or property_obj.owner == user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have access to this property's units.")

        units = property_obj.units.all()
        serializer = UnitSerializer(units, many=True)
        return Response(serializer.data)


class UnitViewSet(viewsets.ModelViewSet):
    serializer_class = UnitSerializer
    permission_classes = [IsLandlord]
    filterset_fields = ['status', 'unit_type']
    ordering_fields = ['unit_number', 'rent_amount']

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return Unit.objects.select_related('property').all()
        return Unit.objects.filter(property__owner=user).select_related('property')

    def perform_create(self, serializer):
        property_id = self.request.data.get('property')
        property_obj = Property.objects.get(id=property_id)
        if property_obj.owner != self.request.user and not self.request.user.is_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not own this property.")
        serializer.save()