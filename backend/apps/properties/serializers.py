# apps/properties/serializers.py
from rest_framework import serializers
from .models import Property, Unit


class UnitSerializer(serializers.ModelSerializer):
    status_display       = serializers.CharField(source='get_status_display',
                                                  read_only=True)
    current_tenant_name  = serializers.SerializerMethodField()

    class Meta:
        model  = Unit
        fields = ['id', 'unit_number', 'unit_type', 'floor_area_sqm',
                  'bedrooms', 'bathrooms', 'rent_amount', 'status',
                  'status_display', 'current_tenant_name', 'created_at']
        read_only_fields = ['id', 'status', 'created_at']

    def get_current_tenant_name(self, obj):
        lease = obj.current_lease
        if lease:
            return lease.tenant.user.get_full_name()
        return None


class PropertySerializer(serializers.ModelSerializer):
    """
    WHY nested units on read but not write:
    Writing units alongside a property in one request couples two domain
    operations — harder to validate, harder to roll back. Keep them separate.
    On GET, include units for convenience (avoids a second request on the detail page).
    """
    units           = UnitSerializer(many=True, read_only=True)
    owner_name      = serializers.CharField(source='owner.get_full_name',
                                             read_only=True)
    occupancy_rate  = serializers.FloatField(read_only=True)
    occupied_units  = serializers.IntegerField(read_only=True)
    unit_count      = serializers.SerializerMethodField()

    class Meta:
        model  = Property
        fields = ['id', 'name', 'address', 'city', 'district', 'property_type',
                  'total_units', 'unit_count', 'occupied_units', 'occupancy_rate',
                  'owner_name', 'description', 'units', 'created_at']
        read_only_fields = ['id', 'owner_name', 'occupancy_rate',
                             'occupied_units', 'created_at']

    def get_unit_count(self, obj):
        return obj.units.count()

    def validate_total_units(self, value):
        if value < 1:
            raise serializers.ValidationError('A property must have at least 1 unit.')
        return value