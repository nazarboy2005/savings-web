from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

app_name = 'spending_tracker_app'

urlpatterns = [
    path('', views.landing, name='landing'),
    path('home/', views.index, name='index'),
    path('add_transaction/', views.add_transaction, name='add_transaction'),
    path('get_transaction/<int:transaction_id>/', views.get_transaction, name='get_transaction'),
    path('update_transaction/<int:transaction_id>/', views.update_transaction, name='update_transaction'),
    path('delete_transaction/<int:transaction_id>/', views.delete_transaction, name='delete_transaction'),
    path('plans/', views.plans, name='plans'),
    path('add_plan/', views.add_plan, name='add_plan'),
    path('get_plan/<int:plan_id>/', views.get_plan, name='get_plan'),
    path('update_plan/<int:plan_id>/', views.update_plan, name='update_plan'),
    path('delete_plan/<int:plan_id>/', views.delete_plan, name='delete_plan'),
    path('generate_report/', views.generate_report, name='generate_report'),
    path('add_category/', views.add_category, name='add_category'),
    path('get_categories/', views.get_categories, name='get_categories'),
    path('get_transactions/', views.get_transactions, name='get_transactions'),  # New URL for fetching transactions
    path('charts/', views.charts, name='charts'),  # New charts page
    path('profile/', views.profile, name='profile'),  # New profile page for AI recommendations
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('signup/', views.signup, name='signup'),
    path('verify-email/<str:token>/', views.verify_email, name='verify_email'),
    path('resend-verification/', views.resend_verification_email, name='resend_verification'),
    path('password_reset/', views.password_reset_request, name='password_reset'),
    path('password_reset/done/', views.password_reset_done, name='password_reset_done'),
    path('reset/<uidb64>/<token>/', views.password_reset_confirm, name='password_reset_confirm'),
    path('reset/done/', views.password_reset_complete, name='password_reset_complete'),
    path('signup-success/', views.signup_success, name='signup_success'),
    path('email-verified/', views.email_verified, name='email_verified'),
    path('email-verification-failed/', views.email_verification_failed, name='email_verification_failed'),
    path('set_currency/', views.set_currency, name='set_currency'),
    path('change_password/', views.change_password, name='change_password'),
    path('update_currency/', views.update_currency, name='update_currency'),
    path('clear_records/', views.clear_records, name='clear_records'),
    path('update_category/', views.update_category, name='update_category'),
    path('categories/', views.categories, name='categories'),
    path('delete_category/<int:category_id>/', views.delete_category, name='delete_category'),
]
