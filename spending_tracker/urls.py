from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('spending_tracker_app.urls')),
    path('accounts/', include('django.contrib.auth.urls')),  # Use Django’s auth URLs for login/logout
]