// Declare global variables once at the top
let transactions = []; // Single declaration to avoid SyntaxError
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
    checkDashboardButtons();
    updateTotals();

    const table = document.getElementById("expenseTable");
    if (table) {
        const rows = table.querySelectorAll("tbody tr");
        transactions = Array.from(rows).map(row => {
            return {
                id: parseInt(row.cells[6].querySelector('button:last-child').getAttribute('onclick').match(/\d+/)[0]) || 0,
                date: row.cells[0].textContent || '',
                status: row.cells[1].textContent.toLowerCase() || 'spent',
                category__name: row.cells[2].textContent || 'undefined',
                amount: parseFloat(row.cells[3].textContent) || 0,
                currency: row.cells[4].textContent || 'QAR',
                description: row.cells[5].textContent || ''
            };
        });
        console.log("Initialized transactions from server-rendered table:", transactions);
    }

    const currentPath = window.location.pathname;
    if (currentPath === '/plans/') {
        checkPlanButtons();
        fetchPlans();
    } else if (currentPath === '/categories/') {
        fetchCategories().then(() => updateCategoryTable(categories));
    }

    // Prevent default form submission for category form
    const categoryForm = document.getElementById("categoryForm");
    if (categoryForm) {
        categoryForm.addEventListener("submit", (event) => {
            event.preventDefault();
            addCategory(event); // Trigger AJAX call
        });
    }
});

// Check buttons on the dashboard page
function checkDashboardButtons() {
    console.log("Checking dashboard buttons...");
    const transactionBtn = document.querySelector('.add-transaction-btn');
    const categoryBtn = document.querySelector('.add-category-btn');
    const reportBtn = document.querySelector('.get-report-btn');

    console.log("Transaction button exists:", !!transactionBtn);
    console.log("Category button exists:", !!categoryBtn);
    console.log("Report button exists:", !!reportBtn);

    // Add event listeners if buttons exist
    if (transactionBtn) {
        transactionBtn.addEventListener('click', openTransactionForm);
    }
    if (categoryBtn) {
        categoryBtn.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent default action
            event.stopPropagation(); // Stop event bubbling
            console.log("Add Category button clicked, preventing default behavior. Button action:", categoryBtn.getAttribute('onclick'));
            openCategoryForm();
        }, true); // Use capture phase to catch events early
    }
    if (reportBtn) {
        reportBtn.addEventListener('click', openReportModal);
    }
}

// Check buttons on the plans page
function checkPlanButtons() {
    console.log("Checking plan buttons...");
    const planBtn = document.querySelector('.add-plan-btn');

    console.log("Plan button exists:", !!planBtn);

    if (planBtn) {
        planBtn.addEventListener('click', openPlanForm);
    }
}

// Fetch transactions with server-side conversion (only for dashboard page updates)
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
    const url = `/get_transactions/?status=${encodeURIComponent(status)}&category=${encodeURIComponent(category)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&display_currency=${encodeURIComponent(displayCurrency)}`;

    fetch(url, {
        method: 'GET',
        headers: { 'X-CSRFToken': getCookie('csrftoken') }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        return response.json();
    })
    .then(data => {
        transactions = data.transactions || [];
        updateTable(transactions);
        updateTotals();
        showSummary();
        updatePlanStatus();
        console.log("Transactions fetched and converted:", transactions);
    })
    .catch(error => {
        console.error('Error fetching transactions:', error.message || error);
        alert("Failed to fetch transactions. Check console for details.");
    });
}

// Fetch categories (only for dashboard page)
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
        return categories;
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

