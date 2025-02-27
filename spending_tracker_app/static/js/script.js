// Declare global variables once at the top
let transactions = [];
let categories = [];
let plans = [];

// Helper function to get CSRF token for Django
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// DOM Loaded event to initialize page-specific logic
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded, checking page and buttons...");

    // Run dashboard initialization on every load (remove restrictive path check)
    checkDashboardButtons();
    // Call updateTotals after page load to initialize totals based on server-rendered table
    updateTotals();

    // Determine the current page and initialize accordingly for plans (if needed)
    const currentPath = window.location.pathname;
    if (currentPath === '/plans/') {
        checkPlanButtons();
        fetchPlans();
    }
    // No fetch for other pages like login or profile unless needed
});

// Check buttons on the dashboard page
function checkDashboardButtons() {
    console.log("Checking dashboard buttons...");
    const transactionBtn = document.querySelector('.add-transaction-btn');
    const categoryBtn = document.querySelector('.add-category-btn');
    const reportBtn = document.querySelector('.get-report-btn');

    console.log("Transaction button exists:", transactionBtn);
    console.log("Category button exists:", categoryBtn);
    console.log("Report button exists:", reportBtn);

    // Add event listeners if buttons exist
    if (transactionBtn) {
        transactionBtn.addEventListener('click', openTransactionForm);
    }
    if (categoryBtn) {
        categoryBtn.addEventListener('click', openCategoryForm);
    }
    if (reportBtn) {
        reportBtn.addEventListener('click', openReportModal);
    }
}

// Check buttons on the plans page
function checkPlanButtons() {
    console.log("Checking plan buttons...");
    const planBtn = document.querySelector('.add-plan-btn');

    console.log("Plan button exists:", planBtn);

    if (planBtn) {
        planBtn.addEventListener('click', openPlanForm);
    }
}

