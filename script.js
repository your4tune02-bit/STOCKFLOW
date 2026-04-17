// ==========================================
// 1. SYSTEM STATE & DEFAULTS
// ==========================================
let dailyTotal = 0;
let transCount = 0;
let currentCart = [];
let activeCategory = 'All';
let salesHistory = [];
let categorySales = { 'Meat': 0, 'Canned Goods': 0, 'Beverages': 0, 'Pantry': 0, 'Snacks': 0, 'Others': 0 };
let salesChartInstance = null;
let users = [];
let currentUser = null;

const defaultProducts = [
    { id: 1, name: 'Pork Belly (1kg)', category: 'Meat',        price: 350, stock: 15,  img: '🥩' },
    { id: 2, name: 'Whole Chicken',    category: 'Meat',        price: 220, stock: 8,   img: '🍗' },
    { id: 3, name: 'Corned Beef',      category: 'Canned Goods',price: 45,  stock: 45,  img: '🥫' },
    { id: 4, name: 'Sardines (Spicy)', category: 'Canned Goods',price: 25,  stock: 52,  img: '🐟' },
    { id: 5, name: 'Cola (1L)',        category: 'Beverages',   price: 65,  stock: 24,  img: '🥤' },
    { id: 6, name: 'Orange Juice',     category: 'Beverages',   price: 35,  stock: 2,   img: '🧃' },
    { id: 7, name: 'Refined Sugar',    category: 'Pantry',      price: 85,  stock: 3,   img: '🍚' },
    { id: 8, name: 'Instant Coffee',   category: 'Pantry',      price: 12,  stock: 120, img: '☕' },
    { id: 9, name: 'Potato Chips',     category: 'Snacks',      price: 28,  stock: 40,  img: '🍿' },
    { id: 10, name: 'Crackers',        category: 'Snacks',      price: 15,  stock: 35,  img: '🍘' },
];

let products = [];
const categories = ['All', 'Meat', 'Canned Goods', 'Beverages', 'Pantry', 'Snacks', 'Others'];

// ==========================================
// 2. LOCAL STORAGE MANAGEMENT
// ==========================================
function loadData() {
    const savedProducts = localStorage.getItem('sf_products');
    products = savedProducts ? JSON.parse(savedProducts) : defaultProducts;

    dailyTotal  = parseFloat(localStorage.getItem('sf_total'))  || 0;
    transCount  = parseInt(localStorage.getItem('sf_count'))    || 0;

    const savedHistory  = localStorage.getItem('sf_history');
    salesHistory = savedHistory ? JSON.parse(savedHistory) : [];

    const savedCatSales = localStorage.getItem('sf_catSales');
    if (savedCatSales) categorySales = JSON.parse(savedCatSales);

    const savedUsers = localStorage.getItem('sf_users');
    users = savedUsers ? JSON.parse(savedUsers) : [];
    const demoExists = users.find(u => u.username.toLowerCase() === 'demo');
    if (!demoExists) users.push({ username: 'demo', password: 'demo123' });

    currentUser = localStorage.getItem('sf_current_user') || null;
}

function saveData() {
    localStorage.setItem('sf_products',  JSON.stringify(products));
    localStorage.setItem('sf_total',     dailyTotal);
    localStorage.setItem('sf_count',     transCount);
    localStorage.setItem('sf_history',   JSON.stringify(salesHistory));
    localStorage.setItem('sf_catSales',  JSON.stringify(categorySales));
    localStorage.setItem('sf_users',     JSON.stringify(users));
    if (currentUser) localStorage.setItem('sf_current_user', currentUser);
}

// ==========================================
// 3. TOAST NOTIFICATION SYSTEM
// ==========================================
function showToast(message, type = 'info', duration = 3000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
}

// ==========================================
// 4. CUSTOM CONFIRM MODAL
// ==========================================
let confirmResolve = null;

function showConfirm(title, message, okLabel = 'Confirm', okClass = 'btn-danger') {
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.textContent  = okLabel;
    okBtn.className    = `btn flex-1 ${okClass}`;
    document.getElementById('confirm-modal').style.display = 'flex';
    return new Promise(resolve => { confirmResolve = resolve; });
}

function resolveConfirm(result) {
    document.getElementById('confirm-modal').style.display = 'none';
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

// ==========================================
// 5. RESTOCK MODAL
// ==========================================
let restockTargetId = null;

function restockItem(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    restockTargetId = id;

    // Reset modal to restock mode
    document.getElementById('restock-product-name').textContent  = `Restock: ${product.img} ${product.name}`;
    document.getElementById('restock-qty-input').type        = 'number';
    document.getElementById('restock-qty-input').placeholder = 'Quantity (e.g. 50)';
    document.getElementById('restock-qty-input').value       = '';
    document.getElementById('restock-error').textContent     = 'Please enter a valid quantity.';
    document.getElementById('restock-error').classList.add('hidden');

    const confirmBtn = document.querySelector('#restock-modal .btn-success');
    confirmBtn.textContent = 'Add Stock';
    confirmBtn.onclick     = confirmRestock;

    document.getElementById('restock-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('restock-qty-input').focus(), 100);
}

function closeRestockModal() {
    document.getElementById('restock-modal').style.display = 'none';
    restockTargetId = null;
}

function confirmRestock() {
    const qty = parseInt(document.getElementById('restock-qty-input').value);
    if (!qty || qty <= 0) {
        document.getElementById('restock-error').textContent = 'Please enter a valid quantity.';
        document.getElementById('restock-error').classList.remove('hidden');
        return;
    }
    const product = products.find(p => p.id === restockTargetId);
    product.stock += qty;
    saveData();
    renderInventory();
    renderProducts();
    updateDashboardUI();
    closeRestockModal();
    showToast(`Added ${qty} units to ${product.name}.`, 'success');
}

// ==========================================
// 5b. EDIT PRICE
// ==========================================
function editPrice(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    restockTargetId = id;

    document.getElementById('restock-product-name').textContent = `Edit Price: ${product.img} ${product.name}`;
    const qtyInput = document.getElementById('restock-qty-input');
    qtyInput.type = 'number';
    qtyInput.step = '0.25';
    qtyInput.placeholder = `Current: ₱${product.price.toFixed(2)}`;
    qtyInput.value = product.price;
    document.getElementById('restock-error').textContent = 'Please enter a valid price greater than 0.';
    document.getElementById('restock-error').classList.add('hidden');

    const confirmBtn = document.querySelector('#restock-modal .btn-success');
    confirmBtn.textContent = 'Update Price';
    confirmBtn.onclick = confirmPriceUpdate;

    document.getElementById('restock-modal').style.display = 'flex';
    setTimeout(() => {
        qtyInput.focus();
        qtyInput.select();
    }, 100);
}

function confirmPriceUpdate() {
    const newPrice = parseFloat(document.getElementById('restock-qty-input').value);
    if (!newPrice || newPrice <= 0) {
        document.getElementById('restock-error').textContent = 'Please enter a valid price greater than 0.';
        document.getElementById('restock-error').classList.remove('hidden');
        return;
    }

    const product = products.find(p => p.id === restockTargetId);
    if (product) {
        const oldPrice = product.price;
        product.price = newPrice;
        saveData();
        renderInventory();
        renderProducts();
        updateDashboardUI();
        closeRestockModal();
        showToast(`${product.name} price updated from ₱${oldPrice.toFixed(2)} to ₱${newPrice.toFixed(2)}.`, 'success');
    }
}

// ==========================================
// 6. AUTHENTICATION & NAVIGATION
// ==========================================
function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
    toggleAuthMode('login');
    setTimeout(() => document.getElementById('login-user').focus(), 150);
}

function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}