// Modal functions
function openTransactionForm() {
    console.log("Opening transaction form...");
    const transactionModal = document.getElementById("transactionModal");
    const categorySelect = document.getElementById("category");
    if (!transactionModal || !categorySelect) {
        console.error("Transaction modal or category select not found");
        showMessageModal("Modal or category select not found!", true);
        return;
    }
    if (categories.length === 0) {
        fetchCategories().then(() => {
            populateCategoryDropdown("category");
            transactionModal.style.display = "block";
            document.getElementById("overlay").style.display = "block";
        }).catch(error => console.error('Error fetching categories:', error));
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
    if (!editModal || !editCategorySelect) {
        console.error("Edit modal or category select not found");
        showMessageModal("Edit modal or category select not found!", true);
        return;
    }
    if (categories.length === 0) {
        fetchCategories().then(() => {
            populateCategoryDropdown("editCategory");
            editModal.style.display = "block";
            document.getElementById("overlay").style.display = "block";
        }).catch(error => console.error('Error fetching categories:', error));
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
        showMessageModal("Category modal not found!", true);
        return;
    }
    categoryModal.style.display = "block";
    document.getElementById("overlay").style.display = "block";
}

function addCategory(event) {
    // Prevent default form submission
    if (event) event.preventDefault();

    console.log("Add Category clicked");
    const categoryName = document.getElementById("newCategory").value; // Corrected ID to match index.html

    if (!categoryName || categoryName.trim() === "") {
        showMessageModal("Please enter a category name!", true);
        return;
    }

    console.log("Sending category data:", { name: categoryName });
    console.log("CSRF Token:", getCookie('csrftoken'));

    // Show loading indicator
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) loadingIndicator.style.display = "block";

    const startTime = performance.now(); // Measure performance

    // Optimistic UI update: close form and show success message instantly
    closeCategoryForm();
    showMessageModal("Adding category...", false); // Immediate feedback

    fetch('/add_category/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ name: categoryName })
    })
    .then(response => {
        console.log("Fetch response status:", response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        const endTime = performance.now();
        console.log(`Category added in ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
        console.log("Category data:", data);
        if (data.error) {
            closeMessageModal(); // Clear loading message on error
            showMessageModal(`Error: ${data.error}`, true);
            // Optionally reopen modal or revert UI
            openCategoryForm(); // Reopen modal on error
        } else {
            // Update categories without redeclaring (use assignment)
            categories = data.categories || [];
            // Update category dropdowns and table immediately
            populateCategoryDropdown("category");
            populateCategoryDropdown("editCategory");
            populateFilterCategoryDropdown();
            if (document.getElementById("categoryTable")) {
                updateCategoryTable(categories);
            }
            showMessageModal("Category added successfully!", false);
        }
    })
    .catch(error => {
        console.error('Error adding category:', error.message || error);
        const endTime = performance.now();
        console.log(`Error handling completed in ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
        closeMessageModal(); // Clear loading message on error
        showMessageModal(`Failed to add category. Status: ${error.message}. Check console for details.`, true);
        openCategoryForm(); // Reopen modal on error
    })
    .finally(() => {
        // Hide loading indicator when done
        if (loadingIndicator) loadingIndicator.style.display = "none";
    });
}

function closeCategoryForm() {
    const categoryModal = document.getElementById("categoryModal");
    if (!categoryModal) {
        console.error("Category modal not found");
        return;
    }
    categoryModal.style.display = "none";
    document.getElementById("overlay").style.display = "none";
    document.getElementById("categoryForm").reset();
}

function editCategory(categoryId, categoryName) {
    console.log("Edit Category clicked for ID:", categoryId);
    const editCategoryModal = document.getElementById("editCategoryModal");
    const editCategoryId = document.getElementById("editCategoryId");
    const editCategoryNameInput = document.getElementById("editCategoryName");
    if (!editCategoryModal || !editCategoryId || !editCategoryNameInput) {
        console.error("Edit category modal or elements not found");
        showMessageModal("Edit category modal elements not found!", true);
        return;
    }
    editCategoryId.value = categoryId;
    editCategoryNameInput.value = categoryName;
    editCategoryModal.style.display = "block";
    document.getElementById("overlay").style.display = "block";
}

function closeEditCategoryForm() {
    const editCategoryModal = document.getElementById("editCategoryModal");
    if (!editCategoryModal) {
        console.error("Edit category modal not found");
        return;
    }
    editCategoryModal.style.display = "none";
    document.getElementById("overlay").style.display = "none";
    document.getElementById("editCategoryForm").reset();
}

function confirmDeleteCategory(categoryId) {
    const confirmDeleteCategoryModal = document.getElementById("confirmDeleteCategoryModal");
    const deleteCategoryId = document.getElementById("deleteCategoryId");
    const overlay = document.getElementById("overlay");
    if (!confirmDeleteCategoryModal || !deleteCategoryId || !overlay) {
        console.error("Confirm delete category modal or elements not found");
        showMessageModal("Confirm delete category modal not found!", true);
        return;
    }
    deleteCategoryId.value = categoryId;
    confirmDeleteCategoryModal.style.display = "block";
    overlay.style.display = "block";
}

function closeConfirmDeleteCategoryModal() {
    const confirmDeleteCategoryModal = document.getElementById("confirmDeleteCategoryModal");
    const overlay = document.getElementById("overlay");
    if (!confirmDeleteCategoryModal || !overlay) {
        console.error("Confirm delete category modal not found");
        return;
    }
    confirmDeleteCategoryModal.style.display = "none";
    overlay.style.display = "none";
}

function deleteCategory() {
    const categoryId = document.getElementById("deleteCategoryId").value;
    if (!categoryId) {
        showMessageModal("Category ID not found!", true);
        return;
    }

    // Show loading indicator
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) loadingIndicator.style.display = "block";

    const startTime = performance.now(); // Measure performance

    // Optimistic UI update: close modal and show loading message instantly
    closeConfirmDeleteCategoryModal();
    showMessageModal("Deleting category...", false); // Immediate feedback

    fetch(`/delete_category/${categoryId}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
    .then(response => {
        console.log("Delete category response status:", response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        const endTime = performance.now();
        console.log(`Category deleted in ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
        console.log("Delete category response data:", data);
        if (data.error) {
            closeMessageModal(); // Clear loading message on error
            showMessageModal(`Error: ${data.error}`, true);
            confirmDeleteCategory(categoryId); // Reopen confirmation on error
        } else {
            categories = data.categories || [];
            updateCategoryTable(categories);
            showMessageModal("Category and associated spendings deleted successfully!", false);
        }
    })
    .catch(error => {
        console.error('Error deleting category:', error);
        const endTime = performance.now();
        console.log(`Error handling completed in ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
        closeMessageModal(); // Clear loading message on error
        showMessageModal(`Failed to delete category. Status: ${error.message}. Check console for details.`, true);
        confirmDeleteCategory(categoryId); // Reopen confirmation on error
    })
    .finally(() => {
        // Hide loading indicator when done
        if (loadingIndicator) loadingIndicator.style.display = "none";
    });
}


function updateCategory() {
    const categoryId = document.getElementById("editCategoryId").value;
    const categoryName = document.getElementById("editCategoryName").value;

    if (!categoryName || !categoryId) {
        showMessageModal("Please enter a category name and ID!", true);
        return;
    }

    console.log("Sending update data for category ID:", categoryId, { category_id: categoryId, name: categoryName });
    console.log("CSRF Token:", getCookie('csrftoken'));

    // Show loading indicator
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) loadingIndicator.style.display = "block";

    const startTime = performance.now(); // Measure performance

    // Optimistic UI update: close form and show loading message instantly
    closeEditCategoryForm();
    showMessageModal("Updating category...", false); // Immediate feedback

    fetch('/update_category/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ category_id: categoryId, name: categoryName })
    })
    .then(response => {
        console.log("Update category response status:", response.status);
        if (!response.ok) {
            if (response.status === 400) {
                return response.json().then(data => Promise.reject(new Error(data.error || 'Please check your input and try again.')));
            } else if (response.status === 404) {
                return Promise.reject(new Error('We couldn’t find that category. Please try again!'));
            } else if (response.status >= 500) {
                return Promise.reject(new Error('Oops! Something went wrong on our end. Please try again later.'));
            }
            throw new Error('Oops! Something went wrong. Please try again.');
        }
        return response.json();
    })
    .then(data => {
        const endTime = performance.now();
        console.log(`Category updated in ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
        console.log("Update category response data:", data);
        if (data.error) {
            closeMessageModal(); // Clear loading message on error
            if (data.error.toLowerCase().includes('already') || data.error.toLowerCase().includes('exists') || data.error.toLowerCase().includes('in use')) {
                showMessageModal(`Oops! The category "${categoryName}" already exists. Please choose a different name.`, true);
            } else {
                showMessageModal(`Sorry, we couldn’t update the category: ${data.error}. Please try again!`, true);
            }
            editCategory(categoryId, categoryName); // Reopen edit form on error
        } else {
            categories = data.categories || [];
            updateCategoryTable(categories);
            populateCategoryDropdown("category");
            populateCategoryDropdown("editCategory");
            populateFilterCategoryDropdown();
            showMessageModal("Great! Your category has been updated successfully.", false);
        }
    })
    .catch(error => {
        console.error('Error updating category:', error.message);
        const endTime = performance.now();
        console.log(`Error handling completed in ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
        closeMessageModal(); // Clear loading message on error
        let errorMessage = error.message;
        if (errorMessage.includes('Validation error') || errorMessage.includes('check your input')) {
            showMessageModal("Please double-check the category name and try again!", true);
        } else if (errorMessage.includes('not found')) {
            showMessageModal("We couldn’t find that category. Please select a valid one and try again!", true);
        } else if (errorMessage.includes('server')) {
            showMessageModal("Oops! Something went wrong on our end. Please try again later.", true);
        } else {
            showMessageModal("Sorry, something unexpected happened. Please try again later!", true);
        }
        editCategory(categoryId, categoryName); // Reopen edit form on error
    })
    .finally(() => {
        // Hide loading indicator when done
        if (loadingIndicator) loadingIndicator.style.display = "none";
    });
}

function updateCategoryTable(categories) {
    const table = document.getElementById("categoryTable");
    if (table) {
        const tbody = table.querySelector("tbody");
        tbody.innerHTML = "";
        categories.forEach(cat => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${cat.name}</td>
                <td>
                    <button onclick="editCategory(${cat.id}, '${cat.name}')" style="background-color: #ff4444;">Edit</button>
                    <button onclick="confirmDeleteCategory(${cat.id})" style="background-color: #ff4444;">Delete</button>
                </td>
            `;
        });
    }
}