async function fetchRate(fromCur, toCur) {
    if (fromCur === toCur) return 1;
    const url = `https://api.exchangerate.host/latest?base=${fromCur}&symbols=${toCur}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        return data.rates[toCur] || 1;
    } catch (error) {
        console.error('Error fetching exchange rate:', error.message);
        // Fallback to hardcoded rates
        const HARD_CODED_RATES = {
            "QAR->USD": 0.27,
            "USD->QAR": 3.64,
            "QAR->EUR": 0.25,
            "EUR->QAR": 4.00,
        };
        return HARD_CODED_RATES[`${fromCur}->${toCur}`] || 1;
    }
}
// Fetch transactions (only for dashboard page, kept for reference but not called)
function convertAmount(amount, fromCurr, toCurr) {
    return amount * fetchRate(fromCurr, toCurr);
}
// Fetch transactions with conversion
function fetchTransactions() {
    const table = document.getElementById("expenseTable");
    if (!table) {
        console.warn("Expense table not found, skipping transaction fetch");
        return;
    }

    const status = document.getElementById('filterStatus')?.value || 'all';
    const category = document.getElementById('filterCategory')?.value || '';
    const startDate = document.getElementById('startDate')?.value || '';
    const endDate = document.getElementById('endDate')?.value || '';
    const displayCurrency = document.getElementById('displayCurrency')?.value || 'QAR';
    const url = `/get_transactions/?status=${encodeURIComponent(status)}&category=${encodeURIComponent(category)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;

    fetch(url, {
        method: 'GET',
        headers: { 'X-CSRFToken': getCookie('csrftoken') }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        return response.json();
    })
    .then(async data => {
        // Convert each transaction amount to display_currency
        const convertedTransactions = await Promise.all(data.transactions.map(async t => {
            const convertedAmount = await convertAmount(t.amount, t.currency, displayCurrency);
            return {
                ...t,
                amount: convertedAmount,
                currency: displayCurrency,
            };
        }));
        transactions = convertedTransactions || [];
        updateTable(transactions);
        updateTotals();
        showSummary();
        updatePlanStatus();
        updateVisualizations();
        console.log("Transactions fetched and converted:", transactions);
    })
    .catch(error => {
        console.error('Error fetching transactions:', error.message || error);
        alert("Failed to fetch transactions. Check console for details.");
    });
}


// Fetch categories (only for dashboard page, kept for reference but not called)
function fetchCategories() {
    const categorySelect = document.getElementById("category");
    const editCategorySelect = document.getElementById("editCategory");
    const filterCategorySelect = document.getElementById("filterCategory");
    if (!categorySelect && !editCategorySelect && !filterCategorySelect) {
        console.warn("Category dropdowns not found, skipping category fetch");
        return Promise.reject(new Error("Category dropdowns not found in the DOM."));
    }

    return fetch('/get_categories/', {
        method: 'GET',
        headers: { 'X-CSRFToken': getCookie('csrftoken') }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        return response.json();
    })
    .then(data => {
        categories = data.categories.map(cat => ({ id: cat.id, name: cat.name }));
        if (categorySelect) populateCategoryDropdown("category");
        if (editCategorySelect) populateCategoryDropdown("editCategory");
        if (filterCategorySelect) populateFilterCategoryDropdown();
        console.log("Categories fetched:", categories);
        return categories; // Return for Promise chaining
    })
    .catch(error => {
        console.error('Error fetching categories:', error.message || error);
        alert("Failed to fetch categories. Check console for details.");
        return Promise.reject(error);
    });
}

// Fetch plans (only for plans page)
function fetchPlans() {
    const planTable = document.getElementById("planTable");
    if (!planTable) {
        console.warn("Plan table not found, skipping plan fetch");
        return;
    }

    fetch('/plans/', {
        method: 'GET',
        headers: { 'X-CSRFToken': getCookie('csrftoken') }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        return response.json();
    })
    .then(data => {
        plans = data.plans || [];
        updatePlanTable();
        updatePlanStatus();
        console.log("Plans fetched:", plans);
    })
    .catch(error => {
        console.error('Error fetching plans:', error.message || error);
        alert("Failed to fetch plans. Check console for details.");
    });
}

// Modal functions (ensure they check for existence)
function openTransactionForm() {
    console.log("Opening transaction form...");
    const transactionModal = document.getElementById("transactionModal");
    const categorySelect = document.getElementById("category");
    if (!transactionModal) {
        console.error("Transaction modal not found");
        return;
    }
    if (!categorySelect) {
        console.error("Category dropdown not found in transaction modal");
        return;
    }
    // Ensure categories are populated before opening (retry if not ready)
    if (categories.length === 0) {
        fetchCategories().then(() => {
            populateCategoryDropdown("category");
            transactionModal.style.display = "block";
            document.getElementById("overlay").style.display = "block";
        }).catch(error => {
            console.error('Error fetching categories for transaction modal:', error.message || error);
            alert("Failed to load categories for transaction modal. Check console for details.");
        });
    } else {
        populateCategoryDropdown("category");
        transactionModal.style.display = "block";
        document.getElementById("overlay").style.display = "block";
    }
}

function closeTransactionForm() {
    const transactionModal = document.getElementById("transactionModal");
    if (!transactionModal) {
        console.error("Transaction modal not found");
        return;
    }
    transactionModal.style.display = "none";
    document.getElementById("overlay").style.display = "none";
    document.getElementById("transactionForm").reset();
}

function openEditForm() {
    console.log("Opening edit form...");
    const editModal = document.getElementById("editModal");
    const editCategorySelect = document.getElementById("editCategory");
    if (!editModal) {
        console.error("Edit modal not found");
        return;
    }
    if (!editCategorySelect) {
        console.error("Category dropdown not found in edit modal");
        return;
    }
    // Ensure categories are populated before opening (retry if not ready)
    if (categories.length === 0) {
        fetchCategories().then(() => {
            populateCategoryDropdown("editCategory");
            editModal.style.display = "block";
            document.getElementById("overlay").style.display = "block";
        }).catch(error => {
            console.error('Error fetching categories for edit modal:', error.message || error);
            alert("Failed to load categories for edit modal. Check console for details.");
        });
    } else {
        populateCategoryDropdown("editCategory");
        editModal.style.display = "block";
        document.getElementById("overlay").style.display = "block";
    }
}

function closeEditForm() {
    const editModal = document.getElementById("editModal");
    if (!editModal) {
        console.error("Edit modal not found");
        return;
    }
    editModal.style.display = "none";
    document.getElementById("overlay").style.display = "none";
}

function openCategoryForm() {
    console.log("Opening category form...");
    const categoryModal = document.getElementById("categoryModal");
    if (!categoryModal) {
        console.error("Category modal not found");
        return;
    }
    categoryModal.style.display = "block";
    document.getElementById("overlay").style.display = "block";
}

function closeCategoryForm() {
    const categoryModal = document.getElementById("categoryModal");
    if (!categoryModal) {
        console.error("Category modal not found");
        return;
    }
    categoryModal.style.display = "none";
    document.getElementById("overlay").style.display = "none";
    // No reset needed since form submission handles it
}

function openPlanForm() {
    console.log("Opening plan form...");
    const planModal = document.getElementById("planModal");
    if (!planModal) {
        console.error("Plan modal not found");
        return;
    }
    planModal.style.display = "block";
    document.getElementById("overlay").style.display = "block";
    document.getElementById("planForm").reset();
}

function closePlanForm() {
    const planModal = document.getElementById("planModal");
    if (!planModal) {
        console.error("Plan modal not found");
        return;
    }
    planModal.style.display = "none";
    document.getElementById("overlay").style.display = "none";
}

function openEditPlanForm() {
    console.log("Opening edit plan form...");
    const editPlanModal = document.getElementById("editPlanModal");
    if (!editPlanModal) {
        console.error("Edit Plan modal not found");
        return;
    }
    editPlanModal.style.display = "block";
    document.getElementById("overlay").style.display = "block";
}

function closeEditPlanForm() {
    const editPlanModal = document.getElementById("editPlanModal");
    if (!editPlanModal) {
        console.error("Edit Plan modal not found");
        return;
    }
    editPlanModal.style.display = "none";
    document.getElementById("overlay").style.display = "none";
}

function openReportModal() {
    console.log("Opening report modal...");
    const reportModal = document.getElementById("reportModal");
    if (!reportModal) {
        console.error("Report modal not found");
        return;
    }
    reportModal.style.display = "block";
    document.getElementById("overlay").style.display = "block";
    document.getElementById("reportFilename").value = "report";
}

function closeReportModal() {
    const reportModal = document.getElementById("reportModal");
    if (!reportModal) {
        console.error("Report modal not found");
        return;
    }
    reportModal.style.display = "none";
    document.getElementById("overlay").style.display = "none";
}

// Populate category dropdowns (only for dashboard page)
function populateCategoryDropdown(selectId) {
    const select = document.getElementById(selectId);
    if (!select) {
        console.error(`Select element with id "${selectId}" not found`);
        return;
    }
    select.innerHTML = '<option value="">Choose Category</option>';
    if (categories && categories.length > 0) {
        categories.forEach(category => {
            select.innerHTML += `<option value="${category.name}">${category.name}</option>`;
        });
    } else {
        console.warn(`No categories available for select "${selectId}"`);
        select.innerHTML += '<option value="" disabled>No categories available</option>';
    }
}

function populateFilterCategoryDropdown() {
    const select = document.getElementById("filterCategory");
    if (!select) {
        console.error("Filter category dropdown not found");
        return;
    }
    select.innerHTML = '<option value="">All Categories</option>';
    if (categories && categories.length > 0) {
        categories.forEach(category => {
            select.innerHTML += `<option value="${category.name}">${category.name}</option>`;
        });
    } else {
        console.warn("No categories available for filter dropdown");
        select.innerHTML += '<option value="" disabled>No categories available</option>';
    }
}

// Add transaction function (only for dashboard page)
function addTransaction() {
    console.log("Add Transaction clicked");
    const amount = parseFloat(document.getElementById("amount").value);
    const currency = document.getElementById("currency").value;
    const status = document.getElementById("status").value;
    const category = document.getElementById("category").value;  // Get the category name directly
    const date = document.getElementById("date").value;
    const description = document.getElementById("description").value;

    if (!amount || isNaN(amount) || amount < 0) {
        alert("Please enter a valid non-negative number for amount!");
        return;
    }
    if (!currency || !status || !category || !date || !description) {
        alert("Please fill all fields!");
        return;
    }
    console.log("Transaction data:", { amount, currency, status, category, date, description });
    console.log("CSRF Token:", getCookie('csrftoken'));
    fetch('/add_transaction/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ amount, currency, status, category, date, description })
    })
    .then(response => {
        console.log("Fetch response:", response);
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(`HTTP error! status: ${response.status} - ${err.error || response.statusText}`);
            });
        }
        return response.json();
    })
    .then(data => {
        console.log("Transaction data:", data);
        if (data.error) {
            alert(`Error: ${data.error}`);
            return;
        }
        // Assign data to transactions without redeclaring
        transactions = data.transactions;
        updateTable(transactions);
        if (status === "spent") {
            deductFromPlans(category, amount);
        }
        closeTransactionForm();
        updateTotals();
        showSummary();
        updatePlanStatus();
        updateVisualizations();
    })
    .catch(error => {
        console.error('Error adding transaction:', error.message || error);
        alert("Failed to add transaction. Check console for details.");
    });
}

