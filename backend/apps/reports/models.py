from django.db import models
from core.models import TimeStampedModel
from apps.authentication.models import User

class ReportType(models.TextChoices):
    FINANCIAL   = 'financial',   'Financial Summary'
    OCCUPANCY   = 'occupancy',   'Occupancy & Vacancy'
    ARREARS     = 'arrears',     'Tenant Arrears'
    MAINTENANCE = 'maintenance', 'Maintenance Costs & Status'

class ReportStatus(models.TextChoices):
    PENDING    = 'pending',    'Pending in Queue'
    PROCESSING = 'processing', 'Processing...'
    COMPLETED  = 'completed',  'Completed'
    FAILED     = 'failed',     'Failed'

class ReportFormat(models.TextChoices):
    PDF   = 'pdf',   'PDF Document'
    EXCEL = 'excel', 'Excel Spreadsheet'
    CSV   = 'csv',   'CSV Data'

class Report(TimeStampedModel):
    """
    Tracks requested reports. Allows for heavy reports to be generated 
    asynchronously via Celery without freezing the application.
    """
    title         = models.CharField(max_length=200)
    report_type   = models.CharField(max_length=50, choices=ReportType.choices)
    format        = models.CharField(max_length=20, choices=ReportFormat.choices, default=ReportFormat.PDF)
    status        = models.CharField(max_length=20, choices=ReportStatus.choices, default=ReportStatus.PENDING)
    
    # Date ranges for the report data (optional, e.g., "Financials for March 2025")
    start_date    = models.DateField(null=True, blank=True)
    end_date      = models.DateField(null=True, blank=True)
    
    # The actual generated file
    # Files will be saved in your media/reports/YYYY/MM/ folder
    file          = models.FileField(upload_to='reports/%Y/%m/', null=True, blank=True)
    
    # Audit and error tracking
    error_message = models.TextField(blank=True, help_text="Contains error details if generation failed.")
    generated_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, 
                                      related_name='generated_reports')
    completed_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'reports'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'report_type']),
        ]

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"