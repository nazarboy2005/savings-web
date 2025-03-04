from celery import Celery
from celery.schedules import crontab

app = Celery('spending_tracker_app')
app.conf.beat_schedule = {
    'cleanup-unverified-users-every-5-minutes': {
        'task': 'spending_tracker_app.tasks.cleanup_unverified_users',
        'schedule': crontab(minute='*/5'),  # Runs every 5 minutes
    },
}
app.conf.timezone = 'UTC'