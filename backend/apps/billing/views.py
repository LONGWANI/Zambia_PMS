# apps/billing/views.py
import csv
import logging
import zipfile
from decimal import Decimal, InvalidOperation
from io import BytesIO

from django.core.exceptions import ValidationError
from django.db.models import Q
from django.http import Http404, HttpResponse, FileResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.authentication.permissions import IsLandlord, IsTenant
from apps.properties.models import Property, UnitStatus
from apps.tenants.models import Lease, Tenant
from .models import Payment, UtilityBill, UtilityAllocation, UtilityType
from .serializers import (
    PaymentCreateSerializer,
    PaymentReadSerializer,
    UtilityBillSerializer,
    UtilityBillSplitSerializer,
    UtilityChargeSerializer,
)
from .services import PaymentService, UtilityBillService
from apps.notifications.services import NotificationService

logger = logging.getLogger(__name__)

MAX_BATCH_RECEIPTS = 200

# --- Custom FilterSet for Payment ---
from django_filters import rest_framework as filters

class PaymentFilter(filters.FilterSet):
    property_id = filters.UUIDFilter(field_name='lease__unit__property__id')
    date_from = filters.DateFilter(field_name='payment_date', lookup_expr='gte')
    date_to = filters.DateFilter(field_name='payment_date', lookup_expr='lte')
    is_prepaid = filters.BooleanFilter(method='filter_prepaid')

    class Meta:
        model = Payment
        fields = ['status', 'payment_method']

    def filter_prepaid(self, queryset, name, value):
        if value:
            return queryset.exclude(prepaid_allocations=[])
        return queryset.filter(prepaid_allocations=[])


class PDFGenerationError(Exception):
    """Raised when the receipt template or the PDF engine is unavailable/fails."""


def _render_receipt_html(receipt_data: dict) -> str:
    """
    Renders billing/receipt_pdf.html. Any template problem (missing file,
    syntax error, bad context) becomes a PDFGenerationError so callers can
    return clean JSON instead of a 500 HTML debug page.
    """
    try:
        return render_to_string('billing/receipt_pdf.html', {'receipt': receipt_data})
    except Exception as exc:
        raise PDFGenerationError(f'Receipt template error: {exc}') from exc


def _render_html_to_pdf(html_string: str) -> bytes:
    """
    Deferred WeasyPrint import + hardened error handling.
    """
    try:
        from weasyprint import HTML
    except Exception as exc:
        raise PDFGenerationError(
            f'WeasyPrint is not installed or its system libraries are missing. Detail: {exc}'
        ) from exc

    try:
        return HTML(string=html_string).write_pdf()
    except Exception as exc:
        logger.exception('PDF rendering failed')
        raise PDFGenerationError(f'PDF rendering failed: {exc}') from exc


class PaymentViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend]
    filterset_class = PaymentFilter

    def get_permissions(self):
        if self.action in {
            'list', 'retrieve', 'receipt', 'export_csv',
            'arrears_summary', 'utility_charges', 'process_online_payment',
        }:
            return [permissions.IsAuthenticated()]
        return [IsLandlord()]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return PaymentCreateSerializer
        return PaymentReadSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Payment.objects.select_related(
            'lease__tenant__user', 'lease__unit__property',
            'utility_allocation__bill',
        )
        if user.is_admin:
            return qs.all()
        if user.is_landlord:
            return qs.filter(lease__unit__property__owner=user)
        return qs.filter(lease__tenant__user=user)

    def get_object(self):
        """
        Override to provide a clear error message when payment is not found
        or not visible to the current user.
        """
        queryset = self.get_queryset()
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        pk = self.kwargs.get(lookup_url_kwarg)
        try:
            return queryset.get(pk=pk)
        except Payment.DoesNotExist:
            if Payment.objects.filter(pk=pk).exists():
                raise Http404("Payment exists but is not visible to your account.")
            raise Http404("Payment not found.")

    def create(self, request, *args, **kwargs):
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payment = PaymentService.record_payment(
            lease=serializer.validated_data['lease'],
            amount=serializer.validated_data['amount'],
            method=serializer.validated_data['payment_method'],
            reference=serializer.validated_data.get('reference_number', ''),
            payment_date=serializer.validated_data['payment_date'],
            period_month=serializer.validated_data.get('period_month'),
            notes=serializer.validated_data.get('notes', ''),
            recorded_by=request.user,
            charge_type=serializer.validated_data.get('charge_type', 'rent'),
            utility_allocation=serializer.validated_data.get('utility_allocation'),
        )

        return Response(
            PaymentReadSerializer(payment).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'], permission_classes=[IsLandlord])
    def approve(self, request, pk=None):
        payment = self.get_object()
        if payment.status != 'pending':
            return Response(
                {'error': 'Only pending payments can be approved.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            approved_payment = PaymentService.approve_payment(payment, approved_by=request.user)
            return Response(PaymentReadSerializer(approved_payment).data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsLandlord])
    def send_receipt(self, request, pk=None):
        """Manually resend the receipt email to the tenant."""
        payment = self.get_object()
        try:
            NotificationService.send_payment_receipt(payment)
            return Response({'message': 'Receipt resent to tenant successfully.'})
        except Exception as e:
            logger.exception(f'Failed to send receipt for payment {payment.id}')
            return Response(
                {'error': f'Failed to send receipt: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def receipt(self, request, pk=None):
        logger.info('Receipt request: path=%s pk=%r user=%s', request.path, pk, request.user)
        try:
            payment = self.get_object()
        except Http404 as e:
            # Return a clean JSON error with the message from get_object
            return Response(
                {'error': str(e), 'pk': str(pk) if pk else None},
                status=status.HTTP_404_NOT_FOUND
            )

        user = request.user
        if not (user.is_admin or user.is_landlord or payment.lease.tenant.user == user):
            return Response(
                {'detail': 'You do not have permission to view this receipt.'},
                status=status.HTTP_403_FORBIDDEN
            )

        fmt = request.query_params.get('format', 'json')
        receipt_data = PaymentService.generate_receipt(payment)

        if fmt == 'pdf':
            try:
                html_string = _render_receipt_html(receipt_data)
                pdf_file = _render_html_to_pdf(html_string)
            except PDFGenerationError as exc:
                logger.warning('Receipt PDF unavailable (payment=%s): %s', payment.id, exc)
                return Response(
                    {
                        'error': 'PDF generation is temporarily unavailable.',
                        'detail': str(exc),
                        'receipt': receipt_data,
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )

            response = HttpResponse(pdf_file, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{receipt_data["receipt_number"]}.pdf"'
            return response

        return Response(receipt_data)

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        queryset = self.filter_queryset(self.get_queryset()).order_by('-payment_date')
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        stamp = timezone.now().strftime('%Y%m%d_%H%M')
        response['Content-Disposition'] = f'attachment; filename="payments_export_{stamp}.csv"'
        response.write('\ufeff')
        writer = csv.writer(response)
        writer.writerow([
            'Tenant', 'Property', 'Unit', 'Charge Type', 'Amount', 'Method',
            'Reference', 'Date', 'Period', 'Status', 'Balance Before',
            'Balance After', 'Prepaid Months', 'Notes'
        ])
        for p in queryset:
            writer.writerow([
                p.lease.tenant.user.get_full_name(),
                p.lease.unit.property.name,
                p.lease.unit.unit_number,
                p.get_charge_type_display(),
                p.amount,
                p.get_payment_method_display(),
                p.reference_number,
                p.payment_date,
                p.period_month.strftime('%Y-%m') if p.period_month else '',
                p.status,
                p.balance_before if p.balance_before is not None else '',
                p.balance_after if p.balance_after is not None else '',
                len(p.prepaid_allocations or []),
                p.notes,
            ])
        return response

    @action(detail=False, methods=['get'])
    def utility_charges(self, request):
        user = request.user
        qs = (
            UtilityAllocation.objects
            .filter(lease__isnull=False)
            .select_related('bill__property', 'unit__property', 'unit', 'lease__tenant__user', 'tenant')
        )
        if user.is_landlord:
            qs = qs.filter(bill__property__owner=user)
        elif not user.is_admin:
            qs = qs.filter(Q(lease__tenant__user=user) | Q(tenant=user))

        serializer = UtilityChargeSerializer(qs.order_by('-bill__billing_period', '-created_at'), many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def batch_receipts(self, request):
        payment_ids = request.data.get('payment_ids', [])
        if not isinstance(payment_ids, list) or not payment_ids:
            return Response({'error': 'payment_ids list is required.'}, status=400)
        if len(payment_ids) > MAX_BATCH_RECEIPTS:
            return Response(
                {'error': f'Maximum {MAX_BATCH_RECEIPTS} receipts per batch.'},
                status=400
            )

        queryset = (
            self.get_queryset()
            .filter(id__in=[str(pid) for pid in payment_ids])
            .order_by('payment_date')
        )
        if not queryset.exists():
            return Response({'error': 'No valid payments found.'}, status=404)

        probe_receipt = {
            'receipt_number': 'PROBE', 'date': '', 'tenant': '', 'unit': '',
            'amount_paid': '0.00', 'payment_method': '', 'reference': '',
            'balance_before': '0.00', 'balance_after': '0.00', 'period': '',
            'status': '', 'recorded_by': '', 'approved_by': '',
            'prepaid_months': [], 'total_prepaid': '0.00', 'charge_type': '',
            'utility': None,
        }
        try:
            probe_html = _render_receipt_html(probe_receipt)
            _render_html_to_pdf(probe_html)
        except PDFGenerationError as exc:
            logger.warning('Batch receipts aborted — PDF engine unavailable: %s', exc)
            return Response(
                {'error': 'PDF generation is temporarily unavailable.', 'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        zip_buffer = BytesIO()
        failures = []
        success_count = 0
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for payment in queryset:
                try:
                    receipt_data = PaymentService.generate_receipt(payment)
                    html_string = _render_receipt_html(receipt_data)
                    pdf = _render_html_to_pdf(html_string)
                    zf.writestr(f'{receipt_data["receipt_number"]}.pdf', pdf)
                    success_count += 1
                except Exception as exc:
                    logger.exception('Batch receipt failed for payment %s', payment.id)
                    failures.append(f'{payment.id}: {exc}')

            if failures:
                zf.writestr('_FAILURES.txt', '\n'.join(failures))

        if success_count == 0:
            return Response(
                {'error': 'No receipts could be generated.', 'failures': failures},
                status=status.HTTP_502_BAD_GATEWAY
            )

        zip_buffer.seek(0)
        stamp = timezone.now().strftime('%Y%m%d_%H%M')
        return FileResponse(
            zip_buffer,
            as_attachment=True,
            filename=f'receipts_batch_{stamp}.zip',
            content_type='application/zip',
        )

    @action(detail=False, methods=['get'])
    def arrears_summary(self, request):
        user = request.user
        if not (user.is_admin or user.is_landlord):
            return Response(
                {'error': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )

        leases = Lease.objects.filter(
            status='active',
            balance_due__gt=0
        ).select_related('tenant__user', 'unit__property').order_by('-balance_due')

        if user.is_landlord:
            leases = leases.filter(unit__property__owner=user)

        results = []
        total_outstanding = Decimal('0.00')
        for lease in leases:
            total_outstanding += Decimal(str(lease.balance_due or 0))
            results.append({
                'tenant': lease.tenant.user.get_full_name(),
                'unit': f"{lease.unit.property.name} - {lease.unit.unit_number}",
                'balance_due': str(lease.balance_due),
                'is_in_arrears': lease.is_in_arrears,
                'arrears_days': lease.arrears_days,
                'lease_id': lease.id,
            })

        return Response({
            'results': results,
            'count': len(results),
            'total_outstanding_zmw': str(total_outstanding),
            'generated_at': timezone.now().isoformat(),
        })

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def process_online_payment(self, request):
        user = request.user
        if not user.is_tenant:
            return Response(
                {'error': 'Only tenants can make online payments.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            tenant = user.tenant_profile
        except Tenant.DoesNotExist:
            return Response(
                {'error': 'Tenant profile not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        lease = tenant.active_lease
        if not lease:
            return Response(
                {'error': 'No active lease found for this tenant.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        amount_raw = request.data.get('amount')
        if amount_raw in (None, ''):
            return Response(
                {'error': 'Amount is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            amount = Decimal(str(amount_raw)).quantize(Decimal('0.01'))
        except (InvalidOperation, ValueError, TypeError):
            return Response(
                {'error': 'Invalid amount.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if amount <= 0:
            return Response(
                {'error': 'Amount must be greater than zero.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        utility_allocation = None
        allocation_id = request.data.get('utility_allocation')
        if allocation_id:
            try:
                utility_allocation = UtilityAllocation.objects.select_related(
                    'bill', 'unit', 'lease'
                ).get(id=allocation_id)
            except (UtilityAllocation.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'error': 'Utility charge not found.'},
                    status=status.HTTP_404_NOT_FOUND
                )
            if not utility_allocation.lease_id or utility_allocation.lease.tenant_id != tenant.id:
                return Response(
                    {'error': 'This utility charge does not belong to your lease.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            if utility_allocation.is_paid:
                return Response(
                    {'error': 'This utility charge has already been settled.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        method = 'sandbox_gateway'
        reference = request.data.get(
            'reference_number',
            f'ONLINE-{timezone.now().strftime("%Y%m%d%H%M%S")}'
        )
        payment_date = timezone.now().date()
        period_month = payment_date.replace(day=1)

        payment = PaymentService.record_payment(
            lease=lease,
            amount=amount,
            method=method,
            reference=reference,
            payment_date=payment_date,
            period_month=period_month,
            notes=f"Online payment via {request.data.get('provider', 'sandbox')}"
                  + (f" — utility charge {utility_allocation.bill.invoice_number or utility_allocation.id}"
                     if utility_allocation else ''),
            recorded_by=user,
            charge_type='utility' if utility_allocation else 'rent',
            utility_allocation=utility_allocation,
        )

        receipt_data = PaymentService.generate_receipt(payment)
        return Response({
            'message': 'Payment recorded successfully and is pending approval.',
            'receipt': receipt_data,
            'payment': PaymentReadSerializer(payment).data,
        })


class UtilityBillViewSet(viewsets.ModelViewSet):
    serializer_class = UtilityBillSerializer
    permission_classes = [IsLandlord]
    filter_backends = [DjangoFilterBackend]

    def get_queryset(self):
        user = self.request.user
        qs = UtilityBill.objects.prefetch_related(
            'allocations__unit'
        ).select_related('property')
        if user.is_admin:
            return qs.all()
        return qs.filter(property__owner=user)

    @action(detail=True, methods=['post'])
    def split(self, request, pk=None):
        bill = self.get_object()
        allocations = UtilityBillService.split_bill(bill)
        return Response({
            'message': f'Bill split into {len(allocations)} allocations.',
            'allocations': [
                {
                    'unit': str(a.unit_id),
                    'amount': str(a.allocated_amount),
                    'basis': str(a.allocation_basis),
                }
                for a in allocations
            ],
        })

    @action(detail=False, methods=['post'], url_path='split')
    def create_and_split(self, request):
        serializer = UtilityBillSplitSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(f"Split validation failed: {serializer.errors}")
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        data = serializer.validated_data
        property_id = data['property_id']
        utility_type_str = data['utility_type']
        total_amount = data['total_amount']
        period_start = data['period_start']
        period_end = data['period_end']
        split_method = data.get('split_method', 'equal')

        try:
            property_obj = Property.objects.get(id=property_id)
        except Property.DoesNotExist:
            logger.error(f"Property not found: {property_id}")
            return Response(
                {'error': f'Property with ID "{property_id}" not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        user = request.user
        if not (user.is_admin or property_obj.owner == user):
            logger.warning(f"User {user} does not own property {property_id}")
            return Response(
                {'error': 'You do not own this property.'},
                status=status.HTTP_403_FORBIDDEN
            )

        utility_mapping = {
            'electricity (zesco)': UtilityType.ELECTRICITY,
            'electricity': UtilityType.ELECTRICITY,
            'water (lwsc)': UtilityType.WATER,
            'water': UtilityType.WATER,
            'refuse / trash': UtilityType.GARBAGE,
            'garbage': UtilityType.GARBAGE,
            'internet': UtilityType.INTERNET,
            'other': UtilityType.OTHER,
        }
        util_key = utility_type_str.lower().strip()
        mapped_utility = utility_mapping.get(util_key, UtilityType.OTHER)

        occupied_units = property_obj.units.filter(status=UnitStatus.OCCUPIED)
        if not occupied_units.exists():
            logger.error(f"No occupied units in property {property_id}")
            return Response(
                {'error': 'No occupied units in this property. Cannot split utility bill.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            bill = UtilityBill.objects.create(
                property=property_obj,
                utility_type=mapped_utility,
                total_amount=total_amount,
                split_method=split_method,
                billing_period=period_start,
                due_date=period_end + timezone.timedelta(days=14),
                status='pending',
                notes=f"Period: {period_start} to {period_end}",
            )
        except Exception as e:
            logger.exception("Failed to create UtilityBill")
            return Response(
                {'error': f'Database error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        n = occupied_units.count()
        share = (total_amount / Decimal(n)).quantize(Decimal('0.01'))
        remainder = total_amount - (share * n)

        allocations_created = []
        try:
            for idx, unit in enumerate(occupied_units):
                lease = Lease.objects.filter(unit=unit, status='active').first()
                amount = share + (remainder if idx == 0 else Decimal('0.00'))

                alloc = UtilityAllocation.objects.create(
                    bill=bill,
                    unit=unit,
                    tenant=lease.tenant.user if lease else None,
                    allocated_amount=amount,
                    allocation_basis=Decimal('1') / Decimal(n) if n > 0 else Decimal('0'),
                    is_paid=False,
                )
                allocations_created.append(alloc)
        except Exception as e:
            logger.exception("Failed to create allocations")
            bill.delete()
            return Response(
                {'error': f'Error while allocating: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        bill.status = 'split'
        bill.save(update_fields=['status'])

        posted, skipped_units = UtilityBillService.post_bill_to_leases(bill)

        for alloc in allocations_created:
            if alloc.tenant:
                try:
                    NotificationService.notify_utility_bill(alloc)
                except Exception as e:
                    logger.warning(f"Notification failed for alloc {alloc.id}: {e}")

        return Response(
            {
                'status': 'success',
                'message': (
                    f'Utility bill created and split among {len(allocations_created)} '
                    f'occupied units. {len(posted)} charge(s) posted to tenant accounts.'
                    + (f' Skipped (no active lease): {", ".join(skipped_units)}.' if skipped_units else '')
                ),
                'bill_id': str(bill.id),
                'total_amount': str(bill.total_amount),
                'allocations_count': len(allocations_created),
                'charges_posted': len(posted),
                'units_without_active_lease': skipped_units,
            },
            status=status.HTTP_201_CREATED
        )