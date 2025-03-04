from django.apps import AppConfig
from django.conf import settings

class SpendingTrackerAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'spending_tracker_app'

    def ready(self):
        import spending_tracker_app.signals  # Import signals
        if settings.ENVIRONMENT == 'worker':  # Check if running in Celery context
            import spending_tracker_app.signals  # Re-import for workers (optional)