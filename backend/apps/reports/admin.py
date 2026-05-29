from django.contrib import admin
from .models import Report

@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    # Columns shown in the main list
    list_display = ('title', 'report_type', 'format', 'status', 'generated_by', 'created_at')
    
    # Filters on the right side
    list_filter = ('status', 'report_type', 'format', 'created_at')
    
    # Search bar
    search_fields = ('title', 'generated_by__email', 'generated_by__first_name')
    
    # Read-only fields to prevent manual editing of system-generated data
    readonly_fields = ('created_at', 'updated_at', 'completed_at', 'error_message')

    # Organize the form layout into logical sections
    fieldsets = (
        ('Report Details', {
            'fields': ('title', 'report_type', 'format', 'generated_by')
        }),
        ('Data Range', {
            'fields': ('start_date', 'end_date'),
            'description': 'Leave blank for all-time data, or specify a date range.'
        }),
        ('Status & Output', {
            'fields': ('status', 'file', 'completed_at', 'error_message')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )