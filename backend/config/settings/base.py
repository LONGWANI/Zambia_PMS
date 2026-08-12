# config/settings/base.py
"""
Base settings for ZambiaPMS.
All environment-specific values are loaded from .env – never hardcoded.
"""

import environ
from pathlib import Path
from celery.schedules import crontab
import os

# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load environment variables
env = environ.Env()
environ.Env.read_env(BASE_DIR / '.env')

# ---------- Core Settings ----------
SECRET_KEY = env('DJANGO_SECRET_KEY')
DEBUG = env.bool('DJANGO_DEBUG', default=False)
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=[])

# Security validation
if not DEBUG and not ALLOWED_HOSTS:
    raise ValueError("ALLOWED_HOSTS must be set when DEBUG=False")

if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET_KEY must be set")

# ---------- Application Definition ----------
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
]

LOCAL_APPS = [
    'apps.authentication',
    'apps.properties',
    'apps.tenants',
    'apps.billing',
    'apps.maintenance',
    'apps.reports',
    'apps.notifications',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # Must be before CommonMiddleware
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
AUTH_USER_MODEL = 'authentication.User'

# ---------- Templates (UPDATED FOR FRONTEND) ----------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        # Look for the frontend folder strictly outside the backend folder
        'DIRS': [
            BASE_DIR.parent / 'frontend', 
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ---------- Database ----------
DATABASES = {
    'default': env.db('DATABASE_URL')
}
DATABASES['default']['ATOMIC_REQUESTS'] = True  # Wrap each request in a transaction

# ---------- Password Validation ----------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ---------- Internationalisation (Zambia) ----------
LANGUAGE_CODE = 'en-gb'
TIME_ZONE = 'Africa/Lusaka'
USE_I18N = True
USE_TZ = True

# ---------- Static & Media (UPDATED FOR FRONTEND) ----------
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# This tells Django where to find the CSS, JS, and Images for your index.html
STATICFILES_DIRS = [
    BASE_DIR.parent / 'frontend',
]

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# ---------- REST Framework ----------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardResultsPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    'EXCEPTION_HANDLER': 'core.exceptions.custom_exception_handler',
    #'DEFAULT_THROTTLE_CLASSES': [
    #    'rest_framework.throttling.AnonRateThrottle',   
    #    'rest_framework.throttling.UserRateThrottle',   
    #],
    #'DEFAULT_THROTTLE_RATES': {
    #    'anon': '10/hour',      
    #    'user': '100/hour',     
    #},
}

# ---------- JWT Settings ----------
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),       
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'ALGORITHM': 'HS256',
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ---------- CORS ----------
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[
    'http://localhost:3000',
    'http://127.0.0.1:5500',
])
CORS_ALLOW_CREDENTIALS = True

# ---------- Celery ----------
CELERY_BROKER_URL = env('REDIS_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = env('REDIS_URL', default='redis://localhost:6379/0')
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  

CELERY_BEAT_SCHEDULE = {
    'daily-arrears-check': {
        'task': 'apps.billing.tasks.run_daily_arrears_check',
        'schedule': crontab(hour=8, minute=0),  
    },
    'weekly-lease-expiry-warnings': {
        'task': 'apps.billing.tasks.send_lease_expiry_warnings',
        'schedule': crontab(day_of_week=1, hour=9, minute=0),  
    },
}

# ---------- Logging ----------
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'zambia_pms.log',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
    },
}

os.makedirs(BASE_DIR / 'logs', exist_ok=True)

# ---------- Default primary key field type ----------
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'