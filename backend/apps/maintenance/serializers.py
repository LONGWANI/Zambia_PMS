from rest_framework import serializers
from .models import MaintenanceRequest
from apps.tenants.models import Tenant
from apps.properties.models import Unit


class MaintenanceRequestSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.user.get_full_name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True)
    property_name = serializers.CharField(source='unit.property.name', read_only=True)

    # Override to make these fields optional – they will be set by the view
    tenant = serializers.PrimaryKeyRelatedField(
        queryset=Tenant.objects.all(),
        required=False,
        allow_null=True
    )
    unit = serializers.PrimaryKeyRelatedField(
        queryset=Unit.objects.all(),
        required=False,
        allow_null=True
    )

    class Meta:
        model = MaintenanceRequest
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'resolved_at']

    def validate(self, data):
        request = self.context.get('request')
        if not request:
            return data

        user = request.user

        # Skip validation on updates (e.g., resolving)
        if self.instance is not None:
            return data

        # Tenants: no validation needed – tenant/unit set in perform_create
        if user.is_tenant:
            return data

        # Landlords: require tenant and unit
        tenant = data.get('tenant')
        unit = data.get('unit')
        if not tenant or not unit:
            raise serializers.ValidationError("Both tenant and unit must be provided for landlords.")
        if unit.property.owner != user and not user.is_admin:
            raise serializers.ValidationError("You do not own this unit's property.")
        return data


class ResolveMaintenanceSerializer(serializers.Serializer):
    resolution_notes = serializers.CharField(required=True)
    actual_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    contractor = serializers.CharField(max_length=200, required=False, allow_blank=True)