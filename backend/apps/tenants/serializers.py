import uuid
from rest_framework import serializers
from .models import Tenant, Lease
from apps.authentication.models import User, UserRole
from apps.properties.models import Property, Unit, UnitStatus


class TenantSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    nrc_number = serializers.CharField(source='user.nrc_passport', read_only=True)
    emergency_contact = serializers.CharField(source='user.emergency_contact_name', read_only=True)
    emergency_phone = serializers.CharField(source='user.emergency_contact_phone', read_only=True)
    emergency_relation = serializers.CharField(source='user.emergency_contact_relation', read_only=True)

    unit = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    lease_status = serializers.SerializerMethodField()
    monthly_rent = serializers.SerializerMethodField()   # new

    class Meta:
        model = Tenant
        fields = [
            'id', 'user_id', 'full_name', 'email', 'phone', 'nrc_number',
            'emergency_contact', 'emergency_phone', 'emergency_relation',
            'employer_name', 'employer_phone',
            'unit', 'property_name', 'balance', 'lease_status', 'monthly_rent',
            'notes', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_unit(self, obj):
        lease = obj.active_lease
        return lease.unit.unit_number if lease else None

    def get_property_name(self, obj):
        lease = obj.active_lease
        return lease.unit.property.name if lease else None

    def get_balance(self, obj):
        lease = obj.active_lease
        return str(lease.balance_due) if lease else '0.00'

    def get_lease_status(self, obj):
        lease = obj.active_lease
        return lease.status if lease else None

    def get_monthly_rent(self, obj):
        lease = obj.active_lease
        return str(lease.monthly_rent) if lease else '0.00'


class TenantCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    nrc_passport = serializers.CharField(max_length=50, required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    emergency_contact_relation = serializers.CharField(max_length=50, required=False, allow_blank=True)
    employer_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    employer_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    property_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    unit_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    monthly_rent = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("User with this email already exists.")
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        user = request.user if request else None

        property_id = attrs.get('property_id')
        unit_number = attrs.get('unit_number', '').strip()
        monthly_rent = attrs.get('monthly_rent')

        if property_id and unit_number:
            try:
                property_uuid = uuid.UUID(str(property_id))
            except ValueError:
                raise serializers.ValidationError("Invalid property ID format. Expected a UUID.")

            try:
                property_obj = Property.objects.get(id=property_uuid)
            except Property.DoesNotExist:
                raise serializers.ValidationError(
                    f"Property with ID {property_id} not found. Please refresh the property list."
                )

            if user and not user.is_admin:
                if property_obj.owner != user:
                    raise serializers.ValidationError("You do not own this property.")

            try:
                unit = Unit.objects.get(property=property_obj, unit_number=unit_number)
            except Unit.DoesNotExist:
                raise serializers.ValidationError(
                    f"Unit '{unit_number}' not found in property '{property_obj.name}'."
                )

            if unit.status != UnitStatus.VACANT:
                raise serializers.ValidationError(
                    f"Unit '{unit_number}' is currently {unit.status} and not available."
                )

            attrs['unit'] = unit

            # If monthly_rent not provided, use unit's rent_amount
            if monthly_rent is None:
                attrs['monthly_rent'] = unit.rent_amount
            else:
                # validate positive
                if monthly_rent <= 0:
                    raise serializers.ValidationError("Monthly rent must be positive.")
                attrs['monthly_rent'] = monthly_rent

        return attrs

    def create(self, validated_data):
        unit = validated_data.pop('unit', None)
        monthly_rent = validated_data.pop('monthly_rent', 0)

        user_data = {
            'email': validated_data['email'],
            'password': validated_data['password'],
            'first_name': validated_data['first_name'],
            'last_name': validated_data['last_name'],
            'phone': validated_data.get('phone', ''),
            'nrc_passport': validated_data.get('nrc_passport', ''),
            'emergency_contact_name': validated_data.get('emergency_contact_name', ''),
            'emergency_contact_phone': validated_data.get('emergency_contact_phone', ''),
            'emergency_contact_relation': validated_data.get('emergency_contact_relation', ''),
            'role': UserRole.TENANT,
        }
        user = User.objects.create_user(**user_data)

        tenant = Tenant.objects.create(
            user=user,
            employer_name=validated_data.get('employer_name', ''),
            employer_phone=validated_data.get('employer_phone', ''),
            notes=validated_data.get('notes', ''),
        )

        if unit:
            unit.status = UnitStatus.OCCUPIED
            unit.current_tenant = user
            unit.save()

            from datetime import date
            Lease.objects.create(
                tenant=tenant,
                unit=unit,
                start_date=date.today(),
                end_date=None,
                monthly_rent=monthly_rent,   # use provided or unit's rent
                deposit_amount=0,
                status='active',
                balance_due=monthly_rent,
                payment_frequency='Monthly',
            )

        return tenant


class LeaseSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.user.get_full_name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True)
    property_name = serializers.CharField(source='unit.property.name', read_only=True)

    class Meta:
        model = Lease
        fields = '__all__'
        read_only_fields = ['id', 'balance_due', 'is_in_arrears', 'arrears_days', 'created_at', 'updated_at']