// Edit transaction (only for dashboard page)
function editTransaction(button, transactionId) {
    console.log("Edit Transaction clicked for ID:", transactionId);
    if (!button || isNaN(transactionId)) {
        console.error("Invalid button or transaction ID:", { button, transactionId });
        return;
    }
    fetch(`/get_transaction/${transactionId}/`, {
        method: 'GET',
        headers: { 'X-CSRFToken': getCookie('csrftoken') }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        return response.json();
    })
    .then(data => {
        console.log("Edit transaction data:", data);
        const editAmount = document.getElementById("editAmount");
        const editCurrency = document.getElementById("editCurrency");
        const editStatus = document.getElementById("editStatus");
        const editCategory = document.getElementById("editCategory");
        const editDate = document.getElementById("editDate");
        const editDescription = document.getElementById("editDescription");
        const editForm = document.getElementById("editForm");
        if (!editAmount || !editCurrency || !editStatus || !editCategory || !editDate || !editDescription || !editForm) {
            console.error("Edit form elements not found");
            return;
        }
        editAmount.value = data.amount;
        editCurrency.value = data.currency;
        editStatus.value = data.status;
        editCategory.value = data.category || '';
        editDate.value = data.date;
        editDescription.value = data.description || '';
        editForm.dataset.rowIndex = transactionId;
        openEditForm();
    })
    .catch(error => {
        console.error('Error fetching transaction for edit:', error.message || error);
        alert("Failed to fetch transaction for editing. Check console for details.");
    });
}

