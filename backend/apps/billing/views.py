# apps/billing/views.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from decimal import Decimal
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend

from apps.authentication.permissions import IsLandlord, IsTenant
from .models import Payment, UtilityBill, PaymentMethod
from .serializers import (PaymentCreateSerializer, PaymentReadSerializer,
                           UtilityBillSerializer)
from .services import PaymentService, UtilityBillService
from apps.tenants.models import Tenant

# 👇 Add this import
from apps.notifications.services import NotificationService


class PaymentViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'payment_method', 'payment_date']

    def get_permissions(self):
        if self.action == 'list':
            return [permissions.IsAuthenticated()]
        if self.action == 'process_online_payment':
            return [permissions.IsAuthenticated()]
        if self.action == 'receipt':
            return [permissions.IsAuthenticated()]
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsLandlord()]
        return [IsLandlord()]

    def get_serializer_class(self):
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

        # 🔔 Trigger notification for the tenant
        try:
            NotificationService.notify_payment_received(payment)
        except Exception as e:
            # Log the error but don't break the response
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send payment notification: {e}")

        return Response(
            PaymentReadSerializer(payment).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['get'])
    def receipt(self, request, pk=None):
        payment = self.get_object()
        user = request.user
        if not (user.is_admin or user.is_landlord or payment.lease.tenant.user == user):
            return Response(
                {'detail': 'You do not have permission to view this receipt.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return Response(PaymentService.generate_receipt(payment))

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def process_online_payment(self, request):
        user = request.user
        if not user.is_tenant:
            return Response({'error': 'Only tenants can make online payments.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            tenant = user.tenant_profile
        except Tenant.DoesNotExist:
            return Response({'error': 'Tenant profile not found.'}, status=status.HTTP_404_NOT_FOUND)

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

        # 🔔 Trigger notification for online payment
        try:
            NotificationService.notify_payment_received(payment)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send online payment notification: {e}")

        receipt_data = PaymentService.generate_receipt(payment)
        return Response({
            'message': 'Payment processed successfully.',
            'receipt': receipt_data,
            'payment': PaymentReadSerializer(payment).data,
        })


class UtilityBillViewSet(viewsets.ModelViewSet):
    serializer_class   = UtilityBillSerializer
    permission_classes = [IsLandlord]
    filter_backends = [DjangoFilterBackend]

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