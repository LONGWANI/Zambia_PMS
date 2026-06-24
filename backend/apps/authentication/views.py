# apps/authentication/views.py
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import (UserRegistrationSerializer, UserPublicSerializer,
                          ChangePasswordSerializer, CustomTokenObtainPairSerializer)
from .models import User


class RegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/
    Public endpoint — no authentication required to create an account.
    """
    queryset         = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserPublicSerializer(user).data,
            status=status.HTTP_201_CREATED
        )


class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Returns: { access: "...", refresh: "...", user: { ... } }
    Uses our custom serializer to eliminate extra profile network calls.
    """
    serializer_class = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Blacklists the refresh token so it cannot be used again.
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
    GET/PUT/PATCH /api/auth/me/
    """
    serializer_class = UserPublicSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """
    POST /api/auth/change-password/
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data,
                                              context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        return Response({'message': 'Password changed successfully.'}, status=status.HTTP_200_OK)