function editTransaction(button, transactionId) {
    console.log("Edit Transaction clicked for ID:", transactionId);
    if (!button || isNaN(transactionId)) {
        console.error("Invalid button or transaction ID:", { button, transactionId });
        showMessageModal("Invalid transaction ID!", true);
        return;
    }

    // Try to find transaction in client-side array first
    const transaction = transactions.find(t => t.id === parseInt(transactionId));
    const startTime = performance.now(); // Measure performance

    if (transaction) {
        console.log("Transaction found in client-side array, opening form instantly:", transaction);
        openEditFormWithData(transaction);
    } else {
        console.log("Transaction not found in client-side array, fetching from server...");
        fetch(`/get_transaction/${transactionId}/`, {
            method: 'GET',
            headers: { 'X-CSRFToken': getCookie('csrftoken') }
        })
        .then(response => {
            console.log("Edit transaction response status:", response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Edit transaction response data:", data);
            const fetchedTransaction = data;
            openEditFormWithData(fetchedTransaction);
            // Update client-side array if new data differs
            if (!transactions.some(t => t.id === fetchedTransaction.id)) {
                transactions.push(fetchedTransaction);
            }
        })
        .catch(error => {
            console.error('Error fetching transaction for edit:', error);
            showMessageModal('Failed to fetch transaction for editing. Using default values. Check console for details.', true);
            openEditFormWithData({ id: transactionId, amount: 0, currency: 'QAR', status: 'spent', category: '', date: '', description: '' });
        });
    }

    const endTime = performance.now();
    console.log(`Edit form opened in ${ (endTime - startTime).toFixed(2) }ms`);
}

function deleteTransaction(button, transactionId) {
    console.log("Delete Transaction clicked for ID:", transactionId);
    if (!button || isNaN(transactionId)) {
        console.error("Invalid button or transaction ID:", { button, transactionId });
        showMessageModal("Invalid transaction ID!", true);
        return;
    }

    const confirmModal = document.getElementById("confirmDeleteModal");
    const confirmYesBtn = document.getElementById("confirmYes");
    const confirmNoBtn = document.getElementById("confirmNo");
    if (!confirmModal || !confirmYesBtn || !confirmNoBtn) {
        console.error("Delete confirmation modal or buttons not found");
        showMessageModal("Delete confirmation modal not found!", true);
        return;
    }

    confirmModal.style.display = "block";
    document.getElementById("overlay").style.display = "block";
    confirmModal.dataset.transactionId = transactionId;

    confirmYesBtn.onclick = function() {
        // Show loading feedback (optimistic update)
        showMessageModal("Deleting transaction...", false);

        fetch(`/delete_transaction/${transactionId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(response => {
            console.log("Delete transaction response status:", response.status);
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(`HTTP error! Status: ${response.status} - ${err.error || response.statusText}`);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("Delete transaction response data:", data);
            closeMessageModal(); // Clear loading message
            if (data.error) {
                const errorModal = document.getElementById("deleteErrorModal");
                const errorMessage = document.getElementById("deleteErrorMessage");
                const errorOkBtn = document.getElementById("deleteErrorOk");
                if (!errorModal || !errorMessage || !errorOkBtn) {
                    console.error("Delete error modal not found");
                    showMessageModal(`Error deleting transaction: ${data.error}`, true);
                    return;
                }
                errorMessage.textContent = `Error: ${data.error}`;
                errorModal.style.display = "block";
                errorOkBtn.onclick = function() {
                    errorModal.style.display = "none";
                    document.getElementById("overlay").style.display = "none";
                };
            } else {
                transactions = data.transactions || [];
                updateTable(transactions);
                updateTotals();
                showSummary();
                updatePlanStatus();
                showMessageModal("Transaction deleted successfully.", false);
                const successModal = document.getElementById("deleteSuccessModal");
                const successOkBtn = document.getElementById("deleteSuccessOk");
                if (!successModal || !successOkBtn) {
                    console.error("Delete success modal not found");
                    return;
                }
                successModal.style.display = "block";
                successOkBtn.onclick = function() {
                    successModal.style.display = "none";
                    document.getElementById("overlay").style.display = "none";
                };
            }
        })
        .catch(error => {
            console.error('Error deleting transaction:', error);
            closeMessageModal(); // Clear loading message
            const errorModal = document.getElementById("deleteErrorModal");
            const errorMessage = document.getElementById("deleteErrorMessage");
            const errorOkBtn = document.getElementById("deleteErrorOk");
            if (!errorModal || !errorMessage || !errorOkBtn) {
                console.error("Delete error modal not found");
                showMessageModal(`Failed to delete transaction: ${error.message}`, true);
                return;
            }
            errorMessage.textContent = `Failed to delete transaction: ${error.message}`;
            errorModal.style.display = "block";
            errorOkBtn.onclick = function() {
                errorModal.style.display = "none";
                document.getElementById("overlay").style.display = "none";
            };
        })
        .finally(() => {
            confirmModal.style.display = "none";
            confirmYesBtn.onclick = null;
            confirmNoBtn.onclick = null;
        });
    };

    confirmNoBtn.onclick = function() {
        confirmModal.style.display = "none";
        document.getElementById("overlay").style.display = "none";
        confirmYesBtn.onclick = null;
        confirmNoBtn.onclick = null;
    };
}

// Apply filters (only for dashboard page)
function applyFilters() {
    const filterForm = document.getElementById("filterForm");
    if (!filterForm) {
        console.error("Filter form not found. Ensure #filterForm exists in the HTML.");
        return;
    }
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

// Update transaction table (only for dashboard page)
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

// Update totals (only for dashboard page)
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
        if (row.style.display !== "none") {
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

    fetch('/generate_report/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            start_date: startDate,
            end_date: endDate,
            status: document.getElementById("filterStatus")?.value || "all",
            category: document.getElementById("filterCategory")?.value || "",
            format: format,
            filename: filename,
            display_currency: document.getElementById("displayCurrency")?.value || "QAR"
        })
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        closeReportModal();
    })
    .catch(error => {
        console.error('Error generating report:', error.message || error);
        alert("Failed to generate report. Check console for details.");
    });
}

// Function to show modal message
function showMessageModal(message, isError = false) {
    const messageModal = document.getElementById("messageModal");
    const messageText = document.getElementById("messageText");
    const overlay = document.getElementById("overlay");

    if (messageModal && messageText && overlay) {
        messageText.textContent = message;
        messageModal.style.display = "block";
        messageModal.className = isError ? "modal error-modal" : "modal success-modal";
        overlay.style.display = "block";
    }
}

function closeMessageModal() {
    const messageModal = document.getElementById("messageModal");
    const overlay = document.getElementById("overlay");
    if (messageModal && overlay) {
        messageModal.style.display = "none";
        overlay.style.display = "none";
    }
}

function addTransaction() {
    console.log("Add Transaction clicked");
    const amount = parseFloat(document.getElementById("amount").value);
    const currency = document.getElementById("currency").value;
    const status = document.getElementById("status").value;
    const category = document.getElementById("category").value;
    const date = document.getElementById("date").value;
    const description = document.getElementById("description").value;

    if (!amount || isNaN(amount) || amount < 0) {
        showMessageModal("Please enter a valid non-negative number for amount!", true);
        return;
    }
    if (!currency || !status || !category || !date || !description) {
        showMessageModal("Please fill all fields!", true);
        return;
    }

    console.log("Sending transaction data:", { amount, currency, status, category, date, description });
    console.log("CSRF Token:", getCookie('csrftoken'));

    const startTime = performance.now(); // Measure performance

    // Optimistic UI update: close form and show success message instantly
    closeTransactionForm();
    showMessageModal("Adding transaction...", false); // Immediate feedback

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
        console.log("Fetch response status:", response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log("Response data:", data);
        const endTime = performance.now();
        console.log(`Initial fetch completed in ${(endTime - startTime).toFixed(2)}ms`);

        if (data.error) {
            closeMessageModal(); // Clear loading message on error
            showMessageModal(`Error: ${data.error}`, true);
            openTransactionForm(); // Reopen form on error
        } else if (data.transaction) {
            const newTransaction = data.transaction;
            transactions.unshift(newTransaction); // Add new transaction optimistically
            updateTable(transactions); // Update table instantly
            showMessageModal("Transaction added successfully!", false);
        }
    })
    .catch(error => {
        console.error('Error adding transaction:', error);
        const endTime = performance.now();
        console.log(`Error handling completed in ${(endTime - startTime).toFixed(2)}ms`);
        closeMessageModal(); // Clear loading message on error
        showMessageModal(`Failed to add transaction. Status: ${error.message}`, true);
        openTransactionForm(); // Reopen form on error
    })
    .finally(() => {
        // Background refresh to sync with server silently
        setTimeout(() => {
            fetchTransactions()
                .then(() => {
                    updateTotals();
                    showSummary();
                    updatePlanStatus();
                })
                .catch(err => {
                    console.error('Error fetching updated transactions:', err);
                });
        }, 0); // Non-blocking background task
    });
}

function updateTransaction() {
    console.log("Update Transaction clicked");
    const transactionId = document.getElementById("editForm").dataset.rowIndex;
    if (!transactionId) {
        console.error("Transaction ID not found in edit form");
        showMessageModal("Transaction ID not found!", true);
        return;
    }
    const amount = parseFloat(document.getElementById("editAmount").value);
    const currency = document.getElementById("editCurrency").value;
    const status = document.getElementById("editStatus").value;
    const category = document.getElementById("editCategory").value;
    const date = document.getElementById("editDate").value;
    const description = document.getElementById("editDescription").value;

    if (!amount || isNaN(amount) || amount < 0) {
        showMessageModal("Please enter a valid non-negative number for amount!", true);
        return;
    }
    if (!currency || !status || !category || !date || !description) {
        showMessageModal("Please fill all fields!", true);
        return;
    }

    console.log("Sending update data for transaction ID:", transactionId, { amount, currency, status, category, date, description });
    console.log("CSRF Token:", getCookie('csrftoken'));

    const startTime = performance.now(); // Measure performance

    // Optimistic UI update: close form and show success message instantly
    closeEditForm();
    showMessageModal("Updating transaction...", false); // Immediate feedback

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
        console.log("Fetch response status:", response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log("Response data:", data);
        const endTime = performance.now();
        console.log(`Initial fetch completed in ${(endTime - startTime).toFixed(2)}ms`);

        if (data.error) {
            closeMessageModal(); // Clear loading message on error
            showMessageModal(`Error: ${data.error}`, true);
            openEditForm(); // Reopen form on error
        } else {
            const updatedTransaction = data.transaction || { id: parseInt(transactionId), amount, currency, status, category, date, description };
            transactions = transactions.map(t => t.id === parseInt(transactionId) ? updatedTransaction : t);
            updateTable(transactions);
            updateTotals();
            showSummary();
            updatePlanStatus();
            showMessageModal("Transaction updated successfully!", false);
        }
    })
    .catch(error => {
        console.error('Error updating transaction:', error);
        const endTime = performance.now();
        console.log(`Error handling completed in ${(endTime - startTime).toFixed(2)}ms`);
        closeMessageModal(); // Clear loading message on error
        showMessageModal(`Failed to update transaction. Status: ${error.message}`, true);
        openEditForm(); // Reopen form on error
    });
}

function openEditFormWithData(transaction) {
    console.log("Opening edit form with data:", transaction);
    const editModal = document.getElementById("editModal");
    const editCategorySelect = document.getElementById("editCategory");
    if (!editModal || !editCategorySelect) {
        console.error("Edit modal or category select not found");
        showMessageModal("Edit modal or category select not found!", true);
        return;
    }
    if (categories.length === 0) {
        fetchCategories().then(() => {
            populateCategoryDropdown("editCategory");
            populateFormFields(transaction);
            editModal.style.display = "block";
            document.getElementById("overlay").style.display = "block";
        }).catch(error => console.error('Error fetching categories:', error));
    } else {
        populateCategoryDropdown("editCategory");
        populateFormFields(transaction);
        editModal.style.display = "block";
        document.getElementById("overlay").style.display = "block";
    }
}

function editTransaction(button, transactionId) {
    console.log("Edit Transaction clicked for ID:", transactionId);
    if (!button || isNaN(transactionId)) {
        console.error("Invalid button or transaction ID:", { button, transactionId });
        showMessageModal("Invalid transaction ID!", true);
        return;
    }

    // Try to find transaction in client-side array first
    const transaction = transactions.find(t => t.id === parseInt(transactionId));
    const startTime = performance.now(); // Measure performance

    if (transaction) {
        console.log("Transaction found in client-side array, opening form instantly:", transaction);
        openEditFormWithData(transaction);
    } else {
        console.log("Transaction not found in client-side array, fetching from server...");
        fetch(`/get_transaction/${transactionId}/`, {
            method: 'GET',
            headers: { 'X-CSRFToken': getCookie('csrftoken') }
        })
        .then(response => {
            console.log("Edit transaction response status:", response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Edit transaction response data:", data);
            const fetchedTransaction = data;
            openEditFormWithData(fetchedTransaction);
            // Update client-side array if new data differs
            if (!transactions.some(t => t.id === fetchedTransaction.id)) {
                transactions.push(fetchedTransaction);
            }
        })
        .catch(error => {
            console.error('Error fetching transaction for edit:', error);
            showMessageModal('Failed to fetch transaction for editing. Using default values. Check console for details.', true);
            openEditFormWithData({ id: transactionId, amount: 0, currency: 'QAR', status: 'spent', category: '', date: '', description: '' });
        });
    }

    const endTime = performance.now();
    console.log(`Edit form opened in ${ (endTime - startTime).toFixed(2) }ms`);
}

function deleteTransaction(button, transactionId) {
    console.log("Delete Transaction clicked for ID:", transactionId);
    if (!button || isNaN(transactionId)) {
        console.error("Invalid button or transaction ID:", { button, transactionId });
        showMessageModal("Invalid transaction ID!", true);
        return;
    }

    const confirmModal = document.getElementById("confirmDeleteModal");
    const confirmYesBtn = document.getElementById("confirmYes");
    const confirmNoBtn = document.getElementById("confirmNo");
    if (!confirmModal || !confirmYesBtn || !confirmNoBtn) {
        console.error("Delete confirmation modal or buttons not found");
        showMessageModal("Delete confirmation modal not found!", true);
        return;
    }

    confirmModal.style.display = "block";
    document.getElementById("overlay").style.display = "block";
    confirmModal.dataset.transactionId = transactionId;

    confirmYesBtn.onclick = function() {
        // Show loading feedback (optimistic update)
        showMessageModal("Deleting transaction...", false);

        fetch(`/delete_transaction/${transactionId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(response => {
            console.log("Delete transaction response status:", response.status);
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(`HTTP error! Status: ${response.status} - ${err.error || response.statusText}`);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("Delete transaction response data:", data);
            closeMessageModal(); // Clear loading message
            if (data.error) {
                const errorModal = document.getElementById("deleteErrorModal");
                const errorMessage = document.getElementById("deleteErrorMessage");
                const errorOkBtn = document.getElementById("deleteErrorOk");
                if (!errorModal || !errorMessage || !errorOkBtn) {
                    console.error("Delete error modal not found");
                    showMessageModal(`Error deleting transaction: ${data.error}`, true);
                    return;
                }
                errorMessage.textContent = `Error: ${data.error}`;
                errorModal.style.display = "block";
                errorOkBtn.onclick = function() {
                    errorModal.style.display = "none";
                    document.getElementById("overlay").style.display = "none";
                };
            } else {
                transactions = data.transactions || [];
                updateTable(transactions);
                updateTotals();
                showSummary();
                updatePlanStatus();
                showMessageModal("Transaction deleted successfully.", false);
                const successModal = document.getElementById("deleteSuccessModal");
                const successOkBtn = document.getElementById("deleteSuccessOk");
                if (!successModal || !successOkBtn) {
                    console.error("Delete success modal not found");
                    return;
                }
                successModal.style.display = "block";
                successOkBtn.onclick = function() {
                    successModal.style.display = "none";
                    document.getElementById("overlay").style.display = "none";
                };
            }
        })
        .catch(error => {
            console.error('Error deleting transaction:', error);
            closeMessageModal(); // Clear loading message
            const errorModal = document.getElementById("deleteErrorModal");
            const errorMessage = document.getElementById("deleteErrorMessage");
            const errorOkBtn = document.getElementById("deleteErrorOk");
            if (!errorModal || !errorMessage || !errorOkBtn) {
                console.error("Delete error modal not found");
                showMessageModal(`Failed to delete transaction: ${error.message}`, true);
                return;
            }
            errorMessage.textContent = `Failed to delete transaction: ${error.message}`;
            errorModal.style.display = "block";
            errorOkBtn.onclick = function() {
                errorModal.style.display = "none";
                document.getElementById("overlay").style.display = "none";
            };
        })
        .finally(() => {
            confirmModal.style.display = "none";
            confirmYesBtn.onclick = null;
            confirmNoBtn.onclick = null;
        });
    };

    confirmNoBtn.onclick = function() {
        confirmModal.style.display = "none";
        document.getElementById("overlay").style.display = "none";
        confirmYesBtn.onclick = null;
        confirmNoBtn.onclick = null;
    };
}
function populateFormFields(transaction) {
    const editAmount = document.getElementById("editAmount");
    const editCurrency = document.getElementById("editCurrency");
    const editStatus = document.getElementById("editStatus");
    const editCategory = document.getElementById("editCategory");
    const editDate = document.getElementById("editDate");
    const editDescription = document.getElementById("editDescription");
    const editForm = document.getElementById("editForm");
    if (!editAmount || !editCurrency || !editStatus || !editCategory || !editDate || !editDescription || !editForm) {
        console.error("Edit form elements not found");
        showMessageModal("Edit form elements not found!", true);
        return;
    }
    editAmount.value = transaction.amount || 0;
    editCurrency.value = transaction.currency || 'QAR';
    editStatus.value = transaction.status || 'spent';
    editCategory.value = transaction.category || '';
    editDate.value = transaction.date || '';
    editDescription.value = transaction.description || '';
    editForm.dataset.rowIndex = transaction.id;
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