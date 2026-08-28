# tenants/migrations/0004_tenant_data_migration.py
from django.db import migrations, models


def populate_tenant_ids(apps, schema_editor):
    """
    Generate sequential tenant IDs (TEN-0001, TEN-0002, ...) for existing tenants.
    """
    Tenant = apps.get_model('tenants', 'Tenant')
    # Order by id (UUID) – ensures a deterministic order; new tenants will get the next number.
    for idx, tenant in enumerate(Tenant.objects.all().order_by('id'), start=1):
        tenant.tenant_id = f"TEN-{idx:04d}"
        tenant.save(update_fields=['tenant_id'])


class Migration(migrations.Migration):

    dependencies = [
        # ✅ Corrected dependency – matches the actual 0003 migration
        ('tenants', '0003_tenant_lease_accepted_tenant_lease_accepted_at_and_more'),
    ]

    operations = [
        # 1. Add tenant_id as nullable (no unique constraint yet)
        migrations.AddField(
            model_name='tenant',
            name='tenant_id',
            field=models.CharField(
                max_length=20,
                null=True,
                blank=True,
                editable=False,
                help_text='Human‑readable tenant ID (e.g., TEN‑0001)'
            ),
        ),
        # 2. Add other new fields
        migrations.AddField(
            model_name='tenant',
            name='nrc_verified',
            field=models.BooleanField(default=False, help_text='Has the NRC been verified?'),
        ),
        migrations.AddField(
            model_name='tenant',
            name='next_of_kin',
            field=models.JSONField(default=dict, blank=True, help_text='Next of kin details'),
        ),
        migrations.AddField(
            model_name='lease',
            name='occupants',
            field=models.PositiveIntegerField(default=1, help_text='Number of occupants'),
        ),
        migrations.AddField(
            model_name='lease',
            name='move_in_date',
            field=models.DateField(null=True, blank=True, help_text='Actual move‑in date'),
        ),
        migrations.AddField(
            model_name='lease',
            name='amendment_reason',
            field=models.TextField(blank=True, null=True, help_text='Reason for contract amendment'),
        ),

        # 3. Populate tenant_id for all existing rows
        migrations.RunPython(populate_tenant_ids, reverse_code=migrations.RunPython.noop),

        # 4. Now make tenant_id unique and non‑nullable (blank=True keeps it optional on forms)
        migrations.AlterField(
            model_name='tenant',
            name='tenant_id',
            field=models.CharField(
                max_length=20,
                unique=True,
                blank=True,      # still blank=True so admin can leave it empty and auto‑fill
                editable=False,
                help_text='Human‑readable tenant ID (e.g., TEN‑0001)'
            ),
        ),
    ]