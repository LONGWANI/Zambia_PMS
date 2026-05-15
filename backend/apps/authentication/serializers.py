# apps/authentication/serializers.py
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User, UserRole


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    WHY two password fields: forces the client to confirm the password.
    write_only=True ensures passwords NEVER appear in any API response —
    even if a developer accidentally returns the full user object.
    """
    password         = serializers.CharField(write_only=True, min_length=8,
                                             validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model  = User
        fields = ['id', 'email', 'password', 'confirm_password',
                  'first_name', 'last_name', 'phone', 'role']
        read_only_fields = ['id']
        extra_kwargs = {
            'role': {'default': UserRole.TENANT}
        }

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('confirm_password'):
            raise serializers.ValidationError(
                {'confirm_password': 'Passwords do not match.'}
            )
        return attrs

    def create(self, validated_data):
        # Use create_user — handles bcrypt hashing, never plain text
        return User.objects.create_user(**validated_data)


class UserPublicSerializer(serializers.ModelSerializer):
    """
    Read-only. Safe to return in any API response.
    Deliberately excludes password_hash, is_staff, is_superuser.
    """
    full_name = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ['id', 'email', 'full_name', 'first_name', 'last_name',
                  'phone', 'role', 'is_active', 'created_at']
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name()


class ChangePasswordSerializer(serializers.Serializer):
    """Separated from UserRegistrationSerializer — SRP."""
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8,
                                         validators=[validate_password])

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value