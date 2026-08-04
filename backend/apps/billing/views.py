# apps/billing/views.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from decimal import Decimal
from django.utils import timezone
from apps.authentication.permissions import IsLandlord, IsTenant
from .models import Payment, UtilityBill, PaymentMethod
from .serializers import (PaymentCreateSerializer, PaymentReadSerializer,
                           UtilityBillSerializer)
from .services import PaymentService, UtilityBillService
from apps.tenants.models import Tenant


class PaymentViewSet(viewsets.ModelViewSet):
    """
    GET    /api/payments/            → all payments (landlord sees all, tenant sees own)
    POST   /api/payments/            → record a new payment
    GET    /api/payments/{id}/       → payment detail
    GET    /api/payments/{id}/receipt/ → generate receipt JSON
    POST   /api/payments/process_online_payment/ → tenant online payment (sandbox)
    """
    filter_backends  = ['django_filters.rest_framework.DjangoFilterBackend']
    filterset_fields = ['status', 'payment_method', 'payment_date']

    def get_serializer_class(self):
        """
        WHY: read and write serializers have different fields.
        DRF calls get_serializer_class() before every action —
        this switch is the standard DRF pattern.
        """
        if self.action in ['create', 'update', 'partial_update']:
            return PaymentCreateSerializer
        return PaymentReadSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = Payment.objects.select_related(
            'lease__tenant__user', 'lease__unit__property'
        )
        if user.is_admin:
            return qs.all()
        if user.is_landlord:
            return qs.filter(lease__unit__property__owner=user)
        # Tenant: only their own payments
        return qs.filter(lease__tenant__user=user)

    def create(self, request, *args, **kwargs):
        """
        Delegates ALL business logic to PaymentService.
        The view only handles HTTP: parse → validate → service → respond.
        """
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payment = PaymentService.record_payment(
            lease        = serializer.validated_data['lease'],
            amount       = serializer.validated_data['amount'],
            method       = serializer.validated_data['payment_method'],
            reference    = serializer.validated_data.get('reference_number', ''),
            payment_date = serializer.validated_data['payment_date'],
            period_month = serializer.validated_data.get('period_month'),
            notes        = serializer.validated_data.get('notes', ''),
            recorded_by  = request.user,
        )
        return Response(
            PaymentReadSerializer(payment).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['get'])
    def receipt(self, request, pk=None):
        """GET /api/payments/{id}/receipt/  — returns receipt-formatted data"""
        payment = self.get_object()
        return Response(PaymentService.generate_receipt(payment))

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def process_online_payment(self, request):
        """
        POST /api/payments/process_online_payment/
        Expects: amount, provider, account_number (optional), reference_number (optional)
        For tenants only.
        """
        user = request.user
        if not user.is_tenant:
            return Response({'error': 'Only tenants can make online payments.'}, status=status.HTTP_403_FORBIDDEN)

        # Get tenant profile
        try:
            tenant = user.tenant_profile
        except Tenant.DoesNotExist:
            return Response({'error': 'Tenant profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Get active lease
        lease = tenant.active_lease
        if not lease:
            return Response({'error': 'No active lease found for this tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        amount = request.data.get('amount')
        if not amount:
            return Response({'error': 'Amount is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(amount))
        except:
            return Response({'error': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)

        if amount <= 0:
            return Response({'error': 'Amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)

        # Use sandbox_gateway as the method
        method = 'sandbox_gateway'
        reference = request.data.get('reference_number', f'ONLINE-{timezone.now().strftime("%Y%m%d%H%M%S")}')
        payment_date = timezone.now().date()
        period_month = timezone.now().date().replace(day=1)

        payment = PaymentService.record_payment(
            lease=lease,
            amount=amount,
            method=method,
            reference=reference,
            payment_date=payment_date,
            period_month=period_month,
            notes=f"Online payment via {request.data.get('provider', 'sandbox')}",
            recorded_by=user,
        )

        receipt_data = PaymentService.generate_receipt(payment)
        return Response({
            'message': 'Payment processed successfully.',
            'receipt': receipt_data,
            'payment': PaymentReadSerializer(payment).data,
        })


class UtilityBillViewSet(viewsets.ModelViewSet):
    """
    POST /api/utility-bills/             → create bill
    POST /api/utility-bills/{id}/split/  → run auto-split algorithm
    """
    serializer_class   = UtilityBillSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        user = self.request.user
        qs   = UtilityBill.objects.prefetch_related(
            'allocations__unit'
        ).select_related('property')
        if user.is_admin:
            return qs.all()
        return qs.filter(property__owner=user)

    @action(detail=True, methods=['post'])
    def split(self, request, pk=None):
        """
        POST /api/utility-bills/{id}/split/
        Triggers the utility bill auto-split algorithm.
        Returns the allocation breakdown.
        """
        bill        = self.get_object()
        allocations = UtilityBillService.split_bill(bill)
        return Response({
            'message':     f'Bill split into {len(allocations)} allocations.',
            'allocations': [
                {
                    'unit':   str(a.unit_id),
                    'amount': str(a.allocated_amount),
                    'basis':  str(a.allocation_basis),
                }
                for a in allocations
            ],
        })