function toggleAuthMode(mode) {
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('signup-error').classList.add('hidden');

    if (mode === 'signup') {
        document.getElementById('auth-title').innerText = 'Create Account';
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('signup-form').classList.remove('hidden');
        setTimeout(() => document.getElementById('signup-user').focus(), 100);
    } else {
        document.getElementById('auth-title').innerText = 'Welcome Back';
        document.getElementById('signup-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        setTimeout(() => document.getElementById('login-user').focus(), 100);
    }
}

function handleSignup(event) {
    event.preventDefault();
    const user = document.getElementById('signup-user').value.trim();
    const pass = document.getElementById('signup-pass').value;

    if (users.find(u => u.username.toLowerCase() === user.toLowerCase())) {
        document.getElementById('signup-error').classList.remove('hidden');
        return;
    }

    users.push({ username: user, password: pass, role: 'manager', active: true, created: new Date().toLocaleDateString() });
    currentUser = user;
    saveData();
    localStorage.setItem('sf_logged_in', 'true');
    closeLoginModal();
    unlockSystem();
    event.target.reset();
    showToast(`Welcome, ${user}! Your account is ready.`, 'success');
}

function handleLogin(event) {
    event.preventDefault();
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const foundUser = users.find(u => u.username.toLowerCase() === user.toLowerCase() && u.password === pass);

    if (foundUser) {
        currentUser = foundUser.username;
        localStorage.setItem('sf_logged_in', 'true');
        localStorage.setItem('sf_current_user', currentUser);
        closeLoginModal();
        unlockSystem();
        event.target.reset();
        showToast(`Welcome back, ${currentUser}!`, 'success');
    } else {
        document.getElementById('login-error').classList.remove('hidden');
        document.getElementById('login-pass').value = '';
        document.getElementById('login-pass').focus();
    }
}

function unlockSystem() {
    setUserDisplay();
    applyRoleRestrictions();
    const lp = document.getElementById('landing-page');
    lp.style.transition = 'opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), filter 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
    lp.style.opacity = '0';
    lp.style.transform = 'scale(1.02)';
    lp.style.filter = 'blur(6px)';
    lp.style.pointerEvents = 'none';
    setTimeout(() => { lp.style.display = 'none'; }, 650);
}

function setUserDisplay() {
    if (!currentUser) return;
    document.getElementById('sidebar-username').textContent = currentUser;
    document.getElementById('sidebar-avatar').textContent   = currentUser.charAt(0).toUpperCase();

    // Show role under username
    const role = getUserRole();
    const roleLabel = document.getElementById('sidebar-role');
    if (roleLabel) {
        const roleMap = { admin: 'Store Admin', manager: 'Store Manager', cashier: 'Cashier' };
        roleLabel.textContent = roleMap[role] || 'Staff';
    }
}

function getUserRole() {
    if (!currentUser) return 'cashier';
    const user = users.find(u => u.username.toLowerCase() === currentUser.toLowerCase());
    return user && user.role ? user.role.toLowerCase() : 'cashier';
}

function applyRoleRestrictions() {
    const role = getUserRole();
    const navUsers = document.getElementById('nav-users');
    if (navUsers) {
        // Only admin and manager can see Users page
        navUsers.style.display = (role === 'admin' || role === 'manager') ? '' : 'none';
    }
}

async function logout() {
    const ok = await showConfirm(
        'Log Out?',
        'You will be returned to the landing page. Any unsaved cart items will be lost.',
        'Log Out', 'btn-danger'
    );
    if (!ok) return;
    localStorage.removeItem('sf_logged_in');
    localStorage.removeItem('sf_current_user');
    location.reload();
}

function toggleSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const isOpen   = sidebar.classList.toggle('open');
    overlay.classList.toggle('active', isOpen);
}

function showPage(pageId, element) {
    // Role-based access: only admin/manager can access users page
    if (pageId === 'users') {
        const role = getUserRole();
        if (role !== 'admin' && role !== 'manager') {
            showToast('Access denied. Only Admins and Managers can manage users.', 'error');
            return;
        }
    }

    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(pageId).classList.add('active');
    if (element) element.classList.add('active');

    // Smooth scroll to top of main content
    const main = document.querySelector('main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('active');
    }

    if (pageId === 'pos') {
        setTimeout(() => document.getElementById('search-input').focus(), 100);
    }
    if (pageId === 'users') {
        // Clear search/filter so all users are visible
        const userSearch = document.getElementById('user-search');
        const userFilter = document.getElementById('user-role-filter');
        if (userSearch) userSearch.value = '';
        if (userFilter) userFilter.value = 'all';
        renderUsers();
    }
    if (pageId === 'analytics') renderAnalytics();
    if (pageId === 'settings') loadSettings();
}

// Close modals with ESC key
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.getElementById('login-modal').style.display === 'flex') closeLoginModal();
        if (document.getElementById('restock-modal').style.display === 'flex') closeRestockModal();
        if (document.getElementById('confirm-modal').style.display === 'flex') resolveConfirm(false);
        if (document.getElementById('receipt-modal').style.display === 'flex') closeReceipt();
        if (document.getElementById('member-portfolio-modal').style.display === 'flex') closeMemberPortfolio();
        if (document.getElementById('delete-account-modal').style.display === 'flex') closeDeleteAccountModal();
        if (document.getElementById('add-user-modal').style.display === 'flex') closeAddUserModal();
    }
});

// Close modal when clicking the backdrop
function handleModalBackdropClick(event, modalId, closeFn) {
    if (event.target.id === modalId) {
        if (closeFn) closeFn();
        else document.getElementById(modalId).style.display = 'none';
    }
}

// ==========================================
// 7. POS AND PRODUCT RENDERING
// ==========================================
function renderCategories() {
    document.getElementById('category-filters').innerHTML = categories.map(cat =>
        `<button class="cat-btn ${cat === activeCategory ? 'active' : ''}" onclick="setCategory('${cat}')">${cat}</button>`
    ).join('');
}

function setCategory(cat) {
    activeCategory = cat;
    renderCategories();
    renderProducts();
}

