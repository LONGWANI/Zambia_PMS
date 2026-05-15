# core/models.py
import uuid
from django.db import models


class TimeStampedModel(models.Model):
    """
    Abstract base model providing UUID primary key and automatic timestamps.

    WHY UUID: Prevents sequential ID enumeration attacks (a tenant cannot
    guess other tenants' URLs by incrementing an integer).

    WHY ABSTRACT: Django does not create a database table for abstract models.
    It injects these fields directly into the child model's table — zero overhead.
    """
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ['-created_at']   # Newest first by default across all models

        # core/models.py-continuation/paste 2

class TimeStampedModel(models.Model):
    """
    Abstract base model providing UUID primary key and automatic timestamps.

    WHY UUID: Prevents sequential ID enumeration attacks (a tenant cannot
    guess other tenants' URLs by incrementing an integer).

    WHY ABSTRACT: Django does not create a database table for abstract models.
    It injects these fields directly into the child model's table — zero overhead.
    """
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ['-created_at']   # Newest first by default across all models