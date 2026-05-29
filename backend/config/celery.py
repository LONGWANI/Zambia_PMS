import os
from celery import Celery

# CHANGE: Point to your base settings for local development instead of production
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')

# Convention: Use the name of the project configuration directory ('config')
app = Celery('config')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()