// Update transaction (only for dashboard page)
function updateTransaction() {
    const transactionId = document.getElementById("editForm")?.dataset.rowIndex;
    if (!transactionId) {
        console.error("Transaction ID not found in edit form");
        return;
    }
    const amount = parseFloat(document.getElementById("editAmount").value);
    const currency = document.getElementById("editCurrency").value;
    const status = document.getElementById("editStatus").value;
    const category = document.getElementById("editCategory").value;  // Get the category name directly
    const date = document.getElementById("editDate").value;
    const description = document.getElementById("editDescription").value;

    if (!amount || isNaN(amount) || amount < 0) {
        alert("Please enter a valid non-negative number for amount!");
        return;
    }
    if (!currency || !status || !category || !date || !description) {
        alert("Please fill all fields!");
        return;
    }

    fetch(`/update_transaction/${transactionId}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ amount, currency, status, category, date, description })
    })
    .then(response => {
        console.log("Fetch response:", response);
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(`HTTP error! status: ${response.status} - ${err.error || response.statusText}`);
            });
        }
        return response.json();
    })
    .then(data => {
        console.log("Updated transaction data:", data);
        if (data.error) {
            alert(`Error: ${data.error}`);
            return;
        }
        // Assign data to transactions without redeclaring
        transactions = data.transactions;
        updateTable(transactions);
        const oldTransaction = transactions.find(t => t.id === parseInt(transactionId));
        if (oldTransaction) {
            if (oldTransaction.status === "spent") {
                addToPlans(oldTransaction.category || '', parseFloat(oldTransaction.amount)); // Revert old deduction
            }
            if (status === "spent") {
                deductFromPlans(category, amount); // Deduct new amount
            }
        }
        closeEditForm();
        updateTotals();
        showSummary();
        updatePlanStatus();
        updateVisualizations();
    })
    .catch(error => {
        console.error('Error updating transaction:', error.message || error);
        alert("Failed to update transaction. Check console for details.");
    });
}

// Delete transaction (only for dashboard page)
function deleteTransaction(button, transactionId) {
    console.log("Delete Transaction clicked for ID:", transactionId);
    if (!button || isNaN(transactionId)) {
        console.error("Invalid button or transaction ID:", { button, transactionId });
        return;
    }
    if (confirm("Are you sure you want to delete this transaction?")) {
        fetch(`/delete_transaction/${transactionId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(response => {
            console.log("Fetch response:", response);
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(`HTTP error! status: ${response.status} - ${err.error || response.statusText}`);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("Deleted transaction data:", data);
            if (data.error) {
                alert(`Error: ${data.error}`);
                return;
            }
            // Assign data to transactions without redeclaring
            transactions = data.transactions;
            updateTable(transactions);
            const transaction = transactions.find(t => t.id === parseInt(transactionId));
            if (transaction && transaction.status === "spent") {
                addToPlans(transaction.category || '', parseFloat(transaction.amount)); // Revert deduction
            }
            updateTotals();
            showSummary();
            updatePlanStatus();
            updateVisualizations();
        })
        .catch(error => {
            console.error('Error deleting transaction:', error.message || error);
            alert("Failed to delete transaction. Check console for details.");
        });
    }
}

// Apply filters (only for dashboard page, optional but retained for debugging)
function applyFilters() {
    const filterForm = document.getElementById("filterForm");
    if (!filterForm) {
        console.error("Filter form not found. Ensure #filterForm exists in the HTML.");
        return;
    }
    // Optionally validate or log filter values for debugging
    const filterStatus = document.getElementById("filterStatus")?.value || "all";
    const filterCategory = document.getElementById("filterCategory")?.value || "";
    const startDate = document.getElementById("startDate")?.value || "";
    const endDate = document.getElementById("endDate")?.value || "";
    const displayCurrency = document.getElementById("displayCurrency")?.value || "QAR";

    console.log("Applying filters:", { filterStatus, filterCategory, startDate, endDate, displayCurrency });
    filterForm.submit();
}

// Sort table (only for dashboard page)
function sortTable() {
    const table = document.getElementById("expenseTable");
    if (!table) {
        console.error("Expense table not found");
        return;
    }
    const tbody = table.querySelector("tbody");
    if (!tbody) {
        console.error("Expense table tbody not found");
        return;
    }
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const isAscending = !table.dataset.sortDirection || table.dataset.sortDirection === "desc";

    rows.sort((a, b) => {
        const dateA = new Date(a.cells[0].textContent);
        const dateB = new Date(b.cells[0].textContent);
        return isAscending ? dateA - dateB : dateB - dateA;
    });

    rows.forEach(row => tbody.appendChild(row));
    table.dataset.sortDirection = isAscending ? "asc" : "desc";
    updateTotals();
}

// Update transaction table (only for dashboard page, kept for reference but not called)
function updateTable(transactionsData) {
    const table = document.getElementById("expenseTable");
    if (!table) {
        console.error("Expense table not found");
        return;
    }
    const tbody = table.querySelector("tbody");
    if (!tbody) {
        console.error("Expense table tbody not found");
        return;
    }
    tbody.innerHTML = "";
    transactionsData.forEach(t => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${t.date || ''}</td>
            <td class="${t.status || 'spent'}">${(t.status || 'Spent').charAt(0).toUpperCase() + (t.status || 'Spent').slice(1)}</td>
            <td>${t.category__name || t.category || 'undefined'}</td>
            <td>${t.amount || 0}</td>
            <td>${t.currency || 'QAR'}</td>
            <td>${t.description || ''}</td>
            <td>
                <button onclick="editTransaction(this, ${t.id || 0})" style="background-color: #ff4444;">Edit</button>
                <button onclick="deleteTransaction(this, ${t.id || 0})" style="background-color: #ff4444;">Delete</button>
            </td>
        `;
    });
    updateTotals();
}

// Update totals with conversion (if client-side)
function updateTotals() {
    const table = document.getElementById("expenseTable");
    if (!table) {
        console.error("Expense table not found");
        return;
    }
    const rows = table.querySelectorAll("tbody tr");
    let totalEarned = 0;
    let totalSpent = 0;
    const displayCurrency = document.getElementById("displayCurrency")?.value || "QAR";

    rows.forEach(row => {
        if (row.style.display !== "none") { // Ensure we only count visible rows (after filtering)
            const amount = parseFloat(row.cells[3].textContent) || 0;
            const status = row.cells[1].textContent.toLowerCase();
            if (status === "earned") totalEarned += amount;
            else if (status === "spent") totalSpent += amount;
        }
    });

    const totalEarnedElement = document.getElementById("totalEarned");
    const totalSpentElement = document.getElementById("totalSpent");
    const totalSpentFromHomeElement = document.getElementById("totalSpentFromHome");
    const earnedCurrency = document.getElementById("earnedCurrency");
    const spentCurrency = document.getElementById("spentCurrency");

    if (totalEarnedElement && totalSpentElement && totalSpentFromHomeElement && earnedCurrency && spentCurrency) {
        totalEarnedElement.textContent = totalEarned.toFixed(2);
        totalSpentElement.textContent = totalSpent.toFixed(2);
        totalSpentFromHomeElement.textContent = totalSpent.toFixed(2);
        earnedCurrency.textContent = displayCurrency;
        spentCurrency.textContent = displayCurrency;
    } else {
        console.error("Total elements not found");
    }
}
// Show summary (only for dashboard page)
function showSummary() {
    const summaryDiv = document.getElementById("summary");
    if (!summaryDiv) {
        console.warn("Summary div not found, skipping summary update");
        return;
    }
    const totalEarned = parseFloat(document.getElementById("totalEarned").textContent) || 0;
    const totalSpent = parseFloat(document.getElementById("totalSpent").textContent) || 0;

    if (totalSpent > totalEarned) {
        summaryDiv.textContent = "Warning: You are overspending!";
        summaryDiv.style.color = "#ff6666";
    } else if (totalEarned > totalSpent) {
        summaryDiv.textContent = "Good job! You are saving money.";
        summaryDiv.style.color = "#00ffcc";
    } else {
        summaryDiv.textContent = "Your earnings and spending are balanced.";
        summaryDiv.style.color = "#a0a0b0";
    }
}

// Update plan status (only for dashboard page)
function updatePlanStatus() {
    const totalSpentFromHome = document.getElementById("totalSpentFromHome");
    const budgetStatus = document.getElementById("budgetStatus");
    if (!totalSpentFromHome || !budgetStatus) {
        console.warn("Plan status elements not found, skipping update");
        return;
    }
    const totalSpent = parseFloat(totalSpentFromHome.textContent) || 0;

    fetch('/plans/', {
        method: 'GET',
        headers: { 'X-CSRFToken': getCookie('csrftoken') }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        return response.json();
    })
    .then(data => {
        let monthlyBudget = 0;
        data.plans.forEach(plan => {
            if (plan.type === "monthly" && plan.status === "Active") {
                monthlyBudget += plan.amount;
            }
        });
        if (monthlyBudget > 0) {
            if (totalSpent > monthlyBudget) {
                budgetStatus.textContent = "Over Budget! Adjust your spending.";
                budgetStatus.className = "over-budget";
            } else {
                budgetStatus.textContent = "On Track! Keep it up.";
                budgetStatus.className = "on-track";
            }
        } else {
            budgetStatus.textContent = "Set a budget to track your plan.";
            budgetStatus.className = "";
        }
    })
    .catch(error => {
        console.error('Error fetching plans for status:', error.message || error);
        alert("Failed to update plan status. Check console for details.");
    });
}

// Update visualizations (only for dashboard page)
function updateVisualizations() {
    const startDate = document.getElementById("startDate")?.value;
    const endDate = document.getElementById("endDate")?.value;
    const table = document.getElementById("expenseTable");
    if (!table) {
        console.warn("Expense table not found, skipping visualizations");
        return;
    }
    const rows = table.querySelectorAll("tbody tr");
    let categoryTotals = {};

    rows.forEach(row => {
        const dateCell = row.cells[0].textContent;
        const categoryCell = row.cells[2].textContent;
        const amountCell = parseFloat(row.cells[3].textContent) || 0;
        const rowDate = new Date(dateCell);

        let showRow = true;
        if (startDate && rowDate < new Date(startDate)) showRow = false;
        if (endDate && rowDate > new Date(endDate)) showRow = false;

        if (showRow && row.cells[1].textContent.toLowerCase() === "spent") {
            categoryTotals[categoryCell] = (categoryTotals[categoryCell] || 0) + amountCell;
        }
    });

    const pieChart = document.getElementById("pieChart");
    const barChart = document.getElementById("barChart");
    const lineChart = document.getElementById("lineChart");
    if (pieChart) pieChart.textContent = `Pie Chart (Spending by Category: ${JSON.stringify(categoryTotals)})`;
    if (barChart) barChart.textContent = `Bar Chart (Spending by Category: ${JSON.stringify(categoryTotals)})`;
    if (lineChart) lineChart.textContent = `Line Chart (Spending Trends over ${startDate || 'N/A'} to ${endDate || 'N/A'})`;
}

// Update plan table (only for plans page)
function updatePlanTable() {
    const table = document.getElementById("planTable");
    if (!table) {
        console.error('Plan table element not found in the DOM');
        return;
    }
    const tbody = table.getElementsByTagName('tbody')[0];
    if (!tbody) {
        console.error('Plan table tbody not found');
        return;
    }
    tbody.innerHTML = "";
    plans.forEach(plan => {
        const today = new Date().toISOString().split('T')[0];
        let status = plan.status;
        if (today > plan.to_date) {
            status = plan.left_money <= 0 ? "Completed" : "Failed";
        }
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${plan.type === "monthly" ? "Monthly" : "Custom"}</td>
            <td>${plan.description || ''}</td>
            <td>${(plan.categories || []).join(", ") || 'N/A'}</td>
            <td>${plan.from_date || ''}</td>
            <td>${plan.to_date || ''}</td>
            <td>${(plan.left_money || 0).toFixed(2)} USD</td>
            <td>${status}</td>
            <td>
                <button onclick="editPlan(${plan.id || 0})" style="background-color: #ff4444;">Edit</button>
                <button onclick="deletePlan(${plan.id || 0})" style="background-color: #ff4444;">Delete</button>
            </td>
        `;
    });
}

