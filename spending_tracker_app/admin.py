from django.contrib import admin
from .models import Category, Transaction, Plan

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name',)

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('date', 'status', 'category', 'amount', 'currency', 'description')
    list_filter = ('status', 'category', 'date')
    search_fields = ('description',)

@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ('type', 'amount', 'description', 'from_date', 'to_date', 'left_money', 'status')
    filter_horizontal = ('categories',)