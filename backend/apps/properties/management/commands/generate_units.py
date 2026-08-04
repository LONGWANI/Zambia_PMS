from django.core.management.base import BaseCommand
from apps.properties.models import Property, Unit, UnitStatus

class Command(BaseCommand):
    help = 'Generate missing unit records for existing properties'

    def handle(self, *args, **options):
        created = 0
        for prop in Property.objects.all():
            existing = Unit.objects.filter(property=prop).count()
            if existing == 0 and prop.total_units > 0:
                for i in range(1, prop.total_units + 1):
                    Unit.objects.create(
                        property=prop,
                        unit_number=str(i),
                        status=UnitStatus.VACANT,
                        rent_amount=0.00,
                        unit_type='other',
                        bedrooms=1,
                        bathrooms=1,
                    )
                self.stdout.write(f"Created {prop.total_units} units for {prop.name}")
                created += 1
        self.stdout.write(self.style.SUCCESS(f"Done. Updated {created} properties."))