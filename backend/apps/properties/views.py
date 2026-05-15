# apps/properties/views.py
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from apps.authentication.permissions import IsLandlord, IsPropertyOwner
from .models import Property, Unit
from .serializers import PropertySerializer, UnitSerializer
from .services import PropertyService


class PropertyViewSet(viewsets.ModelViewSet):
    """
    WHY ModelViewSet: gives us list, create, retrieve, update, destroy
    for free — just override what needs custom behaviour.

    Automatic actions:
      GET    /api/properties/           → list()
      POST   /api/properties/           → create()
      GET    /api/properties/{id}/      → retrieve()
      PUT    /api/properties/{id}/      → update()
      PATCH  /api/properties/{id}/      → partial_update()
      DELETE /api/properties/{id}/      → destroy()

    Plus our custom: GET /api/properties/{id}/occupancy/
    """
    serializer_class   = PropertySerializer
    permission_classes = [IsLandlord]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter,
                          filters.OrderingFilter]
    filterset_fields   = ['city', 'district', 'property_type']
    search_fields      = ['name', 'address', 'city']
    ordering_fields    = ['name', 'created_at', 'city']

    def get_queryset(self):
        """
        Critical: landlords only see THEIR OWN properties.
        Admins see everything.
        This is enforced at the queryset level — not just permissions —
        so pagination, filtering, and search all respect it automatically.
        """
        user = self.request.user
        qs   = Property.objects.prefetch_related('units').select_related('owner')
        if user.is_admin:
            return qs.all()
        return qs.filter(owner=user)

    def perform_create(self, serializer):
        """Automatically set the owner to the requesting landlord."""
        serializer.save(owner=self.request.user)

    def get_permissions(self):
        """Destroy requires ownership check in addition to landlord role."""
        if self.action in ['update', 'partial_update', 'destroy']:
            return [IsLandlord(), IsPropertyOwner()]
        return [IsLandlord()]

    @action(detail=True, methods=['get'], url_path='occupancy')
    def occupancy(self, request, pk=None):
        """
        GET /api/properties/{id}/occupancy/
        Returns detailed occupancy breakdown — powers the dashboard pie chart.
        """
        property_obj = self.get_object()
        data = PropertyService.get_occupancy_summary(property_obj)
        return Response(data)


class UnitViewSet(viewsets.ModelViewSet):
    """Units are always accessed in the context of their property."""
    serializer_class   = UnitSerializer
    permission_classes = [IsLandlord]
    filterset_fields   = ['status', 'unit_type']
    ordering_fields    = ['unit_number', 'rent_amount']

    def get_queryset(self):
        """Only units belonging to properties this landlord owns."""
        user = self.request.user
        if user.is_admin:
            return Unit.objects.select_related('property').all()
        return Unit.objects.filter(
            property__owner=user
        ).select_related('property')

    def perform_create(self, serializer):
        """Validate that the property belongs to this landlord before creating."""
        property_id = self.request.data.get('property')
        property_obj = Property.objects.get(id=property_id)
        if property_obj.owner != self.request.user and not self.request.user.is_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not own this property.")
        serializer.save()