from django.shortcuts import render
from django.http import Http404, HttpResponseServerError

def custom_404(request, exception):
    """
    Custom 404 Not Found handler.
    """
    return render(request, 'error-pages/404.html')

def custom_500(request):
    """
    Custom 500 Internal Server Error handler.
    """
    return render(request, 'error-pages/500.html')


# spending_tracker_app/views.py
def custom_403(request, exception):
    """
    Custom 403 Forbidden handler.
    """
    return render(request, 'error-pages/403.html')

def custom_400(request, exception):
    """
    Custom 400 Bad Request handler.
    """
    return render(request, 'error-pages/400.html')