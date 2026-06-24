# config/urls.py
import os
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.views.static import serve
from django.conf import settings
from django.http import Http404
from rest_framework.routers import DefaultRouter

# Your app view imports
from apps.properties.views import PropertyViewSet, UnitViewSet
from apps.tenants.views import TenantViewSet, LeaseViewSet
from apps.billing.views import PaymentViewSet, UtilityBillViewSet
from apps.maintenance.views import MaintenanceRequestViewSet
from apps.notifications.views import NotificationViewSet
from apps.reports.views import DashboardView, FinancialReportView, ArrearsReportView

# Router configuration
router = DefaultRouter()
router.register(r'properties',     PropertyViewSet,            basename='property')
router.register(r'units',          UnitViewSet,                basename='unit')
router.register(r'tenants',        TenantViewSet,              basename='tenant')
router.register(r'leases',         LeaseViewSet,               basename='lease')
router.register(r'payments',       PaymentViewSet,             basename='payment')
router.register(r'utility-bills',  UtilityBillViewSet,         basename='utility-bill')
router.register(r'maintenance',    MaintenanceRequestViewSet,  basename='maintenance')
router.register(r'notifications',  NotificationViewSet,        basename='notification')

def dynamic_frontend_serve(request, path):
    """
    Custom server view that dynamically locates frontend assets in either 
    the sibling or nested directory, and explicitly overrides Content-Type headers
    to bypass Windows Registry MIME-type bugs (e.g., serving .js as text/plain).
    """
    possible_roots = [
        settings.BASE_DIR.parent / 'frontend',
        settings.BASE_DIR / 'frontend',
    ]
    
    for root in possible_roots:
        if root.exists():
            file_path = root / path
            if file_path.exists() and file_path.is_file():
                response = serve(request, path, document_root=str(root))
                
                # HARD-OVERRIDE: Forces headers to match exactly what modern browsers demand
                if path.endswith('.css'):
                    response['Content-Type'] = 'text/css'
                elif path.endswith('.js'):
                    response['Content-Type'] = 'application/javascript'
                elif path.endswith('.html'):
                    response['Content-Type'] = 'text/html'
                elif path.endswith('.svg'):
                    response['Content-Type'] = 'image/svg+xml'
                elif path.endswith('.png'):
                    response['Content-Type'] = 'image/png'
                elif path.endswith('.jpg') or path.endswith('.jpeg'):
                    response['Content-Type'] = 'image/jpeg'
                elif path.endswith('.json'):
                    response['Content-Type'] = 'application/json'
                    
                return response
                
    # If asset is not found anywhere, return a standard Django 404 error
    raise Http404("Frontend asset not found.")

urlpatterns = [
    # 1. Django Admin Dashboard
    path('admin/', admin.site.urls),
    
    # 2. Authentication API Endpoints
    path('api/auth/', include('apps.authentication.urls')),
    
    # 3. Standard API Endpoints (from router)
    path('api/', include(router.urls)),
    
    # 4. Custom Report API Endpoints (Renamed to avoid template name collisions)
    path('api/reports/dashboard/',  DashboardView.as_view(),       name='api-dashboard'),
    path('api/reports/financial/',  FinancialReportView.as_view(), name='api-financial-report'),
    path('api/reports/arrears/',    ArrearsReportView.as_view(),   name='api-arrears-report'),

    # 5. --- NEW: FRONTEND TEMPLATE ROUTES ---
    # This renders your HTML pages perfectly injected into base.html
    path('', TemplateView.as_view(template_name='pages/dashboard.html'), name='dashboard'),
    path('properties/', TemplateView.as_view(template_name='pages/properties.html'), name='properties'),
    path('tenants/', TemplateView.as_view(template_name='pages/tenants.html'), name='tenants'),
    path('payments/', TemplateView.as_view(template_name='pages/payments.html'), name='payments'),
    path('maintenance/', TemplateView.as_view(template_name='pages/maintenance.html'), name='maintenance'),
    path('reports/', TemplateView.as_view(template_name='pages/reports.html'), name='reports'),
    
    # 6. Bulletproof Dynamic Frontend Asset & Page Router
    # This stays at the bottom to catch your CSS, JS, and Images!
    re_path(r'^(?P<path>.*)$', dynamic_frontend_serve),
]