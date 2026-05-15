# apps/properties/services.py
from django.db.models import Count, Q, Avg
from .models import Property, Unit, UnitStatus


class PropertyService:
    """
    WHY a service class: business logic does not belong in views (HTTP concerns)
    or models (data concerns). The service layer is where decisions are made.

    Static methods because PropertyService has no instance state —
    it's a collection of operations, not an object with behaviour.
    """

    @staticmethod
    def get_occupancy_summary(property_obj: Property) -> dict:
        """
        Returns full occupancy breakdown for a property.
        Used by the dashboard and the /occupancy/ endpoint.
        """
        units = property_obj.units.all()
        total     = units.count()
        occupied  = units.filter(status=UnitStatus.OCCUPIED).count()
        vacant    = units.filter(status=UnitStatus.VACANT).count()
        in_maint  = units.filter(status=UnitStatus.MAINTENANCE).count()

        return {
            'property_id':      str(property_obj.id),
            'property_name':    property_obj.name,
            'total_units':      total,
            'occupied':         occupied,
            'vacant':           vacant,
            'under_maintenance': in_maint,
            'occupancy_rate':   round((occupied / total * 100), 1) if total else 0,
            'vacant_units':     list(
                units.filter(status=UnitStatus.VACANT)
                     .values('id', 'unit_number', 'unit_type', 'rent_amount')
            ),
        }

    @staticmethod
    def get_portfolio_summary(landlord) -> dict:
        """Summary across ALL properties for a landlord's dashboard."""
        properties = Property.objects.filter(owner=landlord).prefetch_related('units')
        total_props = properties.count()
        total_units = sum(p.units.count() for p in properties)
        occupied    = sum(p.occupied_units for p in properties)

        return {
            'total_properties': total_props,
            'total_units':      total_units,
            'occupied_units':   occupied,
            'vacant_units':     total_units - occupied,
            'portfolio_occupancy_rate': round(
                (occupied / total_units * 100), 1
            ) if total_units else 0,
        }