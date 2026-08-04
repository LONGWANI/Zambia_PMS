from rest_framework import serializers
from .models import Property, Unit, PropertyType, UnitStatus


class PropertyTypeField(serializers.ChoiceField):
    """
    Custom field that normalises common variations of property types
    (case, spaces) to the exact choice stored in the database.
    """
    def __init__(self, **kwargs):
        kwargs['choices'] = PropertyType.choices
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        if data is None:
            return None
        if not isinstance(data, str):
            self.fail('invalid', input=data)
        # Remove leading/trailing spaces and normalise case
        raw = data.strip()
        # Mapping from lower-cased input to the correct database value
        mapping = {
            'residential': 'residential',
            'commercial': 'commercial',
            'mixed': 'mixed',
            'mixed use': 'mixed',
            'apartment': 'Apartment',
        }
        normalised = mapping.get(raw.lower(), raw)
        # Validate against actual choices
        valid_choices = [choice[0] for choice in PropertyType.choices]
        if normalised not in valid_choices:
            self.fail('invalid_choice', input=raw, choices=valid_choices)
        return normalised


class UnitSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    current_tenant_name = serializers.SerializerMethodField()
    # Alias rent_amount as monthly_rent for frontend compatibility
    monthly_rent = serializers.DecimalField(
        source='rent_amount',
        max_digits=12,
        decimal_places=2,
        read_only=True
    )

    class Meta:
        model = Unit
        fields = [
            'id', 'unit_number', 'unit_type', 'floor_area_sqm',
            'bedrooms', 'bathrooms', 'rent_amount', 'monthly_rent',
            'status', 'status_display', 'current_tenant_name', 'created_at'
        ]
        read_only_fields = ['id', 'status', 'created_at', 'monthly_rent']

    def get_current_tenant_name(self, obj):
        lease = obj.current_lease
        if lease:
            return lease.tenant.user.get_full_name()
        return None


class PropertySerializer(serializers.ModelSerializer):
    units = UnitSerializer(many=True, read_only=True)
    owner_name = serializers.CharField(source='owner.get_full_name', read_only=True)
    occupancy_rate = serializers.FloatField(read_only=True)
    occupied_units = serializers.IntegerField(read_only=True)
    unit_count = serializers.SerializerMethodField()
    property_type = PropertyTypeField()

    class Meta:
        model = Property
        fields = [
            'id', 'name', 'address', 'city', 'district', 'property_type',
            'total_units', 'unit_count', 'occupied_units', 'occupancy_rate',
            'owner_name', 'description', 'units', 'created_at'
        ]
        read_only_fields = [
            'id', 'owner_name', 'occupancy_rate', 'occupied_units', 'created_at'
        ]

    def get_unit_count(self, obj):
        return obj.units.count()

    def validate_total_units(self, value):
        if value < 1:
            raise serializers.ValidationError('A property must have at least 1 unit.')
        return value

    def create(self, validated_data):
        """
        Override create to automatically generate Unit records
        for each unit specified by total_units.
        """
        total_units = validated_data.get('total_units', 0)
        # Save the property first (without units)
        property_obj = super().create(validated_data)

        # Create individual Unit records with simple numbering: "1", "2", …
        for i in range(1, total_units + 1):
            Unit.objects.create(
                property=property_obj,
                unit_number=str(i),
                status=UnitStatus.VACANT,      # 'available'
                rent_amount=0.00,              # default – can be updated later
                unit_type='other',             # default type
                bedrooms=1,
                bathrooms=1,
            )
        return property_obj