// Edit plan (only for plans page)
function editPlan(planId) {
    console.log("Edit Plan clicked for ID:", planId);
    if (isNaN(planId)) {
        console.error("Invalid plan ID:", planId);
        return;
    }
    fetch(`/get_plan/${planId}/`, {
        method: 'GET',
        headers: { 'X-CSRFToken': getCookie('csrftoken') }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        return response.json();
    })
    .then(data => {
        console.log("Edit plan data:", data);
        const editPlanAmount = document.getElementById("editPlanAmount");
        const editPlanDescription = document.getElementById("editPlanDescription");
        const editPlanCategories = document.getElementById("editPlanCategories");
        const editPlanFromDate = document.getElementById("editPlanFromDate");
        const editPlanToDate = document.getElementById("editPlanToDate");
        const editPlanForm = document.getElementById("editPlanForm");
        if (!editPlanAmount || !editPlanDescription || !editPlanCategories || !editPlanFromDate || !editPlanToDate || !editPlanForm) {
            console.error("Edit plan form elements not found");
            return;
        }
        editPlanAmount.value = data.amount || 0;
        editPlanDescription.value = data.description || '';
        editPlanCategories.value = (data.categories || []).join(", ");
        editPlanFromDate.value = data.from_date || '';
        editPlanToDate.value = data.to_date || '';
        editPlanForm.dataset.planId = planId;
        openEditPlanForm();
    })
    .catch(error => {
        console.error('Error fetching plan for edit:', error.message || error);
        alert("Failed to fetch plan for editing. Check console for details.");
    });
}

