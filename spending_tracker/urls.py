from django.conf import settings
from django.contrib import admin
from django.conf.urls.static import static
from django.urls import path, include
from django.conf.urls import handler404, handler500, handler403, handler400



urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('spending_tracker_app.urls')),
    path('accounts/', include('django.contrib.auth.urls')),  # Use Django’s auth URLs for login/logout
]


urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)


handler404 = 'spending_tracker.views.custom_404'
handler500 = 'spending_tracker.views.custom_500'
handler403 = 'spending_tracker.views.custom_403'
handler400 = 'spending_tracker.views.custom_400'