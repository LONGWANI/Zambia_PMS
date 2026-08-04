from django.db import models
from core.models import TimeStampedModel
from apps.authentication.models import User
import builtins

class PropertyType(models.TextChoices):
    RESIDENTIAL = 'residential', 'Residential'
    COMMERCIAL  = 'commercial',  'Commercial'
    MIXED       = 'mixed',       'Mixed Use'
    APARTMENT   = 'Apartment',   'Apartment'   # Changed value to 'Apartment'

class Property(TimeStampedModel):
    owner         = models.ForeignKey(User, on_delete=models.RESTRICT, related_name='properties', limit_choices_to={'role': 'landlord'})
    name          = models.CharField(max_length=200)
    address       = models.TextField()
    city          = models.CharField(max_length=100, default='Lusaka')
    district      = models.CharField(max_length=100, blank=True)
    property_type = models.CharField(max_length=50, choices=PropertyType.choices, default=PropertyType.RESIDENTIAL)
    total_units   = models.PositiveIntegerField(default=1)
    description   = models.TextField(blank=True)

    class Meta:
        db_table = 'properties'
        verbose_name_plural = 'properties'
        ordering = ['name']
        indexes = [models.Index(fields=['owner_id'])]

    def __str__(self):
        return f"{self.name} ({self.city})"

    @property
    def occupied_units(self):
        return self.units.filter(status='occupied').count()

    @property
    def occupancy_rate(self):
        total = self.units.count()
        if total == 0:
            return 0
        return round((self.occupied_units / total) * 100, 1)

class UnitType(models.TextChoices):
    STUDIO     = 'studio',     'Studio'
    ONE_BED    = '1br',        '1 Bedroom'
    TWO_BED    = '2br',        '2 Bedrooms'
    THREE_BED  = '3br',        '3 Bedrooms'
    COMMERCIAL = 'commercial', 'Commercial'
    OTHER      = 'other',      'Other'

class UnitStatus(models.TextChoices):
    VACANT      = 'available',   'Available'
    OCCUPIED    = 'occupied',    'Occupied'
    RESERVED    = 'reserved',    'Reserved'
    MAINTENANCE = 'under_maintenance', 'Under Maintenance'

class Unit(TimeStampedModel):
    property      = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='units')
    unit_number   = models.CharField(max_length=20)
    unit_type     = models.CharField(max_length=50, choices=UnitType.choices, default=UnitType.ONE_BED)
    floor_area_sqm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    bedrooms      = models.PositiveIntegerField(default=1)
    bathrooms     = models.PositiveIntegerField(default=1)
    rent_amount   = models.DecimalField(max_digits=12, decimal_places=2)
    status        = models.CharField(max_length=30, choices=UnitStatus.choices, default=UnitStatus.VACANT, db_index=True)
    current_tenant = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_unit')

    class Meta:
        db_table = 'units'
        unique_together = [['property', 'unit_number']]
        ordering = ['unit_number']
        indexes = [models.Index(fields=['property_id']), models.Index(fields=['status'])]

    def __str__(self):
        return f"{self.property.name} — Unit {self.unit_number}"

    def is_vacant(self):
        return self.status == UnitStatus.VACANT

    @builtins.property
    def current_lease(self):
        return self.leases.filter(status='active').first()

class OccupancyHistory(TimeStampedModel):
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name='occupancy_history')
    tenant = models.ForeignKey(User, on_delete=models.CASCADE)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'occupancy_history'
        ordering = ['-start_date']