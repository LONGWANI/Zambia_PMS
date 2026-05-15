# apps/authentication/permissions.py
from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Only system administrators."""
    message = "This action requires administrator privileges."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_admin


class IsLandlord(BasePermission):
    """Only landlords (and admins, who can do everything)."""
    message = "This action requires landlord privileges."

    def has_permission(self, request, view):
        return (request.user.is_authenticated and
                request.user.role in ('landlord', 'admin'))


class IsTenant(BasePermission):
    """Only tenants (cannot manage properties or other tenants)."""
    message = "This action requires tenant privileges."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_tenant


class IsLandlordOrReadOnly(BasePermission):
    """
    Tenants can read (GET); only landlords can write (POST/PUT/DELETE).
    Used on endpoints like maintenance requests where tenants submit, landlords resolve.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return request.user.role in ('landlord', 'admin')


class IsPropertyOwner(BasePermission):
    """
    Object-level permission: landlord can only modify THEIR OWN properties.
    Prevents Landlord A from editing Landlord B's data.
    This is RBAC at the row level — crucial for multi-landlord systems.
    """
    def has_object_permission(self, request, view, obj):
        # obj is a Property instance
        if hasattr(obj, 'owner'):
            return obj.owner == request.user
        if hasattr(obj, 'property'):
            return obj.property.owner == request.user
        return False