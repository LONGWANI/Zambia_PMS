# apps/authentication/views.py
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import (UserRegistrationSerializer, UserPublicSerializer,
                          ChangePasswordSerializer)
from .models import User


class RegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/
    Public endpoint — no authentication required to create an account.
    After registration, the client should call /login/ to get tokens.
    """
    queryset         = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # Return the safe public representation, not the write serializer
        return Response(
            UserPublicSerializer(user).data,
            status=status.HTTP_201_CREATED
        )


class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Returns: { access: "...", refresh: "..." }
    Uses simplejwt's built-in view — no need to reinvent token generation.
    """
    permission_classes = [permissions.AllowAny]


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Blacklists the refresh token so it cannot be used again.
    The access token expires naturally (8 hours) — no server-side revocation needed.
    """
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'message': 'Logged out successfully.'},
                            status=status.HTTP_200_OK)
        except Exception:
            return Response({'error': True, 'message': 'Invalid or expired token.'},
                            status=status.HTTP_400_BAD_REQUEST)


class MeView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/auth/me/   → returns current user's profile
    PUT  /api/auth/me/   → updates current user's profile
    PATCH /api/auth/me/  → partial update

    Uses request.user directly — no need for a pk lookup.
    """
    serializer_class = UserPublicSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/"""
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data,
                                              context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        return Response({'message': 'Password updated successfully.'})