// Update plan (only for plans page)
function updatePlan() {
    const planId = document.getElementById("editPlanForm")?.dataset.planId;
    if (!planId) {
        console.error("Plan ID not found in edit form");
        return;
    }
    const amount = parseFloat(document.getElementById("editPlanAmount").value) || 0;
    const description = document.getElementById("editPlanDescription").value || '';
    const categoriesStr = document.getElementById("editPlanCategories").value || '';
    const fromDate = document.getElementById("editPlanFromDate").value || '';
    const toDate = document.getElementById("editPlanToDate").value || '';
    const categories = categoriesStr.split(",").map(cat => cat.trim()).filter(cat => cat);

    if (!amount || isNaN(amount) || amount < 0) {
        alert("Please enter a valid non-negative number for amount!");
        return;
    }
    if (!description || !categoriesStr || !fromDate || !toDate) {
        alert("Please fill all fields!");
        return;
    }

    fetch(`/update_plan/${planId}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ amount, description, categories, from_date: fromDate, to_date: toDate })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(`HTTP error! Status: ${response.status} - ${err.error || response.statusText}`);
            });
        }
        return response.json();
    })
    .then(data => {
        console.log("Updated plan data:", data);
        if (data.error) {
            alert(`Error: ${data.error}`);
            return;
        }
        plans = data.plans;
        updatePlanTable();
        closeEditPlanForm();
        updatePlanStatus();
    })
    .catch(error => {
        console.error('Error updating plan:', error.message || error);
        alert("Failed to update plan. Check console for details.");
    });
}

// Delete plan (only for plans page)
function deletePlan(planId) {
    console.log("Delete Plan clicked for ID:", planId);
    if (isNaN(planId)) {
        console.error("Invalid plan ID:", planId);
        return;
    }
    if (confirm("Are you sure you want to delete this plan?")) {
        fetch(`/delete_plan/${planId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(`HTTP error! Status: ${response.status} - ${err.error || response.statusText}`);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("Deleted plan data:", data);
            if (data.error) {
                alert(`Error: ${data.error}`);
                return;
            }
            plans = data.plans;
            updatePlanTable();
            updatePlanStatus();
        })
        .catch(error => {
            console.error('Error deleting plan:', error.message || error);
            alert("Failed to delete plan. Check console for details.");
        });
    }
}

// Plan-related functions (only for plans page)
function deductFromPlans(category, amount) {
    plans.forEach(plan => {
        const today = new Date().toISOString().split('T')[0];
        if (plan.status === "Active" && today >= plan.from_date && today <= plan.to_date) {
            if (plan.categories.includes(category) || plan.categories.includes("all")) {
                plan.left_money = Math.max(0, plan.left_money - amount);
                updatePlanTable();
            }
        }
    });
}

function addToPlans(category, amount) {
    plans.forEach(plan => {
        if (plan.categories.includes(category) || plan.categories.includes("all")) {
            plan.left_money += amount;
            updatePlanTable();
        }
    });
}

// Generate report (only for dashboard page)
function generateReport() {
    const startDate = document.getElementById("startDate")?.value;
    const endDate = document.getElementById("endDate")?.value;
    const table = document.getElementById("expenseTable");
    if (!table) {
        console.error("Expense table not found");
        return;
    }
    const rows = table.querySelectorAll("tbody tr");
    const reportData = [];

    rows.forEach(row => {
        if (row.style.display !== "none") {
            reportData.push({
                Date: row.cells[0].textContent,
                Status: row.cells[1].textContent,
                Category: row.cells[2].textContent,
                Amount: row.cells[3].textContent,
                Currency: row.cells[4].textContent,
                Description: row.cells[5].textContent
            });
        }
    });

    if (reportData.length === 0) {
        alert("No visible data to generate a report!");
        return;
    }

    const reportModal = document.getElementById("reportModal");
    if (!reportModal) {
        console.error("Report modal not found");
        return;
    }
    const filename = document.getElementById("reportFilename").value || "report";
    const format = document.getElementById("reportFormat").value || "excel";

    if (format === "excel") {
        console.log("Excel report generated:", reportData);
        alert(`Excel report "${filename}.xlsx" would be generated with this data: ${JSON.stringify(reportData)}`);
    } else if (format === "pdf") {
        console.log("PDF report generated:", reportData);
        alert(`PDF report "${filename}.pdf" would be generated with this data: ${JSON.stringify(reportData)}`);
    }

    closeReportModal();
}