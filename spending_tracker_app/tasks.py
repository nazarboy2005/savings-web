from celery import shared_task
from django.contrib.auth.models import User
from spending_tracker_app.models import UserProfile
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

@shared_task
def cleanup_unverified_users():
    current_time = timezone.now()
    unverified_profiles = UserProfile.objects.filter(
        email_verified=False,
        token_expiry__lt=current_time
    )
    for profile in unverified_profiles:
        user = profile.user
        logger.debug(f"Deleting unverified user {user.username} due to expired token")
        user.delete()