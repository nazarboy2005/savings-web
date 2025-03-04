from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from spending_tracker_app.models import UserProfile
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Cleans up unverified user accounts older than 3 minutes.'

    def handle(self, *args, **options):
        current_time = timezone.now()
        unverified_profiles = UserProfile.objects.filter(
            email_verified=False,
            token_expiry__lt=current_time
        )

        for profile in unverified_profiles:
            user = profile.user
            logger.debug(f"Deleting unverified user {user.username} due to expired token")
            user.delete()

        self.stdout.write(self.style.SUCCESS(f"Successfully cleaned up unverified users."))