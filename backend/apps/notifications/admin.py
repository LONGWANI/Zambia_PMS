from django.contrib import admin
from .models import Notification

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    # Columns shown in the main list view
    list_display = ('title', 'user', 'notification_type', 'is_read', 'created_at')
    
    # Allows you to check/uncheck the "is_read" box directly from the list view without opening the record
    list_editable = ('is_read',)
    
    # Filters on the right sidebar
    list_filter = ('is_read', 'notification_type', 'created_at')
    
    # Search bar (using user__email based on your custom User model)
    search_fields = ('title', 'message', 'user__email', 'user__first_name', 'user__last_name')
    
    # Prevent editing of timestamps
    readonly_fields = ('created_at', 'updated_at')

    # Organizes the layout when you click on a specific notification
    fieldsets = (
        ('Recipient & Status', {
            'fields': ('user', 'notification_type', 'is_read')
        }),
        ('Message Content', {
            'fields': ('title', 'message')
        }),
        ('System References', {
            'fields': ('related_object_type', 'related_object_id'),
            'classes': ('collapse',), # Hides these technical fields behind a dropdown
            'description': "These fields link the notification to a specific database record (like a Lease or Payment ID)."
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )