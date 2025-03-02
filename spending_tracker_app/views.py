import os
from django.contrib.auth import update_session_auth_hash
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.db import IntegrityError, transaction
from django.http import JsonResponse, HttpResponse
from .models import Transaction, Category, Plan
from django.core.exceptions import ObjectDoesNotExist, ValidationError
import openpyxl
from django.db.models import Q, Sum, Count
from django.core.serializers.json import DjangoJSONEncoder
import json
import datetime
import logging
from decimal import Decimal
from io import BytesIO
from django.http import HttpResponse
from reportlab.lib.pagesizes import LETTER
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
import requests
import socket
import time

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Exchange rate API configuration (using exchangerate-api.com with your valid API key)
EXCHANGE_RATE_API_URL = "https://v6.exchangerate-api.com/v6"
API_ACCESS_KEY = os.getenv('API_ACCESS_KEY_exchange')  # Your valid API key from exchangerate-api.com


def test_network_connectivity():
    """
    Tests if the server can resolve and connect to v6.exchangerate-api.com.
    Returns True if successful, False otherwise.
    """
    try:
        # Test DNS resolution
        socket.getaddrinfo('v6.exchangerate-api.com', 443, socket.AF_INET, socket.SOCK_STREAM)
        # Use GET request to /latest with API key to test connectivity
        response = requests.get(
            f"{EXCHANGE_RATE_API_URL}/{API_ACCESS_KEY}/latest/USD",
            timeout=5
        )
        return response.status_code == 200
    except (socket.gaierror, requests.RequestException) as e:
        logger.error(f"Network connectivity test failed: {str(e)}")
        return False


def get_exchange_rate(from_currency, to_currency):
    """
    Fetches the latest exchange rate from from_currency to to_currency using exchangerate-api.com API.
    Returns a Decimal representing the conversion rate (to/from_currency).
    Handles QAR and other currencies, with fallback to comprehensive hardcoded rates if API fails.
    Ensures a Decimal is always returned (never None).
    """
    if from_currency == to_currency:
        return Decimal('1')

    # Test network connectivity before API call
    if not test_network_connectivity():
        logger.warning("Network connectivity issue detected. Using hardcoded rates.")
    else:
        try:
            # Check rate limits and introduce a small delay to avoid overload
            time.sleep(1)  # Delay to respect rate limits (adjust as needed)

            # Fetch exchange rates with from_currency as base and valid API key
            url = f"{EXCHANGE_RATE_API_URL}/{API_ACCESS_KEY}/latest/{from_currency}"
            response = requests.get(url, timeout=10)
            response.raise_for_status()  # Raise an exception for bad status codes
            data = response.json()
            if 'error' in data:
                raise ValueError(f"API error: {data['error']}")
            rate = data['conversion_rates'].get(to_currency, 1.0)  # Use conversion_rates for exchangerate-api.com
            if rate is None or rate == 0:
                raise ValueError("Invalid rate received from API")
            logger.debug(f"Exchange rate from {from_currency} to {to_currency}: {rate}")
            return Decimal(str(rate))
        except (requests.RequestException, ValueError, KeyError, TypeError) as e:
            logger.error(f"Failed to fetch exchange rate from {from_currency} to {to_currency}: {str(e)}")
            # Fallback to comprehensive hardcoded rates (updated for accuracy as of Feb 2025)
            HARD_CODED_RATES = {
                ('QAR', 'USD'): Decimal('0.2747'),  # 1 QAR ≈ 0.2747 USD
                ('USD', 'QAR'): Decimal('3.641'),  # 1 USD ≈ 3.641 QAR
                ('QAR', 'EUR'): Decimal('0.254'),  # 1 QAR ≈ 0.254 EUR
                ('EUR', 'QAR'): Decimal('3.937'),  # 1 EUR ≈ 3.937 QAR
                ('USD', 'EUR'): Decimal('0.924'),  # 1 USD ≈ 0.924 EUR
                ('EUR', 'USD'): Decimal('1.082'),  # 1 EUR ≈ 1.082 USD
            }
            # Ensure all pairs are covered by adding reciprocal rates
            for (curr1, curr2), rate in list(HARD_CODED_RATES.items()):
                if (curr2, curr1) not in HARD_CODED_RATES:
                    HARD_CODED_RATES[(curr2, curr1)] = Decimal('1') / rate if rate != Decimal('0') else Decimal('1')

            rate = HARD_CODED_RATES.get((from_currency, to_currency), Decimal('1'))
            logger.warning(f"Using hardcoded rate for {from_currency} to {to_currency}: {rate}")
            return rate  # Ensure a Decimal is returned, never None


def convert_currency(amount, from_curr, to_curr):
    """Converts 'amount' from from_curr -> to_curr based on API or hardcoded rates."""
    rate = get_exchange_rate(from_curr, to_curr)
    if rate is None:  # Fallback if rate is somehow None (shouldn't happen with the above change)
        logger.error(f"Rate for {from_curr} to {to_curr} is None, using default rate of 1")
        rate = Decimal('1')
    return amount * rate

def login_view(request):
    if request.user.is_authenticated:
        return redirect('spending_tracker_app:index')
    if request.method == 'POST':
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password')
            user = authenticate(username=username, password=password)
            if user is not None:
                login(request, user)
                return redirect(request.GET.get('next', 'spending_tracker_app:index'))
    else:
        form = AuthenticationForm()
    return render(request, 'login.html', {'form': form})


def signup(request):
    if request.user.is_authenticated:
        return redirect('spending_tracker_app:index')
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect('spending_tracker_app:set_currency')  # Changed from 'index'
    else:
        form = UserCreationForm()
    return render(request, 'signup.html', {'form': form})



def logout_view(request):
    logout(request)
    return redirect('spending_tracker_app:index')


@login_required
def index(request):
    transactions = Transaction.objects.filter(user=request.user).order_by('-date')
    categories = Category.objects.filter(user=request.user)  # Filter by user
    if request.method == "GET":
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        status = request.GET.get('status')
        category = request.GET.get('category')
        display_currency = request.GET.get('display_currency', 'QAR')

        if start_date and end_date:
            transactions = transactions.filter(date__range=[start_date, end_date])
        if status and status != "all":
            transactions = transactions.filter(status=status)
        if category and category != "":
            transactions = transactions.filter(category__name=category)

    # Convert all transaction amounts to the display currency and calculate totals
    converted_transactions = []
    total_earned = Decimal('0')
    total_spent = Decimal('0')

    for t in transactions:
        converted_amount = convert_currency(t.amount, t.currency, display_currency)
        converted_transactions.append({
            'id': t.id,
            'date': t.date.strftime('%Y-%m-%d'),
            'status': t.status,
            'category__name': t.category.name if t.category else 'undefined',
            'amount': float(converted_amount),  # Convert to float for JSON serialization
            'currency': display_currency,  # Use display currency for consistency
            'description': t.description,
        })
        if t.status == 'earned':
            total_earned += converted_amount
        elif t.status == 'spent':
            total_spent += converted_amount

    context = {
        'transactions': converted_transactions,
        'categories': categories,
        'display_currency': display_currency,
        'total_earned': float(total_earned),  # Convert to float for template display
        'total_spent': float(total_spent),  # Convert to float for template display
    }
    return render(request, 'index.html', context)


@login_required
def charts(request):
    transactions = Transaction.objects.filter(user=request.user).order_by('-date')
    categories = Category.objects.filter(user=request.user)

    if request.method == "GET":
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        status = request.GET.get('status')
        category = request.GET.get('category')
        display_currency = request.GET.get('display_currency', 'QAR')

        if start_date and end_date:
            transactions = transactions.filter(date__range=[start_date, end_date])
        if status and status != "all":
            transactions = transactions.filter(status=status)
        if category and category != "":
            transactions = transactions.filter(category__name=category)

    # Convert spending and earning data to display currency
    display_currency = request.GET.get('display_currency', 'QAR')
    spending_by_category = {}
    earning_by_category = {}
    spending_trends = []
    earning_trends = []
    net_balance_trends = []  # New dataset for net balance

    # Aggregate by category for spending and earning
    for t in transactions.filter(status='spent'):
        converted_amount = convert_currency(t.amount, t.currency, display_currency)
        category_name = t.category.name if t.category else 'N/A'
        spending_by_category[category_name] = spending_by_category.get(category_name, 0) + float(converted_amount)

    for t in transactions.filter(status='earned'):
        converted_amount = convert_currency(t.amount, t.currency, display_currency)
        category_name = t.category.name if t.category else 'N/A'
        earning_by_category[category_name] = earning_by_category.get(category_name, 0) + float(converted_amount)

    # Convert to lists for template
    spending_by_category_list = [{'category__name': k, 'total': v} for k, v in spending_by_category.items()]
    earning_by_category_list = [{'category__name': k, 'total': v} for k, v in earning_by_category.items()]

    # Spending and earning trends by date
    for t in transactions.filter(status='spent').values('date').annotate(total=Sum('amount')):
        common_currency = transactions.filter(status='spent').values('currency').annotate(count=Count('currency')).order_by('-count').first()
        currency = common_currency['currency'] if common_currency else 'QAR'
        converted_amount = convert_currency(Decimal(str(t['total'])), currency, display_currency)
        spending_trends.append({
            'date': t['date'].strftime('%Y-%m-%d'),
            'total': float(converted_amount),
        })

    for t in transactions.filter(status='earned').values('date').annotate(total=Sum('amount')):
        common_currency = transactions.filter(status='earned').values('currency').annotate(count=Count('currency')).order_by('-count').first()
        currency = common_currency['currency'] if common_currency else 'QAR'
        converted_amount = convert_currency(Decimal(str(t['total'])), currency, display_currency)
        earning_trends.append({
            'date': t['date'].strftime('%Y-%m-%d'),
            'total': float(converted_amount),
        })

    # Calculate net balance trends (earnings - spending) cumulatively
    all_dates = sorted(set([t['date'].strftime('%Y-%m-%d') for t in transactions.values('date')]))
    net_balance = 0
    for date in all_dates:
        spending_on_date = next((t['total'] for t in spending_trends if t['date'] == date), 0)
        earning_on_date = next((t['total'] for t in earning_trends if t['date'] == date), 0)
        net_balance += (earning_on_date - spending_on_date)  # Cumulative balance
        net_balance_trends.append({
            'date': date,
            'total': float(net_balance),
        })

    context = {
        'categories': categories,
        'spending_by_category': spending_by_category_list,
        'earning_by_category': earning_by_category_list,
        'spending_trends': spending_trends,
        'earning_trends': earning_trends,
        'net_balance_trends': net_balance_trends,  # New data for net balance
        'display_currency': display_currency,
    }
    return render(request, 'charts.html', context)



@login_required
def profile(request):
    transactions = Transaction.objects.filter(user=request.user)
    plans = Plan.objects.filter(user=request.user)
    display_currency = request.GET.get('display_currency', request.session.get('preferred_currency', 'QAR'))

    total_spent = Decimal('0')
    total_earned = Decimal('0')
    for t in transactions:
        converted_amount = convert_currency(t.amount, t.currency, display_currency)
        if t.status == 'earned':
            total_earned += converted_amount
        elif t.status == 'spent':
            total_spent += converted_amount

    ai_recommendation = "You are overspending if total spent exceeds 70% of total earned."
    if total_spent > (Decimal('0.7') * total_earned) and total_earned > Decimal('0'):
        ai_recommendation = "Warning: You are overspending! Consider reducing expenses or revising your plans."

    # Store in session for error handling in change_password
    request.session['total_earned'] = float(total_earned)
    request.session['total_spent'] = float(total_spent)
    request.session['ai_recommendation'] = ai_recommendation

    context = {
        'total_spent': float(total_spent),
        'total_earned': float(total_earned),
        'ai_recommendation': ai_recommendation,
        'plans': plans,
        'display_currency': display_currency,
    }
    return render(request, 'profile.html', context)


@login_required
def add_transaction(request):
    if request.method == "POST" and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            data = json.loads(request.body)
            logger.debug(f"Add transaction data: {data}")

            amount = Decimal(str(data.get('amount', 0)))
            if amount < 0:
                return JsonResponse({'error': 'Amount must be non-negative'}, status=400)

            category_name = data.get('category', '')
            if not category_name or not isinstance(category_name, str):
                return JsonResponse({'error': 'Category name is required and must be a string'}, status=400)

            category, created = Category.objects.get_or_create(name=category_name, user=request.user)

            date = datetime.datetime.strptime(data.get('date', datetime.date.today().strftime('%Y-%m-%d')), '%Y-%m-%d').date()

            transaction = Transaction.objects.create(
                user=request.user,
                date=date,
                status=data.get('status', 'spent'),
                category=category,
                amount=amount,
                currency=data.get('currency', 'QAR'),
                description=data.get('description', '')
            )

            if transaction.status == 'spent':
                deduct_from_plans(request.user, category.name, float(amount))

            display_currency = request.GET.get('display_currency', 'QAR')
            converted_amount = convert_currency(transaction.amount, transaction.currency, display_currency)
            currency = display_currency

            return JsonResponse({
                'transaction': {
                    'id': transaction.id,
                    'date': date.strftime('%Y-%m-%d'),
                    'status': transaction.status,
                    'category__name': category.name,
                    'amount': float(converted_amount),
                    'currency': currency,
                    'description': transaction.description
                }
            }, encoder=DjangoJSONEncoder, safe=False)

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON data: {str(e)}")
            return JsonResponse({'error': 'Invalid JSON data'}, status=400)
        except Exception as e:
            logger.error(f"Error in add_transaction: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@login_required
def update_transaction(request, transaction_id):
    if request.method == "POST" and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            data = json.loads(request.body)
            logger.debug(f"Update transaction data for ID {transaction_id}: {data}")
            transaction = get_object_or_404(Transaction, id=transaction_id, user=request.user)

            amount = Decimal(str(data.get('amount', str(transaction.amount))))
            if amount < 0:
                return JsonResponse({'error': 'Amount must be non-negative'}, status=400)

            category_name = data.get('category', transaction.category.name if transaction.category else '')
            if not category_name or not isinstance(category_name, str):
                return JsonResponse({'error': 'Category name is required and must be a string'}, status=400)

            category, created = Category.objects.get_or_create(name=category_name, user=request.user)

            date = datetime.datetime.strptime(data.get('date', transaction.date.strftime('%Y-%m-%d')), '%Y-%m-%d').date()

            transaction.date = date
            transaction.status = data.get('status', transaction.status)
            transaction.category = category
            transaction.amount = amount
            transaction.currency = data.get('currency', transaction.currency)
            transaction.description = data.get('description', transaction.description)
            transaction.save()

            if transaction.status == 'spent':
                deduct_from_plans(request.user, category.name, float(amount))

            display_currency = request.GET.get('display_currency', 'QAR')
            converted_amount = convert_currency(transaction.amount, transaction.currency, display_currency)
            currency = display_currency

            return JsonResponse({
                'transaction': {
                    'id': transaction.id,
                    'date': transaction.date.strftime('%Y-%m-%d'),
                    'status': transaction.status,
                    'category__name': category.name,
                    'amount': float(converted_amount),
                    'currency': currency,
                    'description': transaction.description
                }
            }, encoder=DjangoJSONEncoder, safe=False)

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON data: {str(e)}")
            return JsonResponse({'error': 'Invalid JSON data'}, status=400)
        except Exception as e:
            logger.error(f"Error in update_transaction for ID {transaction_id}: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=405)


@login_required
def get_transaction(request, transaction_id):
    transaction = get_object_or_404(Transaction, id=transaction_id, user=request.user)
    display_currency = request.GET.get('display_currency', 'QAR')  # Get from query params if available
    converted_amount = convert_currency(transaction.amount, transaction.currency, display_currency)
    return JsonResponse({
        'id': transaction.id,
        'date': transaction.date.strftime('%Y-%m-%d'),
        'status': transaction.status,
        'category': transaction.category.name if transaction.category else None,
        'amount': float(converted_amount),
        'currency': display_currency,
        'description': transaction.description
    })


@login_required
def delete_transaction(request, transaction_id):
    if request.method == "POST" and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            # Explicitly check if request is defined
            if not request:
                logger.error(f"Request object is not defined for transaction_id {transaction_id}")
                return JsonResponse({'error': 'Internal server error: Request object missing'}, status=500)

            try:
                transaction = Transaction.objects.get(id=transaction_id, user=request.user)
            except Transaction.DoesNotExist:
                logger.error(f"Transaction {transaction_id} not found for user {request.user}")
                return JsonResponse({'error': 'Transaction not found'}, status=404)

            logger.debug(f"Deleting transaction {transaction_id}: {transaction}")
            if transaction.status == 'spent':
                # Pass request.user to the helper function
                add_to_plans(request.user, transaction.category.name if transaction.category else '',
                             float(transaction.amount))
            transaction.delete()
            # Convert transactions for the response
            display_currency = request.GET.get('display_currency', 'QAR')  # Get from query params if available
            transactions = Transaction.objects.filter(user=request.user).order_by('-date').values(
                'id', 'date', 'status', 'category__name', 'amount', 'currency', 'description'
            )
            converted_transactions = []
            for t in transactions:
                conv_amount = convert_currency(Decimal(str(t['amount'])), t['currency'], display_currency)
                converted_transactions.append({
                    'id': t['id'],
                    'date': t['date'],
                    'status': t['status'],
                    'category__name': t['category__name'],
                    'amount': float(conv_amount),
                    'currency': display_currency,
                    'description': t['description'],
                })
            return JsonResponse({'transactions': converted_transactions}, encoder=DjangoJSONEncoder, safe=False)
        except Exception as e:
            logger.error(f"Error in delete_transaction for ID {transaction_id}: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)


@login_required
def plans(request):
    try:
        plans = Plan.objects.filter(user=request.user)
        for plan in plans:
            plan.update_status()
        plans_data = plans.values(
            'id', 'type', 'amount', 'description', 'from_date', 'to_date', 'left_money', 'status'
        )
        return JsonResponse({'plans': list(plans_data)}, encoder=DjangoJSONEncoder, safe=False)
    except Exception as e:
        logger.error(f"Error in plans view: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def add_plan(request):
    if request.method == "POST" and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            data = json.loads(request.body)
            logger.debug(f"Add plan data: {data}")
            categories = data.get('categories', '').split(',')
            plan = Plan.objects.create(
                user=request.user,
                type=data.get('type', 'monthly'),
                amount=Decimal(str(data.get('amount', 0))),
                description=data.get('description', ''),
                from_date=data.get('from_date'),
                to_date=data.get('to_date')
            )
            plan.categories.set(Category.objects.filter(name__in=categories, user=request.user))
            plan.save()
            plans = Plan.objects.filter(user=request.user).values(
                'id', 'type', 'amount', 'description', 'from_date', 'to_date', 'left_money', 'status'
            )
            return JsonResponse({'plans': list(plans)}, encoder=DjangoJSONEncoder, safe=False)
        except Exception as e:
            logger.error(f"Error in add_plan: {str(e)}")
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Invalid request method'}, status=400)


@login_required
def get_plan(request, plan_id):
    plan = get_object_or_404(Plan, id=plan_id, user=request.user)
    return JsonResponse({
        'id': plan.id,
        'type': plan.type,
        'amount': float(plan.amount),
        'description': plan.description,
        'categories': [c.name for c in plan.categories.all()],
        'from_date': plan.from_date.strftime('%Y-%m-%d'),
        'to_date': plan.to_date.strftime('%Y-%m-%d'),
        'left_money': float(plan.left_money),
        'status': plan.status
    })


@login_required
def update_plan(request, plan_id):
    if request.method == "POST" and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            data = json.loads(request.body)
            logger.debug(f"Update plan data: {data}")
            plan = get_object_or_404(Plan, id=plan_id, user=request.user)
            plan.type = data.get('type', plan.type)
            plan.amount = Decimal(str(data.get('amount', float(plan.amount))))
            plan.description = data.get('description', plan.description)
            plan.from_date = data.get('from_date', plan.from_date)
            plan.to_date = data.get('to_date', plan.to_date)
            plan.left_money = Decimal(str(data.get('amount', float(plan.amount))))  # Reset on update
            plan.categories.set(
                Category.objects.filter(name__in=data.get('categories', '').split(','), user=request.user))
            plan.save()
            plans = Plan.objects.filter(user=request.user).values(
                'id', 'type', 'amount', 'description', 'from_date', 'to_date', 'left_money', 'status'
            )
            return JsonResponse({'plans': list(plans)}, encoder=DjangoJSONEncoder, safe=False)
        except Exception as e:
            logger.error(f"Error in update_plan: {str(e)}")
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Invalid request method'}, status=400)


@login_required
def delete_plan(request, plan_id):
    if request.method == "POST" and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            plan = get_object_or_404(Plan, id=plan_id, user=request.user)
            plan.delete()
            plans = Plan.objects.filter(user=request.user).values(
                'id', 'type', 'amount', 'description', 'from_date', 'to_date', 'left_money', 'status'
            )
            return JsonResponse({'plans': list(plans)}, encoder=DjangoJSONEncoder, safe=False)
        except Exception as e:
            logger.error(f"Error in delete_plan: {str(e)}")
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Invalid request method'}, status=400)


@login_required
def generate_report(request):
    if request.method == "POST":
        start_date = request.POST.get('start_date')
        end_date = request.POST.get('end_date')
        status = request.POST.get('status')
        category = request.POST.get('category')
        format = request.POST.get('format', 'excel')
        filename = request.POST.get('filename', 'report')
        display_currency = request.POST.get('display_currency', 'QAR')

        # Query only user's data
        transactions = Transaction.objects.filter(user=request.user)

        # Apply the same filters as in the index view
        if start_date and end_date:
            transactions = transactions.filter(date__range=[start_date, end_date])
        if status and status != 'all':
            transactions = transactions.filter(status=status)
        if category and category != '':
            transactions = transactions.filter(category__name=category)

        # Convert all transaction amounts to the display currency
        converted_transactions = []
        for t in transactions:
            converted_amount = convert_currency(t.amount, t.currency, display_currency)
            converted_transactions.append({
                'date': t.date,
                'status': t.status,
                'category__name': t.category.name if t.category else 'N/A',
                'amount': float(converted_amount),
                'currency': display_currency,
                'description': t.description,
            })

        if format == "excel":
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Transactions"
            ws.append(['Date', 'Status', 'Category', 'Amount', 'Currency', 'Description'])
            for t in converted_transactions:
                ws.append([t['date'], t['status'], t['category__name'], t['amount'], t['currency'], t['description']])
            buffer = BytesIO()
            wb.save(buffer)
            buffer.seek(0)
            response = HttpResponse(buffer,
                                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = f'attachment; filename={filename}.xlsx'
            return response

        elif format == "pdf":
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
            from reportlab.lib import colors
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch

            buffer = BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=LETTER,
                                    rightMargin=72, leftMargin=72,
                                    topMargin=72, bottomMargin=18)
            flowables = []
            styles = getSampleStyleSheet()
            flowables.append(Paragraph("Spending Tracker Report", styles["Title"]))
            flowables.append(Spacer(1, 12))  # some vertical space

            # Define a custom style for wrapped text in the description
            description_style = ParagraphStyle(
                'DescriptionStyle',
                parent=styles['Normal'],
                wordWrap='CJK',  # Enables word wrapping
                fontSize=10,
                leading=12,
            )

            table_data = [
                ["Date", "Status", "Category", "Amount", "Currency", "Description"]
            ]
            for t in converted_transactions:
                table_data.append([
                    t["date"],
                    t["status"],
                    t.get("category__name") or "N/A",
                    str(t["amount"]),
                    t["currency"],
                    Paragraph(t["description"], description_style),  # Wrap description text
                ])

            # Define column widths to ensure description has enough space
            col_widths = [80, 60, 80, 60, 60, 200]  # Adjust 200 for description to allow wrapping
            table = Table(table_data, colWidths=col_widths)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.2, 0.5, 0.8)),  # bluish
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ("ALIGN", (3, 1), (4, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                # Ensure description column wraps text
                ("LEFTPADDING", (5, 1), (5, -1), 5),
                ("RIGHTPADDING", (5, 1), (5, -1), 5),
            ]))

            flowables.append(table)

            doc.build(flowables)
            buffer.seek(0)
            response = HttpResponse(buffer, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{filename}.pdf"'
            return response
    return JsonResponse({'error': 'Invalid request method'}, status=400)



@login_required
def categories(request):
    categories = Category.objects.filter(user=request.user)
    context = {'categories': categories}
    return render(request, 'categories.html', context)


@login_required
def add_category(request):
    if request.method == "POST":
        try:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                data = json.loads(request.body)
                logger.debug(f"Add category data (AJAX): {data}")
                category_name = data.get('name')
            else:
                category_name = request.POST.get('name')
                logger.debug(f"Add category data (form): {category_name}")

            if not category_name or not isinstance(category_name, str):
                return JsonResponse({'error': 'Category name is required and must be a string'}, status=400)

            category, created = Category.objects.get_or_create(name=category_name.title(), user=request.user)
            categories = Category.objects.filter(user=request.user).values('id', 'name')

            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'categories': list(categories)}, encoder=DjangoJSONEncoder, safe=False)
            else:
                return redirect('spending_tracker_app:index')
        except Exception as e:
            logger.error(f"Error in add_category: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)


@login_required
def get_categories(request):
    categories = Category.objects.filter(user=request.user).values('id', 'name')
    return JsonResponse({'categories': list(categories)}, encoder=DjangoJSONEncoder, safe=False)


@login_required
def update_category(request):
    if request.method == "POST" and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            data = json.loads(request.body)
            logger.debug(f"Update category data: {data}")
            category_id = data.get('category_id')
            new_name = data.get('name')

            if not category_id or not new_name or not isinstance(new_name, str):
                return JsonResponse({'error': 'Please provide a category ID and a valid name'}, status=400)

            # Validate new_name (e.g., remove excessive whitespace and check length)
            new_name = new_name.strip()
            if not new_name or len(new_name) > 100:  # Adjust max length based on your model
                return JsonResponse({'error': 'Category name cannot be empty or too long (max 100 characters)'},
                                    status=400)

            category = get_object_or_404(Category, id=category_id, user=request.user)

            # Check for duplicate category name (case-insensitive) excluding the current category
            if Category.objects.filter(user=request.user, name__iexact=new_name).exclude(id=category_id).exists():
                return JsonResponse(
                    {'error': f'This category name "{new_name}" is already in use, please choose another.'}, status=400)

            # Use transaction to ensure atomicity
            with transaction.atomic():
                category.name = new_name
                category.save()

            # Fetch updated list of categories for the user
            categories = Category.objects.filter(user=request.user).values('id', 'name')
            return JsonResponse({'categories': list(categories)}, encoder=DjangoJSONEncoder, safe=False)

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON data: {str(e)}")
            return JsonResponse({'error': 'The data sent was invalid, please try again'}, status=400)
        except ObjectDoesNotExist:
            logger.error(f"Category with ID {category_id} not found for user {request.user}")
            return JsonResponse({'error': 'The category you tried to edit was not found'}, status=404)
        except IntegrityError as e:
            logger.error(f"Integrity error updating category: {str(e)}")
            return JsonResponse({'error': 'This category name is already in use, please choose a different name'},
                                status=400)
        except ValidationError as e:
            logger.error(f"Validation error updating category: {str(e)}")
            return JsonResponse({'error': f'The category name is not valid, please use a different name'}, status=400)
        except Exception as e:
            logger.error(f"Unexpected error in update_category: {str(e)}", exc_info=True)
            return JsonResponse({'error': 'Something went wrong while updating the category, please try again later'},
                                status=500)
    return JsonResponse({'error': 'Invalid request method, please use the correct method'}, status=405)
@login_required
def delete_category(request, category_id):
    if request.method == "POST" and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            category = get_object_or_404(Category, id=category_id, user=request.user)
            # Delete associated transactions
            Transaction.objects.filter(user=request.user, category=category).delete()
            category.delete()
            categories = Category.objects.filter(user=request.user).values('id', 'name')
            return JsonResponse({'categories': list(categories)}, encoder=DjangoJSONEncoder, safe=False)
        except Exception as e:
            logger.error(f"Error in delete_category for ID {category_id}: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=405)


@login_required
def get_transactions(request):
    transactions = Transaction.objects.filter(user=request.user).order_by('-date').values(
        'id', 'date', 'status', 'category__name', 'amount', 'currency', 'description'
    )
    display_currency = request.GET.get('display_currency', 'QAR')  # Get from query params if available
    converted_transactions = []
    for t in transactions:
        conv_amount = convert_currency(Decimal(str(t['amount'])), t['currency'], display_currency)
        converted_transactions.append({
            'id': t['id'],
            'date': t['date'],
            'status': t['status'],
            'category__name': t['category__name'],
            'amount': float(conv_amount),
            'currency': display_currency,
            'description': t['description'],
        })
    return JsonResponse({'transactions': converted_transactions}, encoder=DjangoJSONEncoder, safe=False)


def deduct_from_plans(user, category_name, amount):
    plans = Plan.objects.filter(user=user, status='Active')
    today = datetime.date.today()
    for plan in plans:
        if plan.from_date <= today <= plan.to_date:  # Simplified date comparison
            if plan.categories.filter(name=category_name).exists() or \
                    'all' in [c.name.lower() for c in plan.categories.all()]:
                plan.left_money = max(Decimal('0'), plan.left_money - Decimal(str(amount)))
                plan.save()


def add_to_plans(user, category_name, amount):
    plans = Plan.objects.filter(user=user)
    for plan in plans:
        if plan.categories.filter(name=category_name).exists() or \
                'all' in [c.name.lower() for c in plan.categories.all()]:
            plan.left_money += Decimal(str(amount))
            plan.save()


@login_required
def set_currency(request):
    if request.method == 'POST':
        preferred_currency = request.POST.get('preferred_currency')
        if preferred_currency:
            request.session['preferred_currency'] = preferred_currency
            return redirect('spending_tracker_app:index')
    return render(request, 'set_currency.html')


@login_required
def change_password(request):
    if request.method == 'POST':
        old_password = request.POST.get('old_password')
        new_password = request.POST.get('new_password')
        if request.user.check_password(old_password):
            request.user.set_password(new_password)
            request.user.save()
            update_session_auth_hash(request, request.user)  # Keep user logged in
            return redirect('spending_tracker_app:profile')
        else:
            return render(request, 'profile.html', {
                'total_earned': request.session.get('total_earned', 0),
                'total_spent': request.session.get('total_spent', 0),
                'ai_recommendation': request.session.get('ai_recommendation', ''),
                'error': 'Old password is incorrect'
            })
    return redirect('spending_tracker_app:profile')

@login_required
def update_currency(request):
    if request.method == 'POST':
        preferred_currency = request.POST.get('preferred_currency')
        if preferred_currency:
            request.session['preferred_currency'] = preferred_currency
        return redirect('spending_tracker_app:profile')
    return redirect('spending_tracker_app:profile')

@login_required
def clear_records(request):
    if request.method == 'POST' and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            Transaction.objects.filter(user=request.user).delete()
            Category.objects.filter(user=request.user).delete()
            Plan.objects.filter(user=request.user).delete()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    return JsonResponse({'success': False, 'error': 'Invalid request method'}, status=400)