from rest_framework import serializers
from .models import MaintenanceRequest

class MaintenanceRequestSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.user.get_full_name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True)
    property_name = serializers.CharField(source='unit.property.name', read_only=True)

    class Meta:
        model = MaintenanceRequest
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'resolved_at']

class ResolveMaintenanceSerializer(serializers.Serializer):
    resolution_notes = serializers.CharField(required=True)
    actual_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    contractor = serializers.CharField(max_length=200, required=False, allow_blank=True)