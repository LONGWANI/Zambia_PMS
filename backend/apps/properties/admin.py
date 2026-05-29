from django.contrib import admin
from .models import Property, Unit

@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    # Columns shown in the main list
    list_display = ('name', 'owner', 'city', 'property_type', 'total_units', 'get_occupancy_rate')
    
    # Filters on the right side
    list_filter = ('property_type', 'city')
    
    # Search bar
    search_fields = ('name', 'address', 'owner__email', 'owner__first_name', 'owner__last_name')
    
    # Mark computed fields and timestamps as read-only
    readonly_fields = ('created_at', 'updated_at', 'occupied_units', 'occupancy_rate')

    # Organize the form layout
    fieldsets = (
        ('Property Ownership & Type', {
            'fields': ('owner', 'name', 'property_type')
        }),
        ('Location', {
            'fields': ('address', 'city', 'district')
        }),
        ('Capacity & Status', {
            'fields': ('total_units', 'occupied_units', 'occupancy_rate', 'description')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    # Custom column display to add the "%" sign
    def get_occupancy_rate(self, obj):
        return f"{obj.occupancy_rate}%"
    get_occupancy_rate.short_description = 'Occupancy Rate'


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    # Columns shown in the main list
    list_display = ('property', 'unit_number', 'unit_type', 'status', 'rent_amount')
    
    # Filters
    list_filter = ('status', 'unit_type', 'property')
    
    # Search bar
    search_fields = ('unit_number', 'property__name')
    
    # Read-only fields
    readonly_fields = ('created_at', 'updated_at', 'get_current_lease')

    # Organize the form layout
    fieldsets = (
        ('Unit Identification', {
            'fields': ('property', 'unit_number', 'status')
        }),
        ('Specifications', {
            'fields': ('unit_type', 'bedrooms', 'bathrooms', 'floor_area_sqm')
        }),
        ('Financials & Lease Details', {
            'fields': ('rent_amount', 'get_current_lease')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    # Helper method to display the active lease
    def get_current_lease(self, obj):
        lease = obj.current_lease
        if lease:
            return f"{lease.tenant.user.get_full_name()} (Active)"
        return "No active lease"
    get_current_lease.short_description = 'Current Lease'