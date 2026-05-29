from django.db import models
from core.models import TimeStampedModel
from apps.authentication.models import User
import builtins


class PropertyType(models.TextChoices):
    RESIDENTIAL = 'residential', 'Residential'
    COMMERCIAL  = 'commercial',  'Commercial'
    MIXED       = 'mixed',       'Mixed Use'


class Property(TimeStampedModel):
    """
    A physical property owned by a landlord.
    Examples in Zambia: apartment block in Kabulonga, shops in Cairo Road,
    mixed-use building in Woodlands.
    """
    owner         = models.ForeignKey(User, on_delete=models.RESTRICT,
                                      related_name='properties',
                                      limit_choices_to={'role': 'landlord'})
    name          = models.CharField(max_length=200)
    address       = models.TextField()
    city          = models.CharField(max_length=100, default='Lusaka')
    district      = models.CharField(max_length=100, blank=True)
    property_type = models.CharField(max_length=50, choices=PropertyType.choices,
                                     default=PropertyType.RESIDENTIAL)
    total_units   = models.PositiveIntegerField(default=1)
    description   = models.TextField(blank=True)

    class Meta:
        db_table = 'properties'
        verbose_name_plural = 'properties'
        ordering = ['name']
        indexes = [
            models.Index(fields=['owner_id']),
        ]

    def __str__(self):
        return f"{self.name} ({self.city})"

    @property
    def occupied_units(self):
        return self.units.filter(status='occupied').count()

    @property
    def occupancy_rate(self):
        """Returns occupancy as a percentage (0–100)."""
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
    VACANT      = 'vacant',      'Vacant'
    OCCUPIED    = 'occupied',    'Occupied'
    MAINTENANCE = 'under_maintenance', 'Under Maintenance'


class Unit(TimeStampedModel):
    """
    An individual rentable space within a property.
    This is what a tenant actually rents and pays rent for.

    floor_area_sqm is stored for area-based utility splitting —
    a larger unit pays a proportionally larger share of the water bill.
    """
    property      = models.ForeignKey(Property, on_delete=models.CASCADE,
                                      related_name='units')
    unit_number   = models.CharField(max_length=20)
    unit_type     = models.CharField(max_length=50, choices=UnitType.choices,
                                     default=UnitType.ONE_BED)
    floor_area_sqm = models.DecimalField(max_digits=8, decimal_places=2,
                                         null=True, blank=True)
    bedrooms      = models.PositiveIntegerField(default=1)
    bathrooms     = models.PositiveIntegerField(default=1)
    rent_amount   = models.DecimalField(max_digits=12, decimal_places=2)
    status        = models.CharField(max_length=30, choices=UnitStatus.choices,
                                     default=UnitStatus.VACANT, db_index=True)

    class Meta:
        db_table = 'units'
        unique_together = [['property', 'unit_number']]
        ordering = ['unit_number']
        indexes = [
            models.Index(fields=['property_id']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.property.name} — Unit {self.unit_number}"

    def is_vacant(self):
        return self.status == UnitStatus.VACANT

    # FIX: Using builtins.property to prevent referencing the ForeignKey attribute above
    @builtins.property
    def current_lease(self):
        """Returns the active lease for this unit, or None."""
        return self.leases.filter(status='active').first()