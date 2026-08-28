import uuid
from django.utils import timezone
from datetime import timedelta
from rest_framework import serializers
from .models import Tenant, Lease
from apps.authentication.models import User, UserRole
from apps.properties.models import Property, Unit, UnitStatus


class TenantSerializer(serializers.ModelSerializer):
    # Fields from User
    full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    nrc_number = serializers.CharField(source='user.nrc_passport', read_only=True)
    emergency_contact = serializers.CharField(source='user.emergency_contact_name', read_only=True)
    emergency_phone = serializers.CharField(source='user.emergency_contact_phone', read_only=True)
    emergency_relation = serializers.CharField(source='user.emergency_contact_relation', read_only=True)

    # New fields from User
    date_of_birth = serializers.DateField(source='user.date_of_birth', read_only=True)
    gender = serializers.CharField(source='user.gender', read_only=True)
    nationality = serializers.CharField(source='user.nationality', read_only=True)
    address = serializers.CharField(source='user.address', read_only=True)

    # Tenant fields
    tenant_id = serializers.CharField(read_only=True)
    nrc_verified = serializers.BooleanField(required=False, default=False)
    next_of_kin = serializers.JSONField(required=False, default=dict)

    # Lease‑derived fields
    unit = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    lease_status = serializers.SerializerMethodField()
    monthly_rent = serializers.SerializerMethodField()
    lease_start = serializers.SerializerMethodField()
    lease_end = serializers.SerializerMethodField()
    occupants = serializers.SerializerMethodField()
    move_in_date = serializers.SerializerMethodField()
    contract_status = serializers.SerializerMethodField()

    # First‑login flags
    password_changed = serializers.BooleanField(read_only=True)
    lease_accepted = serializers.BooleanField(read_only=True)

    class Meta:
        model = Tenant
        fields = [
            'id', 'user_id', 'full_name', 'email', 'phone', 'nrc_number',
            'emergency_contact', 'emergency_phone', 'emergency_relation',
            'employer_name', 'employer_phone',
            'unit', 'property_name', 'balance', 'lease_status', 'monthly_rent',
            'lease_start', 'lease_end',
            'password_changed', 'lease_accepted',
            'notes', 'created_at',
            'tenant_id', 'nrc_verified', 'next_of_kin',
            'date_of_birth', 'gender', 'nationality', 'address',
            'occupants', 'move_in_date', 'contract_status',
        ]
        read_only_fields = ['id', 'created_at', 'password_changed', 'lease_accepted', 'tenant_id']

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

    def get_lease_start(self, obj):
        lease = obj.active_lease
        return lease.start_date if lease else None

    def get_lease_end(self, obj):
        lease = obj.active_lease
        return lease.end_date if lease else None

    def get_occupants(self, obj):
        lease = obj.active_lease
        return lease.occupants if lease else 1

    def get_move_in_date(self, obj):
        lease = obj.active_lease
        return lease.move_in_date if lease else None

    def get_contract_status(self, obj):
        lease = obj.active_lease
        if not lease:
            return 'none'
        if lease.is_expired():
            return 'expired'
        return 'active'


class TenantCreateSerializer(serializers.Serializer):
    # Basic identity
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    nrc_passport = serializers.CharField(max_length=50, required=False, allow_blank=True)

    # Emergency / employer
    emergency_contact_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    emergency_contact_relation = serializers.CharField(max_length=50, required=False, allow_blank=True)
    employer_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    employer_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    # New fields
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(max_length=20, required=False, allow_blank=True)
    nationality = serializers.CharField(max_length=50, required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    next_of_kin = serializers.JSONField(required=False, default=dict)
    occupants = serializers.IntegerField(default=1, min_value=1)
    move_in_date = serializers.DateField(required=False, allow_null=True)

    # Property / Unit / Rent
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

            if monthly_rent is None:
                attrs['monthly_rent'] = unit.rent_amount
            else:
                if monthly_rent <= 0:
                    raise serializers.ValidationError("Monthly rent must be positive.")
                attrs['monthly_rent'] = monthly_rent

        return attrs

    def create(self, validated_data):
        unit = validated_data.pop('unit', None)
        monthly_rent = validated_data.pop('monthly_rent', 0)

        date_of_birth = validated_data.pop('date_of_birth', None)
        gender = validated_data.pop('gender', '')
        nationality = validated_data.pop('nationality', '')
        address = validated_data.pop('address', '')
        next_of_kin = validated_data.pop('next_of_kin', {})
        occupants = validated_data.pop('occupants', 1)
        move_in_date = validated_data.pop('move_in_date', None)

        # Build User data
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
            'date_of_birth': date_of_birth,
            'gender': gender,
            'nationality': nationality,
            'address': address,
        }
        user = User.objects.create_user(**user_data)

        # Create Tenant
        tenant = Tenant.objects.create(
            user=user,
            employer_name=validated_data.get('employer_name', ''),
            employer_phone=validated_data.get('employer_phone', ''),
            notes=validated_data.get('notes', ''),
            nrc_verified=False,
            next_of_kin=next_of_kin,
        )

        # Create Lease if unit provided
        if unit:
            unit.status = UnitStatus.OCCUPIED
            unit.current_tenant = user
            unit.save()

            from datetime import date
            start_date = date.today()
            # ✅ Auto‑generate end_date if not provided: one year from start
            end_date = validated_data.get('end_date')  # not in payload, so we set manually
            # We'll compute: if move_in_date is provided, use that as start; else today.
            # Also, if the user didn't provide move_in_date, we set it to start_date.
            if move_in_date is None:
                move_in_date = start_date

            # If the user didn't provide an end date, we set it to one year from start.
            # Since we don't have end_date in validated_data, we check if it was passed in the request.
            # For simplicity, we'll set it to one year from start_date by default.
            # But we can allow an optional 'end_date' field in the serializer if needed.
            # However, to keep simple, we'll compute a default of +365 days.
            default_end_date = start_date + timedelta(days=365)

            # If there's no end_date passed, we use the default.
            # We'll still allow the frontend to send an end_date if they want.
            # We'll read it from validated_data if present (we didn't add it to fields, so we add it now).
            # To make it work, we need to add 'end_date' to the serializer fields.
            # Since we didn't, we'll just compute and set it here.
            end_date = default_end_date  # always set default for now; user can override via frontend later.

            lease = Lease.objects.create(
                tenant=tenant,
                unit=unit,
                start_date=start_date,
                end_date=end_date,  # auto-generated
                monthly_rent=monthly_rent,
                deposit_amount=0,
                status='active',
                balance_due=monthly_rent,
                payment_frequency='Monthly',
                occupants=occupants,
                move_in_date=move_in_date,
            )

        return tenant


class LeaseSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.user.get_full_name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True)
    property_name = serializers.CharField(source='unit.property.name', read_only=True)

    class Meta:
        model = Lease
        fields = '__all__'
        read_only_fields = [
            'id', 'balance_due', 'is_in_arrears', 'arrears_days',
            'created_at', 'updated_at', 'lease_id'
        ]