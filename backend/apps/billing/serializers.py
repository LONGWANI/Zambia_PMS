# apps/billing/serializers.py
from rest_framework import serializers
from .models import Payment, UtilityBill, UtilityAllocation
from apps.tenants.models import Lease, Tenant


class PaymentCreateSerializer(serializers.ModelSerializer):
    tenant_id = serializers.PrimaryKeyRelatedField(
        queryset=Tenant.objects.all(),
        write_only=True,
    )
    utility_allocation = serializers.PrimaryKeyRelatedField(
        queryset=UtilityAllocation.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Payment
        fields = [
            'tenant_id',
            'charge_type',
            'amount',
            'payment_method',
            'reference_number',
            'payment_date',
            'period_month',
            'notes',
            'utility_allocation',
        ]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Payment amount must be positive.')
        return value

    def validate_utility_allocation(self, obj):
        if not obj:
            return obj
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not obj.lease_id:
            raise serializers.ValidationError(
                'This utility charge has not been posted to a tenant lease.'
            )
        if obj.is_paid:
            raise serializers.ValidationError('This utility charge has already been settled.')
        if user and not user.is_admin and obj.bill.property.owner_id != user.id:
            raise serializers.ValidationError(
                'This utility charge does not belong to one of your properties.'
            )
        return obj

    def validate(self, attrs):
        tenant = attrs.get('tenant_id')
        if not tenant:
            raise serializers.ValidationError({'tenant_id': 'Tenant is required.'})

        lease = tenant.active_lease
        if not lease:
            raise serializers.ValidationError(
                {'tenant_id': 'This tenant has no active lease.'}
            )
        if lease.status != 'active':
            raise serializers.ValidationError(
                {'tenant_id': "Tenant's lease is not active."}
            )

        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and not user.is_admin and lease.unit.property.owner_id != user.id:
            raise serializers.ValidationError(
                {'tenant_id': 'This tenant is not on one of your properties.'}
            )

        alloc = attrs.get('utility_allocation')
        if alloc and alloc.lease_id != lease.id:
            raise serializers.ValidationError(
                {'utility_allocation': 'This utility charge does not belong to this tenant\'s active lease.'}
            )

        attrs['lease'] = lease
        return attrs


class PaymentReadSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(
        source='lease.tenant.user.get_full_name', read_only=True
    )
    unit_number = serializers.CharField(
        source='lease.unit.unit_number', read_only=True
    )
    property_name = serializers.CharField(
        source='lease.unit.property.name', read_only=True
    )
    payment_method_display = serializers.CharField(
        source='get_payment_method_display', read_only=True
    )
    lease_id = serializers.PrimaryKeyRelatedField(source='lease', read_only=True)
    unit_id = serializers.PrimaryKeyRelatedField(source='lease.unit', read_only=True)
    property_id = serializers.PrimaryKeyRelatedField(source='lease.unit.property', read_only=True)
    approved_by_name = serializers.SerializerMethodField()
    utility_summary = serializers.SerializerMethodField()
    is_prepaid = serializers.SerializerMethodField()
    months_covered = serializers.SerializerMethodField()
    total_prepaid = serializers.SerializerMethodField()
    prepaid_allocations = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            'id', 'lease_id', 'amount', 'charge_type',
            'balance_before', 'balance_after',
            'payment_method', 'payment_method_display', 'reference_number',
            'payment_date', 'due_date', 'period_month', 'status', 'notes',
            'tenant_name', 'unit_number', 'unit_id',
            'property_id', 'property_name',
            'is_prepaid', 'months_covered', 'total_prepaid', 'prepaid_allocations',
            'approved_by_name', 'utility_summary', 'recorded_by', 'created_at',
        ]
        read_only_fields = fields

    def get_is_prepaid(self, obj):
        return obj.is_prepaid

    def get_months_covered(self, obj):
        return obj.months_covered

    def get_total_prepaid(self, obj):
        return str(obj.total_prepaid)

    def get_prepaid_allocations(self, obj):
        return obj.prepaid_allocations or []

    def get_approved_by_name(self, obj):
        if obj.approved_by_id and obj.approved_by:
            return obj.approved_by.get_full_name()
        return None

    def get_utility_summary(self, obj):
        if obj.utility_allocation_id and obj.utility_allocation:
            ua = obj.utility_allocation
            return {
                'utility': ua.bill.get_utility_type_display(),
                'billing_period': ua.bill.billing_period.isoformat() if ua.bill.billing_period else None,
                'invoice_number': ua.bill.invoice_number or '',
                'settled': ua.is_paid,
            }
        return None


