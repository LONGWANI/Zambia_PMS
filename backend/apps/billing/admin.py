from django.contrib import admin
from .models import Payment, UtilityBill, UtilityAllocation

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('lease', 'amount', 'payment_date', 'payment_method', 'status')
    list_filter = ('status', 'payment_method', 'payment_date')
    search_fields = ('reference_number', 'lease__tenant__user__username')

@admin.register(UtilityBill)
class UtilityBillAdmin(admin.ModelAdmin):
    list_display = ('property', 'utility_type', 'billing_period', 'total_amount', 'status')
    list_filter = ('status', 'utility_type', 'billing_period')
    search_fields = ('property__name', 'invoice_number')

@admin.register(UtilityAllocation)
class UtilityAllocationAdmin(admin.ModelAdmin):
    list_display = ('unit', 'bill', 'allocated_amount', 'is_paid')
    list_filter = ('is_paid', 'bill__utility_type')
    search_fields = ('unit__name',)