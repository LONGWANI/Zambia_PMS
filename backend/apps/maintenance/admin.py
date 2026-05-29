from django.contrib import admin
from .models import MaintenanceRequest

@admin.register(MaintenanceRequest)
class MaintenanceRequestAdmin(admin.ModelAdmin):
    # What columns show up in the main list view
    list_display = ('title', 'tenant', 'unit', 'priority', 'status', 'assigned_to', 'created_at')
    
    # What you can filter by on the right sidebar
    list_filter = ('status', 'priority', 'created_at')
    
    # What the search bar looks at
    # Note: Assumes your Unit model has a 'name' field and your User model has an 'email' field
    search_fields = ('title', 'description', 'assigned_to', 'unit__name', 'tenant__user__email')
    
    # Fields that should not be editable by default
    readonly_fields = ('created_at', 'updated_at')

    # Organizes the fields into neat sections when you open a specific request
    fieldsets = (
        ('Request Details', {
            'fields': ('tenant', 'unit', 'title', 'description')
        }),
        ('Status & Assignment', {
            'fields': ('priority', 'status', 'assigned_to')
        }),
        ('Financials & Resolution', {
            'fields': ('estimated_cost', 'actual_cost', 'resolution_notes', 'resolved_at')
        }),
        ('System Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',) # This hides the timestamps under a dropdown to save space
        }),
    )