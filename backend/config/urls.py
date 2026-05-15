# config/urls.py
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.properties.views import PropertyViewSet, UnitViewSet
from apps.tenants.views import TenantViewSet, LeaseViewSet
from apps.billing.views import PaymentViewSet, UtilityBillViewSet
from apps.maintenance.views import MaintenanceRequestViewSet
from apps.notifications.views import NotificationViewSet
from apps.reports.views import DashboardView, FinancialReportView, ArrearsReportView

router = DefaultRouter()
router.register(r'properties',     PropertyViewSet,            basename='property')
router.register(r'units',          UnitViewSet,                basename='unit')
router.register(r'tenants',        TenantViewSet,              basename='tenant')
router.register(r'leases',         LeaseViewSet,               basename='lease')
router.register(r'payments',       PaymentViewSet,             basename='payment')
router.register(r'utility-bills',  UtilityBillViewSet,         basename='utility-bill')
router.register(r'maintenance',    MaintenanceRequestViewSet,  basename='maintenance')
router.register(r'notifications',  NotificationViewSet,        basename='notification')

urlpatterns = [
    path('admin/',        admin.site.urls),
    path('api/auth/',     include('apps.authentication.urls')),
    path('api/',          include(router.urls)),
    path('api/reports/dashboard/',  DashboardView.as_view(),       name='dashboard'),
    path('api/reports/financial/',  FinancialReportView.as_view(), name='financial-report'),
    path('api/reports/arrears/',    ArrearsReportView.as_view(),   name='arrears-report'),
]