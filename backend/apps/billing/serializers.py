# apps/billing/serializers.py
from rest_framework import serializers
from .models import Payment, UtilityBill, UtilityAllocation
from apps.tenants.models import Lease


class PaymentCreateSerializer(serializers.ModelSerializer):
    """
    WHY separate Read and Write serializers:
    On write, we accept lease + amount + method.
    On read, we return the full ledger snapshot with balance_before/after.
    Combining them means either exposing writable fields that shouldn't be
    written, or hiding readable fields that should be shown.
    """
    class Meta:
        model  = Payment
        fields = ['lease', 'amount', 'payment_method', 'reference_number',
                  'payment_date', 'period_month', 'notes']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Payment amount must be positive.')
        return value

    def validate_lease(self, value):
        if value.status != 'active':
            raise serializers.ValidationError(
                'Cannot record payment for an inactive lease.'
            )
        return value


class PaymentReadSerializer(serializers.ModelSerializer):
    tenant_name   = serializers.CharField(
        source='lease.tenant.user.get_full_name', read_only=True)
    unit_number   = serializers.CharField(
        source='lease.unit.unit_number', read_only=True)
    property_name = serializers.CharField(
        source='lease.unit.property.name', read_only=True)
    payment_method_display = serializers.CharField(
        source='get_payment_method_display', read_only=True)

    class Meta:
        model  = Payment
        fields = ['id', 'amount', 'balance_before', 'balance_after',
                  'payment_method', 'payment_method_display', 'reference_number',
                  'payment_date', 'period_month', 'status', 'notes',
                  'tenant_name', 'unit_number', 'property_name',
                  'recorded_by', 'created_at']
        read_only_fields = fields


class UtilityBillSerializer(serializers.ModelSerializer):
    allocations         = serializers.SerializerMethodField()
    utility_type_display = serializers.CharField(
        source='get_utility_type_display', read_only=True)
    split_method_display = serializers.CharField(
        source='get_split_method_display', read_only=True)

    class Meta:
        model  = UtilityBill
        fields = ['id', 'property', 'utility_type', 'utility_type_display',
                  'total_amount', 'split_method', 'split_method_display',
                  'billing_period', 'due_date', 'invoice_number',
                  'status', 'notes', 'allocations', 'created_at']
        read_only_fields = ['id', 'status', 'allocations', 'created_at']

    def get_allocations(self, obj):
        return UtilityAllocationSerializer(
            obj.allocations.select_related('unit'), many=True
        ).data


class UtilityAllocationSerializer(serializers.ModelSerializer):
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True)

    class Meta:
        model  = UtilityAllocation
        fields = ['id', 'unit', 'unit_number', 'allocated_amount',
                  'allocation_basis', 'is_paid', 'paid_at']