function renderProducts(searchQuery = '') {
    const grid = document.getElementById('product-grid');
    const filtered = products.filter(p => {
        const matchCat    = activeCategory === 'All' || p.category === activeCategory;
        const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">
            <div style="font-size:2.5rem;margin-bottom:10px;">🔍</div>
            <p>No products found.</p>
        </div>`;
        return;
    }

    grid.innerHTML = filtered.map(p => {
        let stockClass = 'badge-in', stockText = 'In Stock';
        if (p.stock === 0)       { stockClass = 'badge-out'; stockText = 'Out of Stock'; }
        else if (p.stock <= 10)  { stockClass = 'badge-low'; stockText = `Low: ${p.stock}`; }

        return `
        <div class="product-card ${p.stock === 0 ? 'out-of-stock' : ''}" onclick="addToCart(${p.id})">
            <div class="product-image">${p.img}</div>
            <div class="product-name">${p.name}</div>
            <div class="product-price">₱${p.price.toFixed(2)}</div>
            <span class="badge ${stockClass}">${stockText}</span>
        </div>`;
    }).join('');
}

function filterProducts() {
    renderProducts(document.getElementById('search-input').value);
}

// ==========================================
// 8. CART LOGIC
// ==========================================
function addToCart(id) {
    const product  = products.find(p => p.id === id);
    const existing = currentCart.find(item => item.id === id);

    if (product.stock <= 0) { showToast('This item is out of stock.', 'warning'); return; }

    if (existing && existing.qty >= product.stock) {
        showToast(`Max stock reached: only ${product.stock} units available.`, 'warning');
        return;
    }

    if (existing) existing.qty++;
    else currentCart.push({ ...product, qty: 1 });

    updateCartUI();
}

function removeFromCart(id) {
    currentCart = currentCart.filter(item => item.id !== id);
    updateCartUI();
}

function changeQty(id, delta) {
    const cartItem = currentCart.find(item => item.id === id);
    const product  = products.find(p => p.id === id);
    if (!cartItem) return;

    const newQty = cartItem.qty + delta;
    if (newQty < 1) { removeFromCart(id); return; }
    if (newQty > product.stock) { showToast(`Only ${product.stock} units available.`, 'warning'); return; }

    cartItem.qty = newQty;
    updateCartUI();
}

let cartTotalAmt = 0;

function updateCartUI() {
    const container = document.getElementById('cart-items');
    const clearBtn  = document.getElementById('btn-clear-cart');

    if (currentCart.length === 0) {
        container.innerHTML = `<p class="empty-cart-msg">Cart is empty.<br><small>Click a product to add.</small></p>`;
        document.getElementById('cart-total-display').innerText = '₱0.00';
        cartTotalAmt = 0;
        if (clearBtn) clearBtn.style.display = 'none';
        calculateChange();
        return;
    }

    if (clearBtn) clearBtn.style.display = '';

    cartTotalAmt = 0;
    container.innerHTML = currentCart.map(item => {
        const itemTotal = item.price * item.qty;
        cartTotalAmt += itemTotal;
        return `
        <div class="cart-item">
            <div class="item-info flex-1">
                <p class="cart-item-name">${item.img} ${item.name}</p>
                <div class="qty-stepper">
                    <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="qty-btn" onclick="changeQty(${item.id}, +1)">+</button>
                    <small class="cart-item-price">₱${itemTotal.toFixed(2)}</small>
                </div>
            </div>
            <button class="remove-btn" onclick="removeFromCart(${item.id})" title="Remove">&times;</button>
        </div>`;
    }).join('');

    document.getElementById('cart-total-display').innerText = `₱${cartTotalAmt.toFixed(2)}`;
    calculateChange();
}

function calculateChange() {
    const cashInput   = document.getElementById('cash-tendered').value;
    const checkoutBtn = document.getElementById('btn-checkout');
    const changeDis   = document.getElementById('change-display');

    if (currentCart.length === 0) {
        checkoutBtn.disabled = true;
        checkoutBtn.classList.remove('btn-primary');
        changeDis.innerText  = 'Change: ₱0.00';
        changeDis.className  = 'change-display text-right mt-2 text-primary';
        return;
    }

    if (cashInput === '' || parseFloat(cashInput) < cartTotalAmt) {
        checkoutBtn.disabled = true;
        checkoutBtn.classList.remove('btn-primary');
        changeDis.innerText  = cashInput === '' ? 'Enter amount received' : 'Insufficient amount';
        changeDis.className  = 'change-display text-right mt-2 error-text';
    } else {
        checkoutBtn.disabled = false;
        checkoutBtn.classList.add('btn-primary');
        const change = parseFloat(cashInput) - cartTotalAmt;
        changeDis.innerText  = `Change: ₱${change.toFixed(2)}`;
        changeDis.className  = 'change-display text-right mt-2 text-success';
    }
}

async function confirmClearCart() {
    if (currentCart.length === 0) return;
    const ok = await showConfirm('Clear Cart?', 'This will remove all items from the current order.', 'Clear Cart', 'btn-danger');
    if (ok) { currentCart = []; updateCartUI(); showToast('Cart cleared.', 'info'); }
}

// ==========================================
// 9. CHECKOUT & RECEIPT LOGIC
// ==========================================
function checkout() {
    const cashTendered = parseFloat(document.getElementById('cash-tendered').value);
    const change       = cashTendered - cartTotalAmt;
    const cartSnapshot = currentCart.map(item => ({ ...item }));

    dailyTotal += cartTotalAmt;
    transCount++;

    currentCart.forEach(cartItem => {
        const p = products.find(p => p.id === cartItem.id);
        if (p) {
            p.stock -= cartItem.qty;
            categorySales[p.category] = (categorySales[p.category] || 0) + (cartItem.price * cartItem.qty);
        }
    });

    const transactionRecord = {
        id:    transCount,
        total: cartTotalAmt,
        cash:  cashTendered,
        change: change,
        items: currentCart.length,
        itemDetails: currentCart.map(item => ({ name: item.name, qty: item.qty, price: item.price, category: item.category, img: item.img })),
        time:  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date:  new Date().toLocaleDateString()
    };
    salesHistory.unshift(transactionRecord);
    if (salesHistory.length > 20) salesHistory = salesHistory.slice(0, 20);

    saveData();
    updateDashboardUI();
    showReceipt(cartSnapshot, cartTotalAmt, cashTendered, change);

    currentCart = [];
    document.getElementById('cash-tendered').value = '';
    updateCartUI();
    renderProducts();

    const lowItems = products.filter(p => p.stock <= 10 && p.stock > 0);
    if (lowItems.length > 0) {
        setTimeout(() => showToast(`⚠️ ${lowItems.length} item(s) are running low on stock.`, 'warning', 5000), 1000);
    }
}

function showReceipt(cartItems, total, cash, change) {
    // Apply branding settings
    const settings = JSON.parse(localStorage.getItem('sf_settings') || '{}');
    const headerEl = document.getElementById('receipt-header-text');
    const taglineEl = document.getElementById('receipt-tagline-text');
    const footerEl = document.getElementById('receipt-footer-text');
    
    if (headerEl) headerEl.textContent = settings.receiptHeader || settings.storeName || 'StockFlow';
    if (taglineEl) taglineEl.textContent = settings.receiptTagline || 'Your trusted neighborhood store';
    if (footerEl) footerEl.textContent = settings.receiptFooter || 'Thank you, come again!';

    document.getElementById('receipt-txn').innerText  = transCount.toString().padStart(5, '0');
    document.getElementById('receipt-date').innerText = new Date().toLocaleDateString();

    document.getElementById('receipt-items').innerHTML = cartItems.map(item =>
        `<div class="flex-between" style="font-size:0.88rem;margin-bottom:6px;">
            <span>${item.qty}× ${item.name}</span>
            <span>₱${(item.price * item.qty).toFixed(2)}</span>
        </div>`
    ).join('');

    document.getElementById('receipt-total').innerText  = `₱${total.toFixed(2)}`;
    document.getElementById('receipt-cash').innerText   = `₱${cash.toFixed(2)}`;
    document.getElementById('receipt-change').innerText = `₱${change.toFixed(2)}`;

    document.getElementById('receipt-modal').style.display = 'flex';
}

function closeReceipt() {
    document.getElementById('receipt-modal').style.display = 'none';
}

function showTransactionReceipt(txnId) {
    const txn = salesHistory.find(t => t.id === txnId);
    if (!txn || !txn.itemDetails) {
        showToast('Receipt details not available for this transaction.', 'warning');
        return;
    }

    // Apply branding settings
    const settings = JSON.parse(localStorage.getItem('sf_settings') || '{}');
    const headerEl = document.getElementById('receipt-header-text');
    const taglineEl = document.getElementById('receipt-tagline-text');
    const footerEl = document.getElementById('receipt-footer-text');

    if (headerEl) headerEl.textContent = settings.receiptHeader || settings.storeName || 'StockFlow';
    if (taglineEl) taglineEl.textContent = settings.receiptTagline || 'Your trusted neighborhood store';
    if (footerEl) footerEl.textContent = settings.receiptFooter || 'Thank you, come again!';

    document.getElementById('receipt-txn').innerText  = txn.id.toString().padStart(5, '0');
    document.getElementById('receipt-date').innerText = txn.date || 'N/A';

    document.getElementById('receipt-items').innerHTML = txn.itemDetails.map(item =>
        `<div class="flex-between" style="font-size:0.88rem;margin-bottom:6px;">
            <span>${item.qty}× ${item.name}</span>
            <span>₱${(item.price * item.qty).toFixed(2)}</span>
        </div>`
    ).join('');

    document.getElementById('receipt-total').innerText  = `₱${txn.total.toFixed(2)}`;
    document.getElementById('receipt-cash').innerText   = txn.cash ? `₱${txn.cash.toFixed(2)}` : '—';
    document.getElementById('receipt-change').innerText = txn.change != null ? `₱${txn.change.toFixed(2)}` : '—';

    document.getElementById('receipt-modal').style.display = 'flex';
}

// ==========================================
// 10. INVENTORY MANAGEMENT
// ==========================================
function addProduct(event) {
    event.preventDefault();
    const name     = document.getElementById('new-p-name').value.trim();
    const category = document.getElementById('new-p-cat').value;
    const price    = parseFloat(document.getElementById('new-p-price').value);
    const stock    = parseInt(document.getElementById('new-p-stock').value);
    const img      = document.getElementById('new-p-img').value.trim();

    if (products.find(p => p.name.toLowerCase() === name.toLowerCase())) {
        showToast('A product with this name already exists.', 'warning');
        return;
    }

    const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
    products.push({ id: newId, name, category, price, stock, img });

    saveData();
    renderProducts();
    renderInventory();
    updateDashboardUI();
    event.target.reset();
    showToast(`${img} ${name} added to inventory!`, 'success');
}

function renderInventory() {
    const search    = (document.getElementById('inventory-search')?.value || '').toLowerCase();
    const filterVal = document.getElementById('inventory-filter')?.value || 'all';

    const filtered = products.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search);
        let matchFilter   = true;
        if (filterVal === 'low') matchFilter = p.stock > 0 && p.stock <= 10;
        if (filterVal === 'out') matchFilter = p.stock === 0;
        if (filterVal === 'in')  matchFilter = p.stock > 10;
        return matchSearch && matchFilter;
    });

    const emptyEl = document.getElementById('inventory-empty');
    const tbody   = document.getElementById('inventory-table');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
    } else {
        emptyEl.classList.add('hidden');
        tbody.innerHTML = filtered.map(p => {
            let stockClass = 'badge-in', stockText = 'In Stock';
            if (p.stock === 0)      { stockClass = 'badge-out'; stockText = 'Out of Stock'; }
            else if (p.stock <= 10) { stockClass = 'badge-low'; stockText = 'Low Stock'; }

            return `
            <tr>
                <td><strong>${p.img} ${p.name}</strong></td>
                <td><span style="color:var(--secondary);font-size:0.85rem;">${p.category}</span></td>
                <td style="font-weight:700;color:var(--success);">₱${p.price.toFixed(2)}</td>
                <td>${p.stock} units</td>
                <td><span class="badge ${stockClass}">${stockText}</span></td>
                <td>
                    <button class="btn-action-success" onclick="restockItem(${p.id})">+ Restock</button>
                    <button class="btn-action-edit"    onclick="editPrice(${p.id})">✏️ Price</button>
                    <button class="btn-action-danger"  onclick="deleteItem(${p.id})">🗑</button>
                </td>
            </tr>`;
        }).join('');
    }
}

async function deleteItem(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const ok = await showConfirm(
        'Delete Product?',
        `Remove "${product.name}" from inventory? This cannot be undone.`,
        'Delete', 'btn-danger'
    );
    if (ok) {
        products = products.filter(p => p.id !== id);
        saveData();
        renderInventory();
        renderProducts();
        showToast(`${product.name} removed from inventory.`, 'info');
    }
}

// ==========================================
// 11. DASHBOARD & CHARTS
// ==========================================
function animateValue(el, target, prefix = '') {
    if (!el) return;
    const isFloat  = target % 1 !== 0;
    const duration = 800;
    const start    = performance.now();
    const from     = parseFloat(el.dataset.current || 0);

    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        // Smooth cubic-bezier easing
        const ease     = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const current  = from + (target - from) * ease;
        el.textContent = prefix + (isFloat ? current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(current));
        el.dataset.current = current;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function updateDashboardUI() {
    animateValue(document.getElementById('dash-total-sales'), dailyTotal, '₱');
    animateValue(document.getElementById('dash-trans-count'), transCount);

    const lowStockCount = products.filter(p => p.stock <= 10).length;
    animateValue(document.getElementById('dash-low-stock'), lowStockCount);

    const list = document.getElementById('activity-list');
    if (salesHistory.length > 0) {
        document.getElementById('no-activity').style.display = 'none';
        list.innerHTML = salesHistory.map(log =>
            `<li class="activity-item activity-clickable" onclick="showTransactionReceipt(${log.id})" title="Click to view receipt">
                <div class="activity-item-left">
                    <strong>Txn #${log.id.toString().padStart(4, '0')}</strong>
                    <small>${log.time} · ${log.items} item${log.items !== 1 ? 's' : ''}</small>
                </div>
                <span class="activity-amount">+₱${log.total.toFixed(2)}</span>
            </li>`
        ).join('');
    }

    renderInventory();
    setTimeout(updateChart, 50);
}

function updateChart() {
    const hasSales = Object.values(categorySales).some(v => v > 0);
    document.getElementById('chart-empty-state').style.display = hasSales ? 'none' : '';
    document.getElementById('chart-container').style.display   = hasSales ? 'block' : 'none';
    if (!hasSales) return;

    const ctx    = document.getElementById('salesChart').getContext('2d');
    const labels = Object.keys(categorySales).filter((_, i) => Object.values(categorySales)[i] > 0);
    const data   = Object.values(categorySales).filter(v => v > 0);

    if (salesChartInstance) salesChartInstance.destroy();
    salesChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#6b7280'],
                borderWidth: 3,
                borderColor: document.body.classList.contains('dark-mode') ? '#1e293b' : '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 16,
                        font: { family: 'Inter', size: 13 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ₱${ctx.parsed.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    }
                }
            },
            cutout: '65%'
        }
    });
}

// ==========================================
// 12. DAILY SALES RESET
// ==========================================
async function confirmResetDailySales() {
    const ok = await showConfirm(
        'Reset Daily Sales?',
        'This will clear today\'s total, transaction count, and category sales. Inventory stock will not be affected.',
        'Reset', 'btn-danger'
    );
    if (!ok) return;

    dailyTotal    = 0;
    transCount    = 0;
    salesHistory  = [];
    categorySales = { 'Meat': 0, 'Canned Goods': 0, 'Beverages': 0, 'Pantry': 0, 'Snacks': 0, 'Others': 0 };

    ['dash-total-sales', 'dash-trans-count', 'dash-low-stock'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.dataset.current = '0';
    });

    saveData();
    document.getElementById('activity-list').innerHTML = '';
    document.getElementById('no-activity').style.display = '';
    updateDashboardUI();
    showToast('Daily sales have been reset.', 'info');
}

// ==========================================
// 13. LANDING PAGE NAVIGATION & FEATURES
// ==========================================
function lpScroll(sectionId) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const lp = document.getElementById('landing-page');
    const target = el.offsetTop - 73;
    lp.scrollTo({ top: target, behavior: 'smooth' });
    // close mobile menu if open
    document.getElementById('lp-nav-links').classList.remove('open');
}

function toggleLpNav() {
    document.getElementById('lp-nav-links').classList.toggle('open');
}

let billingYearly = false;
function toggleBilling() {
    billingYearly = !billingYearly;
    const thumb  = document.getElementById('lp-toggle-thumb');
    const track  = document.getElementById('lp-billing-toggle');
    const proAmt = document.getElementById('pro-price');
    const proP   = document.getElementById('pro-period');
    const proT   = document.getElementById('pro-trial');
    const bizAmt = document.getElementById('biz-price');
    const bizP   = document.getElementById('biz-period');
    const bizT   = document.getElementById('biz-trial');

    if (billingYearly) {
        thumb.classList.add('right');
        track.classList.add('active');
        proAmt.textContent = '₱1,910';
        proP.textContent   = '/year';
        proT.textContent   = '🎁 Save ₱478 vs monthly + 30-day trial';
        bizAmt.textContent = '₱4,790';
        bizP.textContent   = '/year';
        bizT.textContent   = '🎁 Save ₱1,198 vs monthly + 30-day trial';
    } else {
        thumb.classList.remove('right');
        track.classList.remove('active');
        proAmt.textContent = '₱199';
        proP.textContent   = '/month';
        proT.textContent   = '🎁 30-day free trial included';
        bizAmt.textContent = '₱499';
        bizP.textContent   = '/month';
        bizT.textContent   = '🎁 30-day free trial included';
    }
}

// Navbar scroll shadow
function initLandingNavbar() {
    const lp = document.getElementById('landing-page');
    const nav = document.getElementById('lp-navbar');
    if (!lp || !nav) return;
    lp.addEventListener('scroll', () => {
        if (lp.scrollTop > 20) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });
}

// ==========================================
// 13b. LANDING PAGE CANVAS ANIMATION
// ==========================================
function initLandingCanvas() {
    const canvas = document.getElementById('landing-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);

    const dots = Array.from({ length: 60 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.4,
        dy: (Math.random() - 0.5) * 0.4,
        opacity: Math.random() * 0.5 + 0.1
    }));

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        dots.forEach(d => {
            d.x += d.dx; d.y += d.dy;
            if (d.x < 0 || d.x > canvas.width)  d.dx *= -1;
            if (d.y < 0 || d.y > canvas.height)  d.dy *= -1;

            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(147, 197, 253, ${d.opacity})`;
            ctx.fill();
        });

        for (let i = 0; i < dots.length; i++) {
            for (let j = i + 1; j < dots.length; j++) {
                const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(dots[i].x, dots[i].y);
                    ctx.lineTo(dots[j].x, dots[j].y);
                    ctx.strokeStyle = `rgba(147, 197, 253, ${0.07 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(draw);
    }
    draw();
}

// ==========================================
// DARK MODE
// ==========================================
function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('sf_dark_mode', isDark ? 'true' : 'false');
    const label = document.getElementById('dark-mode-label');
    if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    const btn = document.getElementById('dark-mode-btn');
    if (btn) btn.querySelector('.nav-icon').textContent = isDark ? '☀️' : '🌙';
}

// ==========================================
// TEAM PORTFOLIO
// ==========================================
const teamMembers = [
    {
        name: 'Christian Reynald Canto',
        role: 'Project Manager',
        sub: 'Lead Developer',
        initials: 'CC',
        about: 'Christian leads the StockFlow project, coordinating the team\'s efforts and translating business needs into technical solutions. As Lead Developer, he oversees the overall architecture and ensures the codebase remains clean and maintainable.',
        skills: ['Project Management', 'JavaScript', 'HTML/CSS', 'System Architecture', 'Git'],
        contributions: [
            'Designed and implemented the core application architecture',
            'Built the POS checkout and receipt generation system',
            'Led sprint planning and task distribution across the team',
            'Implemented local storage data persistence layer'
        ]
    },
    {
        name: 'Samuel Deocares Divina',
        role: 'QA Engineer',
        sub: 'Lead Documentation',
        initials: 'SD',
        about: 'Samuel ensures StockFlow meets quality standards by crafting thorough test cases and maintaining comprehensive documentation. His meticulous approach catches bugs before they reach users.',
        skills: ['Quality Assurance', 'Test Planning', 'Technical Writing', 'Bug Tracking', 'User Testing'],
        contributions: [
            'Developed the full QA test plan and test case suite',
            'Authored the technical documentation and user manual',
            'Conducted usability tests with target end-users',
            'Maintained the project\'s bug and issue tracker'
        ]
    },
    {
        name: 'Jayvie Gonzales Garcia',
        role: 'UX Designer',
        sub: 'Front-End Integration',
        initials: 'JG',
        about: 'Jayvie bridges design and code, crafting user experiences that are intuitive for everyday shop owners. He translates wireframes and user research into working front-end components.',
        skills: ['UX/UI Design', 'Figma', 'CSS', 'User Research', 'Prototyping'],
        contributions: [
            'Designed the full UX flow and wireframes for the dashboard',
            'Implemented the responsive front-end layout and components',
            'Conducted user research with sari-sari store owners',
            'Created the landing page visual design and interactions'
        ]
    },
    {
        name: 'Jhaila David Pagaduan',
        role: 'System Analyst',
        sub: 'Data Logic Flow',
        initials: 'JP',
        about: 'Jhaila analyzes system requirements and designs the data flow that powers StockFlow\'s inventory logic. She ensures the system\'s logic is accurate, scalable, and aligned with user needs.',
        skills: ['Systems Analysis', 'Data Modeling', 'Requirements Gathering', 'Logic Design', 'Documentation'],
        contributions: [
            'Mapped out the full inventory and sales data logic flow',
            'Defined system requirements through stakeholder interviews',
            'Designed the product, cart, and transaction data structures',
            'Created entity-relationship diagrams and flow charts'
        ]
    },
    {
        name: 'Mark Rain Rodolfo',
        role: 'UI Designer',
        sub: 'Visual Aesthetics',
        initials: 'MR',
        about: 'Mark is responsible for the visual language that makes StockFlow look polished and professional. He crafts the color palette, typography, icons, and overall aesthetic that gives the app its distinctive identity.',
        skills: ['UI Design', 'Visual Design', 'Color Theory', 'Typography', 'Figma'],
        contributions: [
            'Established the design system, color palette, and typography',
            'Designed all UI components, icons, and visual elements',
            'Created the StockFlow brand identity and logo',
            'Produced high-fidelity mockups for developer handoff'
        ]
    }
];

function openMemberPortfolio(index) {
    const m = teamMembers[index];
    document.getElementById('pm-avatar').textContent = m.initials;
    document.getElementById('pm-name').textContent   = m.name;
    document.getElementById('pm-role').textContent   = m.role;
    document.getElementById('pm-sub').textContent    = m.sub;
    document.getElementById('pm-about').textContent  = m.about;
    document.getElementById('pm-skills').innerHTML   = m.skills.map(s => `<span class="skill-tag">${s}</span>`).join('');
    document.getElementById('pm-contributions').innerHTML = m.contributions.map(c => `<li>${c}</li>`).join('');
    document.getElementById('member-portfolio-modal').style.display = 'flex';
}

function closeMemberPortfolio() {
    document.getElementById('member-portfolio-modal').style.display = 'none';
}

// ==========================================
// DELETE ACCOUNT
// ==========================================
function showDeleteAccountModal() {
    if (!currentUser) return;
    document.getElementById('delete-account-pass').value = '';
    document.getElementById('delete-account-error').classList.add('hidden');
    document.getElementById('delete-account-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('delete-account-pass').focus(), 150);
}

function closeDeleteAccountModal() {
    document.getElementById('delete-account-modal').style.display = 'none';
}

async function confirmDeleteAccount() {
    const pass = document.getElementById('delete-account-pass').value;
    const user = users.find(u => u.username.toLowerCase() === currentUser.toLowerCase() && u.password === pass);

    if (!user) {
        document.getElementById('delete-account-error').classList.remove('hidden');
        document.getElementById('delete-account-pass').value = '';
        document.getElementById('delete-account-pass').focus();
        return;
    }

    closeDeleteAccountModal();
    const ok = await showConfirm(
        'Final Confirmation',
        `Permanently delete account "${currentUser}"? All your data will be erased.`,
        'Yes, Delete', 'btn-danger'
    );
    if (!ok) return;

    users = users.filter(u => u.username.toLowerCase() !== currentUser.toLowerCase());
    localStorage.setItem('sf_users', JSON.stringify(users));
    localStorage.removeItem('sf_logged_in');
    localStorage.removeItem('sf_current_user');
    showToast('Account deleted. Redirecting...', 'info', 1500);
    setTimeout(() => location.reload(), 1500);
}

// ==========================================
// EXPORT CSV
// ==========================================
function exportCSV() {
    if (salesHistory.length === 0) {
        showToast('No sales data to export.', 'warning');
        return;
    }

    let csv = 'Transaction #,Time,Items,Total (₱)\n';
    salesHistory.forEach(log => {
        csv += `${log.id},${log.time},${log.items},${log.total.toFixed(2)}\n`;
    });

    csv += `\nSummary\nTotal Revenue,₱${dailyTotal.toFixed(2)}\n`;
    csv += `Total Transactions,${transCount}\n`;
    csv += `Average Order Value,₱${transCount > 0 ? (dailyTotal / transCount).toFixed(2) : '0.00'}\n\n`;

    csv += 'Category,Revenue (₱)\n';
    Object.entries(categorySales).forEach(([cat, amt]) => {
        csv += `${cat},${amt.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stockflow_sales_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Sales data exported as CSV.', 'success');
}

// ==========================================
// ANALYTICS PAGE
// ==========================================
function renderAnalytics() {
    // Summary cards
    document.getElementById('analytics-revenue').textContent = `₱${dailyTotal.toFixed(2)}`;
    document.getElementById('analytics-transactions').textContent = transCount;
    document.getElementById('analytics-avg').textContent = transCount > 0
        ? `₱${(dailyTotal / transCount).toFixed(2)}`
        : '₱0.00';

    // Top category
    const topCat = Object.entries(categorySales)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);
    document.getElementById('analytics-top-cat').textContent = topCat.length > 0
        ? topCat[0][0]
        : '—';

    // Top products table (sorted by estimated units sold based on category sales)
    const topProdsEl = document.getElementById('analytics-top-products');
    const topEmptyEl = document.getElementById('analytics-top-empty');
    if (salesHistory.length === 0) {
        topProdsEl.innerHTML = '';
        topEmptyEl.classList.remove('hidden');
    } else {
        topEmptyEl.classList.add('hidden');
        // Aggregate sold units per product from transaction history
        const soldMap = {};
        salesHistory.forEach(log => {
            if (log.itemDetails) {
                log.itemDetails.forEach(item => {
                    const key = item.name;
                    if (!soldMap[key]) soldMap[key] = { ...item, sold: 0 };
                    soldMap[key].sold += item.qty;
                });
            }
        });

        let productsSorted = Object.values(soldMap)
            .sort((a, b) => b.sold - a.sold)
            .slice(0, 10);

        // Fallback: if no itemDetails, use stock depletion
        if (productsSorted.length === 0) {
            productsSorted = [...products]
                .map(p => {
                    const def = defaultProducts.find(d => d.id === p.id);
                    const sold = def ? Math.max(0, def.stock - p.stock) : 0;
                    return { ...p, sold };
                })
                .filter(p => p.sold > 0)
                .sort((a, b) => b.sold - a.sold)
                .slice(0, 10);
        }

        if (productsSorted.length === 0) {
            topProdsEl.innerHTML = '';
            topEmptyEl.classList.remove('hidden');
        } else {
            topProdsEl.innerHTML = productsSorted.map((p, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td><strong>${p.img} ${p.name}</strong></td>
                    <td><span style="color:var(--secondary);font-size:0.85rem;">${p.category}</span></td>
                    <td style="font-weight:700;color:var(--success);">₱${p.price.toFixed(2)}</td>
                    <td><strong>${p.sold}</strong> units</td>
                </tr>
            `).join('');
        }
    }

    // Category bar chart
    const barsEl = document.getElementById('analytics-cat-bars');
    const catEmptyEl = document.getElementById('analytics-cat-empty');
    const hasCatData = Object.values(categorySales).some(v => v > 0);

    if (!hasCatData) {
        barsEl.innerHTML = '';
        catEmptyEl.classList.remove('hidden');
    } else {
        catEmptyEl.classList.add('hidden');
        const maxVal = Math.max(...Object.values(categorySales));
        const catClasses = {
            'Meat': 'bar-meat', 'Canned Goods': 'bar-canned', 'Beverages': 'bar-beverages',
            'Pantry': 'bar-pantry', 'Snacks': 'bar-snacks', 'Others': 'bar-others'
        };

        barsEl.innerHTML = Object.entries(categorySales).map(([cat, amt]) => {
            const pct = maxVal > 0 ? (amt / maxVal) * 100 : 0;
            return `
                <div class="analytics-bar-item">
                    <span class="analytics-bar-value">₱${amt.toFixed(0)}</span>
                    <div class="analytics-bar ${catClasses[cat] || 'bar-others'}" style="height:${Math.max(pct, 3)}%;"></div>
                    <span class="analytics-bar-label">${cat}</span>
                </div>`;
        }).join('');
    }

    // Transaction history table
    const txnTable = document.getElementById('analytics-txn-table');
    const txnEmpty = document.getElementById('analytics-txn-empty');
    if (salesHistory.length === 0) {
        txnTable.innerHTML = '';
        txnEmpty.classList.remove('hidden');
    } else {
        txnEmpty.classList.add('hidden');
        txnTable.innerHTML = salesHistory.map(log => `
            <tr class="txn-clickable" onclick="showTransactionReceipt(${log.id})" title="Click to view receipt">
                <td><strong>#${log.id.toString().padStart(5, '0')}</strong></td>
                <td>${log.time}</td>
                <td>${log.items} item${log.items !== 1 ? 's' : ''}</td>
                <td style="font-weight:700;color:var(--success);">+₱${log.total.toFixed(2)}</td>
                <td><span class="btn-view-receipt">🧾 View</span></td>
            </tr>
        `).join('');
    }
}

// ==========================================
// USERS PAGE
// ==========================================
function renderUsers() {
    const search = (document.getElementById('user-search')?.value || '').toLowerCase();
    const roleFilter = document.getElementById('user-role-filter')?.value || 'all';

    const filtered = users.filter(u => {
        const matchSearch = u.username.toLowerCase().includes(search);
        const role = u.role || 'cashier';
        const matchRole = roleFilter === 'all' || role === roleFilter;
        return matchSearch && matchRole;
    });

    const tbody = document.getElementById('users-table');
    const emptyEl = document.getElementById('users-empty');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
    } else {
        emptyEl.classList.add('hidden');
        tbody.innerHTML = filtered.map(u => {
            const role = u.role || 'cashier';
            const status = u.active !== false ? 'active' : 'inactive';
            const created = u.created || 'N/A';
            const isCurrentUser = u.username.toLowerCase() === (currentUser || '').toLowerCase();

            return `
            <tr>
                <td><strong>${u.username}</strong>${isCurrentUser ? ' <small style="color:var(--accent);">(you)</small>' : ''}</td>
                <td><span class="role-badge role-${role}">${role}</span></td>
                <td><span class="user-status user-${status}">${status}</span></td>
                <td><span style="color:var(--secondary);font-size:0.85rem;">${created}</span></td>
                <td>
                    ${!isCurrentUser ? `
                        <button class="btn-action-edit" onclick="toggleUserStatus('${u.username}')">${status === 'active' ? '⏸ Deactivate' : '▶ Activate'}</button>
                        <button class="btn-action-danger" onclick="deleteUser('${u.username}')">🗑</button>
                    ` : '<span style="color:var(--secondary);font-size:0.82rem;">—</span>'}
                </td>
            </tr>`;
        }).join('');
    }
}

function showAddUserModal() {
    document.getElementById('add-user-form').reset();
    document.getElementById('add-user-error').classList.add('hidden');
    document.getElementById('add-user-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('new-user-name').focus(), 150);
}

function closeAddUserModal() {
    document.getElementById('add-user-modal').style.display = 'none';
}

function saveNewUser(event) {
    event.preventDefault();
    const username = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;

    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        document.getElementById('add-user-error').classList.remove('hidden');
        return;
    }

    users.push({
        username,
        password,
        role,
        active: true,
        created: new Date().toLocaleDateString()
    });
    saveData();
    closeAddUserModal();
    renderUsers();
    showToast(`User "${username}" created as ${role}.`, 'success');
}

async function toggleUserStatus(username) {
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return;
    const newStatus = user.active === false ? 'activate' : 'deactivate';
    const ok = await showConfirm(
        `${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)} User?`,
        `Are you sure you want to ${newStatus} "${username}"?${newStatus === 'deactivate' ? ' They will not be able to log in.' : ''}`,
        newStatus.charAt(0).toUpperCase() + newStatus.slice(1),
        newStatus === 'deactivate' ? 'btn-danger' : 'btn-success'
    );
    if (!ok) return;
    user.active = user.active === false ? true : false;
    saveData();
    renderUsers();
    showToast(`${user.username} ${user.active ? 'activated' : 'deactivated'}.`, 'info');
}

async function deleteUser(username) {
    const ok = await showConfirm(
        'Delete User?',
        `Remove user "${username}"? This cannot be undone.`,
        'Delete', 'btn-danger'
    );
    if (!ok) return;
    users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
    saveData();
    renderUsers();
    showToast(`User "${username}" removed.`, 'info');
}

// ==========================================
// SETTINGS PAGE
// ==========================================
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('sf_settings') || '{}');
    if (settings.storeName) document.getElementById('set-store-name').value = settings.storeName;
    if (settings.ownerName) document.getElementById('set-owner-name').value = settings.ownerName;
    if (settings.address) document.getElementById('set-address').value = settings.address;
    if (settings.contact) document.getElementById('set-contact').value = settings.contact;
    if (settings.receiptHeader) document.getElementById('set-receipt-header').value = settings.receiptHeader;
    if (settings.receiptFooter) document.getElementById('set-receipt-footer').value = settings.receiptFooter;
    if (settings.receiptTagline) document.getElementById('set-receipt-tagline').value = settings.receiptTagline;

    // Integrations
    const integrations = JSON.parse(localStorage.getItem('sf_integrations') || '{}');
    if (integrations.cloud) document.getElementById('int-cloud').checked = true;
    if (integrations.sms) document.getElementById('int-sms').checked = true;
    if (integrations.email) document.getElementById('int-email').checked = true;

    updateBrandingPreview();
    renderBranches();
}

function saveSettings(event) {
    event.preventDefault();
    const settings = {
        storeName: document.getElementById('set-store-name').value.trim(),
        ownerName: document.getElementById('set-owner-name').value.trim(),
        address: document.getElementById('set-address').value.trim(),
        contact: document.getElementById('set-contact').value.trim(),
        receiptHeader: document.getElementById('set-receipt-header').value.trim(),
        receiptFooter: document.getElementById('set-receipt-footer').value.trim(),
        receiptTagline: document.getElementById('set-receipt-tagline').value.trim()
    };
    localStorage.setItem('sf_settings', JSON.stringify(settings));
    showToast('Settings saved successfully!', 'success');
}

function updateBrandingPreview() {
    const header = document.getElementById('set-receipt-header')?.value || 'StockFlow';
    const tagline = document.getElementById('set-receipt-tagline')?.value || 'Your trusted neighborhood store';
    const footer = document.getElementById('set-receipt-footer')?.value || 'Thank you for your purchase!';

    const ph = document.getElementById('preview-header');
    const pt = document.getElementById('preview-tagline');
    const pf = document.getElementById('preview-footer');
    if (ph) ph.textContent = header || 'StockFlow';
    if (pt) pt.textContent = tagline || 'Your trusted neighborhood store';
    if (pf) pf.textContent = footer || 'Thank you for your purchase!';

    // Auto-save receipt branding so receipts always reflect current settings
    const settings = JSON.parse(localStorage.getItem('sf_settings') || '{}');
    settings.receiptHeader = document.getElementById('set-receipt-header')?.value.trim() || '';
    settings.receiptFooter = document.getElementById('set-receipt-footer')?.value.trim() || '';
    settings.receiptTagline = document.getElementById('set-receipt-tagline')?.value.trim() || '';
    localStorage.setItem('sf_settings', JSON.stringify(settings));
}

function renderBranches() {
    const branches = JSON.parse(localStorage.getItem('sf_branches') || '[]');
    const container = document.getElementById('branches-list');
    if (!container) return;

    if (branches.length === 0) {
        container.innerHTML = '<div class="branches-empty">🏢 No branches added yet.</div>';
        return;
    }

    container.innerHTML = branches.map((b, i) => `
        <div class="branch-card">
            <div class="branch-name">
                🏢 ${b.name}
                <small>Added ${b.created || 'N/A'}</small>
            </div>
            <button class="btn-action-danger" onclick="deleteBranch(${i})">🗑</button>
        </div>
    `).join('');
}

function addBranch() {
    const input = document.getElementById('new-branch-name');
    const name = input.value.trim();
    if (!name) {
        showToast('Please enter a branch name.', 'warning');
        return;
    }

    const branches = JSON.parse(localStorage.getItem('sf_branches') || '[]');
    if (branches.find(b => b.name.toLowerCase() === name.toLowerCase())) {
        showToast('A branch with this name already exists.', 'warning');
        return;
    }

    branches.push({ name, created: new Date().toLocaleDateString() });
    localStorage.setItem('sf_branches', JSON.stringify(branches));
    input.value = '';
    renderBranches();
    showToast(`Branch "${name}" added.`, 'success');
}

async function deleteBranch(index) {
    const branches = JSON.parse(localStorage.getItem('sf_branches') || '[]');
    if (index < 0 || index >= branches.length) return;

    const ok = await showConfirm(
        'Delete Branch?',
        `Remove branch "${branches[index].name}"?`,
        'Delete', 'btn-danger'
    );
    if (!ok) return;

    const removed = branches.splice(index, 1);
    localStorage.setItem('sf_branches', JSON.stringify(branches));
    renderBranches();
    showToast(`Branch "${removed[0].name}" removed.`, 'info');
}

function toggleIntegration(key, enabled) {
    const integrations = JSON.parse(localStorage.getItem('sf_integrations') || '{}');
    integrations[key] = enabled;
    localStorage.setItem('sf_integrations', JSON.stringify(integrations));
    const names = { cloud: 'Cloud Backup', sms: 'SMS Notifications', email: 'Email Reports' };
    showToast(`${names[key] || key} ${enabled ? 'enabled' : 'disabled'}.`, enabled ? 'success' : 'info');
}

// ==========================================
// 14. APP INITIALIZATION
// ==========================================
window.onload = () => {
    loadData();
    initLandingCanvas();
    initLandingNavbar();
    renderCategories();
    renderProducts();
    updateDashboardUI();

    // Restore dark mode preference
    if (localStorage.getItem('sf_dark_mode') === 'true') {
        document.body.classList.add('dark-mode');
        const label = document.getElementById('dark-mode-label');
        if (label) label.textContent = 'Light Mode';
        const btn = document.getElementById('dark-mode-btn');
        if (btn) btn.querySelector('.nav-icon').textContent = '☀️';
    }

    // Live inventory search + filter
    const invSearch = document.getElementById('inventory-search');
    if (invSearch) {
        invSearch.addEventListener('input', renderInventory);
    }

    if (localStorage.getItem('sf_logged_in') === 'true') {
        document.getElementById('landing-page').style.display = 'none';
        setUserDisplay();
    }

    // Enter key support in restock modal
    const restockInput = document.getElementById('restock-qty-input');
    if (restockInput) {
        restockInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const confirmBtn = document.querySelector('#restock-modal .btn-success');
                if (confirmBtn) confirmBtn.click();
            }
        });
    }

    const clearBtn = document.getElementById('btn-clear-cart');
    if (clearBtn) clearBtn.style.display = 'none';

    // Initialize new pages
    loadSettings();

    // Ensure existing users have role/active/created fields
    users.forEach(u => {
        if (!u.role) u.role = u.username.toLowerCase() === 'demo' ? 'admin' : 'cashier';
        if (u.active === undefined) u.active = true;
        if (!u.created) u.created = 'Legacy';
    });
    saveData();
};

// ==========================================
// CONTACT & SUPPORT FORM HANDLERS
// ==========================================
function handleContactForm(event) {
    event.preventDefault();
    event.target.reset();
    // Show a subtle success state on the landing page
    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = '✅ Message Sent!';
    btn.style.background = '#10b981';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 3000);
}

function handleSupportTicket(event) {
    event.preventDefault();
    const name = document.getElementById('support-name').value.trim();
    showToast(`Thank you, ${name}! Your support ticket has been submitted. We'll respond within 24 hours.`, 'success', 5000);
    event.target.reset();
}