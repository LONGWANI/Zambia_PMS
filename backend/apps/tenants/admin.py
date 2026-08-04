from django.contrib import admin
from .models import Tenant, Lease

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    # Columns shown in the main list
    list_display = ('user', 'get_has_active_lease', 'get_active_lease')
    
    # Search bar (searching across the related User model and the NRC number)
    search_fields = ('user__first_name', 'user__last_name', 'user__email', 'nrc_number', 'employer_name')
    
    # Exposing your Python @property methods as read-only fields
    readonly_fields = ('created_at', 'updated_at', 'get_has_active_lease', 'get_active_lease')

    # Organized layout for the Tenant detail view
    fieldsets = (
        ('Tenant Identity', {
            'fields': ('user', 'nrc_number')
        }),
        ('Emergency & Employment Info', {
            'fields': ('emergency_contact', 'emergency_phone', 'employer_name', 'employer_phone')
        }),
        ('Status & Notes', {
            'fields': ('get_has_active_lease', 'get_active_lease', 'notes')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    # Helper functions to display your @property decorators nicely
    def get_active_lease(self, obj):
        return obj.active_lease
    get_active_lease.short_description = 'Active Lease'

    def get_has_active_lease(self, obj):
        return obj.has_active_lease
    get_has_active_lease.boolean = True  # This turns the True/False into a nice green checkmark or red X
    get_has_active_lease.short_description = 'Has Lease?'


@admin.register(Lease)
class LeaseAdmin(admin.ModelAdmin):
    # Columns shown in the main list
    list_display = ('tenant', 'unit', 'status', 'start_date', 'end_date', 'balance_due', 'is_in_arrears', 'get_remaining_days')
    
    # Filters on the right sidebar
    list_filter = ('status', 'is_in_arrears', 'start_date')
    
    # Search bar
    search_fields = ('tenant__user__first_name', 'tenant__user__last_name', 'unit__unit_number', 'unit__property__name')
    
    # Exposing your class methods as read-only fields
    readonly_fields = ('created_at', 'updated_at', 'get_is_expired', 'get_remaining_days')

    # Organized layout for the Lease detail view
    fieldsets = (
        ('Agreement Details', {
            'fields': ('tenant', 'unit', 'status')
        }),
        ('Timeline', {
            'fields': ('start_date', 'end_date', 'get_is_expired', 'get_remaining_days')
        }),
        ('Financials', {
            'fields': ('monthly_rent', 'deposit_amount', 'balance_due')
        }),
        ('Arrears Tracking', {
            'fields': ('is_in_arrears', 'arrears_days'),
            'description': 'These fields update automatically via the daily Celery beat task.'
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    # Helper functions to display your class methods
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