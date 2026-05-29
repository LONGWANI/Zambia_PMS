from rest_framework import serializers
from .models import Tenant, Lease

class TenantSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    unit = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    lease_status = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = ['id', 'user_id', 'full_name', 'email', 'phone', 'nrc_number',
                  'emergency_contact', 'emergency_phone', 'employer_name', 'employer_phone',
                  'unit', 'property_name', 'balance', 'lease_status', 'notes', 'created_at']
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

class LeaseSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.user.get_full_name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True)
    property_name = serializers.CharField(source='unit.property.name', read_only=True)

    class Meta:
        model = Lease
        fields = '__all__'
        read_only_fields = ['id', 'balance_due', 'is_in_arrears', 'arrears_days', 'created_at', 'updated_at']