class UtilityChargeSerializer(serializers.ModelSerializer):
    """Read model for utility bill allocations surfaced in the Financial Ledger."""
    utility_type = serializers.CharField(source='bill.utility_type', read_only=True)
    utility_type_display = serializers.CharField(source='bill.get_utility_type_display', read_only=True)
    billing_period = serializers.DateField(source='bill.billing_period', read_only=True)
    bill_due_date = serializers.DateField(source='bill.due_date', read_only=True)
    invoice_number = serializers.CharField(source='bill.invoice_number', read_only=True)
    bill_status = serializers.CharField(source='bill.status', read_only=True)
    property_id = serializers.PrimaryKeyRelatedField(source='unit.property', read_only=True)
    property_name = serializers.CharField(source='unit.property.name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True)
    tenant_name = serializers.SerializerMethodField()
    lease_id = serializers.PrimaryKeyRelatedField(source='lease', read_only=True)

    class Meta:
        model = UtilityAllocation
        fields = [
            'id', 'bill', 'lease_id',
            'utility_type', 'utility_type_display',
            'billing_period', 'bill_due_date', 'invoice_number', 'bill_status',
            'property_id', 'property_name', 'unit_number', 'tenant_name',
            'allocated_amount', 'allocation_basis', 'is_paid', 'paid_at',
            'created_at',
        ]
        read_only_fields = fields

    def get_tenant_name(self, obj):
        if obj.lease_id and obj.lease.tenant_id:
            return obj.lease.tenant.user.get_full_name()
        if obj.tenant_id:
            return obj.tenant.get_full_name()
        return None


class UtilityBillSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(
        source='property.name', read_only=True
    )
    utility_type_display = serializers.CharField(
        source='get_utility_type_display', read_only=True
    )
    split_method_display = serializers.CharField(
        source='get_split_method_display', read_only=True
    )
    allocations = serializers.SerializerMethodField()

    class Meta:
        model = UtilityBill
        fields = [
            'id', 'property', 'property_name', 'utility_type',
            'utility_type_display', 'total_amount', 'split_method',
            'split_method_display', 'billing_period', 'due_date',
            'invoice_number', 'status', 'notes', 'allocations', 'created_at'
        ]
        read_only_fields = ['id', 'status', 'allocations', 'created_at']

    def get_allocations(self, obj):
        return UtilityAllocationSerializer(
            obj.allocations.select_related('unit'), many=True
        ).data


class UtilityAllocationSerializer(serializers.ModelSerializer):
    unit_number = serializers.CharField(
        source='unit.unit_number', read_only=True
    )
    unit_id = serializers.UUIDField(source='unit.id', read_only=True)

    class Meta:
        model = UtilityAllocation
        fields = [
            'id', 'unit', 'unit_id', 'unit_number', 'allocated_amount',
            'allocation_basis', 'is_paid', 'paid_at'
        ]
        read_only_fields = fields


class UtilityBillSplitSerializer(serializers.Serializer):
    property_id = serializers.UUIDField(required=True)
    utility_type = serializers.CharField(max_length=100, required=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=True)
    period_start = serializers.DateField(required=True)
    period_end = serializers.DateField(required=True)
    split_method = serializers.CharField(max_length=20, default='equal')

    def validate(self, data):
        if data['period_start'] > data['period_end']:
            raise serializers.ValidationError('Start date must be before end date.')
        if data['total_amount'] <= 0:
            raise serializers.ValidationError('Total amount must be positive.')
        return data