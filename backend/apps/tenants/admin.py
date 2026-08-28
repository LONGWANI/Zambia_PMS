from django.contrib import admin
from .models import Tenant, Lease

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ('user', 'tenant_id', 'get_has_active_lease', 'get_active_lease', 'nrc_verified')
    search_fields = ('user__first_name', 'user__last_name', 'user__email', 'nrc_number', 'tenant_id')
    readonly_fields = ('created_at', 'updated_at', 'get_has_active_lease', 'get_active_lease')
    list_filter = ('nrc_verified', 'lease_accepted')

    fieldsets = (
        ('Tenant Identity', {
            'fields': ('user', 'tenant_id', 'nrc_number', 'nrc_verified')
        }),
        ('Emergency & Employment Info', {
            'fields': ('emergency_contact', 'emergency_phone', 'employer_name', 'employer_phone')
        }),
        ('Next of Kin', {
            'fields': ('next_of_kin',)
        }),
        ('Status & Notes', {
            'fields': ('get_has_active_lease', 'get_active_lease', 'notes', 'password_changed', 'lease_accepted', 'lease_accepted_at')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_active_lease(self, obj):
        return obj.active_lease
    get_active_lease.short_description = 'Active Lease'

    def get_has_active_lease(self, obj):
        return obj.has_active_lease
    get_has_active_lease.boolean = True
    get_has_active_lease.short_description = 'Has Lease?'


@admin.register(Lease)
class LeaseAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'unit', 'status', 'start_date', 'end_date',
                    'balance_due', 'is_in_arrears', 'get_remaining_days', 'occupants')
    list_filter = ('status', 'is_in_arrears', 'start_date')
    search_fields = ('tenant__user__first_name', 'tenant__user__last_name', 'unit__unit_number', 'unit__property__name')
    readonly_fields = ('created_at', 'updated_at', 'get_is_expired', 'get_remaining_days', 'lease_id')

    fieldsets = (
        ('Agreement Details', {
            'fields': ('lease_id', 'tenant', 'unit', 'status')
        }),
        ('Timeline', {
            'fields': ('start_date', 'end_date', 'move_in_date', 'get_is_expired', 'get_remaining_days')
        }),
        ('Financials', {
            'fields': ('monthly_rent', 'deposit_amount', 'balance_due')
        }),
        ('Occupancy', {
            'fields': ('occupants',)
        }),
        ('Arrears Tracking', {
            'fields': ('is_in_arrears', 'arrears_days'),
            'description': 'These fields update automatically via the daily Celery beat task.'
        }),
        ('Amendment', {
            'fields': ('amendment_reason',),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_is_expired(self, obj):
        return obj.is_expired()
    get_is_expired.boolean = True
    get_is_expired.short_description = 'Is Expired?'

    def get_remaining_days(self, obj):
        days = obj.remaining_days()
        if days is not None:
            return f"{days} days"
        return "Open-ended (No end date)"
    get_remaining_days.short_description = 'Remaining Days'