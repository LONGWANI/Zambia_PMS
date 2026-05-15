# apps/authentication/models.py
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models
from core.models import TimeStampedModel


class UserRole(models.TextChoices):
    """
    Enum for user roles. Using TextChoices instead of plain strings means:
    - IDE autocomplete works: UserRole.LANDLORD instead of "landlord"
    - Typos cause import errors, not silent runtime bugs
    - Self-documenting code
    """
    ADMIN    = 'admin',    'System Administrator'
    LANDLORD = 'landlord', 'Property Landlord'
    TENANT   = 'tenant',   'Tenant'


class UserManager(BaseUserManager):
    """
    Custom manager because our User uses email (not username) as the login field.
    This is standard practice for modern applications — nobody remembers usernames.
    """
    def create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('Email address is required')
        email = self.normalize_email(email)   # lowercases the domain part
        user  = self.model(email=email, **extra_fields)
        user.set_password(password)           # bcrypt hashing via Django's auth system
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault('role', UserRole.ADMIN)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """
    Single user table for all roles (Admin, Landlord, Tenant).

    WHY ONE TABLE: Simpler joins, one login endpoint, easier role changes.
    The alternative (separate Landlord/Tenant tables) creates duplicate auth logic.

    SOLID — Single Responsibility: this model only handles identity & auth.
    Profile data (NRC number, emergency contact) lives in the Tenant model.
    """
    email      = models.EmailField(unique=True, db_index=True)
    role       = models.CharField(max_length=20, choices=UserRole.choices,
                                  default=UserRole.TENANT)
    first_name = models.CharField(max_length=100)
    last_name  = models.CharField(max_length=100)
    phone      = models.CharField(max_length=20, blank=True)
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)   # Django admin access
    last_login = models.DateTimeField(null=True, blank=True)

    objects  = UserManager()

    USERNAME_FIELD  = 'email'        # Login with email
    REQUIRED_FIELDS = ['first_name', 'last_name', 'role']

    class Meta:
        db_table = 'users'
        verbose_name = 'user'
        verbose_name_plural = 'users'

    def __str__(self):
        return f"{self.get_full_name()} ({self.role})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    # Role-checking properties — cleaner than comparing strings everywhere
    @property
    def is_admin(self):
        return self.role == UserRole.ADMIN

    @property
    def is_landlord(self):
        return self.role == UserRole.LANDLORD

    @property
    def is_tenant(self):
        return self.role == UserRole.TENANT