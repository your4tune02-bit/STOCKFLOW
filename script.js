// ==========================================
// 1. SYSTEM STATE & DEFAULTS
// ==========================================
let dailyTotal = 0;
let transCount = 0;
let currentCart = [];
let activeCategory = 'All';
let salesHistory = [];
let categorySales = { 'Meat': 0, 'Canned Goods': 0, 'Beverages': 0, 'Pantry': 0 };
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
    { id: 8, name: 'Instant Coffee',   category: 'Pantry',      price: 12,  stock: 120, img: '☕' }
];

let products = [];
const categories = ['All', 'Meat', 'Canned Goods', 'Beverages', 'Pantry'];

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

    // Reuse the restock modal, swapping its behaviour for price editing
    document.getElementById('restock-product-name').textContent  = `Edit Price: ${product.img} ${product.name}`;
    document.getElementById('restock-qty-input').type        = 'number';
    document.getElementById('restock-qty-input').placeholder = `Current: ₱${product.price.toFixed(2)}`;
    document.getElementById('restock-qty-input').value       = product.price;
    document.getElementById('restock-error').textContent     = 'Please enter a valid price greater than 0.';
    document.getElementById('restock-error').classList.add('hidden');

    const confirmBtn = document.querySelector('#restock-modal .btn-success');
    confirmBtn.textContent = 'Update Price';
    confirmBtn.onclick = () => {
        const newPrice = parseFloat(document.getElementById('restock-qty-input').value);
        if (!newPrice || newPrice <= 0) {
            document.getElementById('restock-error').textContent = 'Please enter a valid price greater than 0.';
            document.getElementById('restock-error').classList.remove('hidden');
            return;
        }
        product.price = newPrice;
        saveData();
        renderInventory();
        renderProducts();
        closeRestockModal();
        showToast(`${product.name} price updated to ₱${newPrice.toFixed(2)}.`, 'success');
    };

    document.getElementById('restock-modal').style.display = 'flex';
    setTimeout(() => {
        const input = document.getElementById('restock-qty-input');
        input.focus();
        input.select();
    }, 100);
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

    users.push({ username: user, password: pass });
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
    const lp = document.getElementById('landing-page');
    lp.style.opacity = '0';
    lp.style.pointerEvents = 'none';
    setTimeout(() => { lp.style.display = 'none'; }, 500);
}

function setUserDisplay() {
    if (!currentUser) return;
    document.getElementById('sidebar-username').textContent = currentUser;
    document.getElementById('sidebar-avatar').textContent   = currentUser.charAt(0).toUpperCase();
}

function logout() {
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
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(pageId).classList.add('active');
    if (element) element.classList.add('active');

    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('active');
    }

    if (pageId === 'pos') {
        setTimeout(() => document.getElementById('search-input').focus(), 100);
    }
}

// Close modals with ESC key
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.getElementById('login-modal').style.display === 'flex') closeLoginModal();
        if (document.getElementById('restock-modal').style.display === 'flex') closeRestockModal();
        if (document.getElementById('confirm-modal').style.display === 'flex') resolveConfirm(false);
        if (document.getElementById('receipt-modal').style.display === 'flex') closeReceipt();
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
        items: currentCart.length,
        time:  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
    const duration = 600;
    const start    = performance.now();
    const from     = parseFloat(el.dataset.current || 0);

    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const ease     = 1 - Math.pow(1 - progress, 3);
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
            `<li class="activity-item">
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
                backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'],
                borderWidth: 3,
                borderColor: '#ffffff',
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
    categorySales = { 'Meat': 0, 'Canned Goods': 0, 'Beverages': 0, 'Pantry': 0 };

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
// 13. LANDING PAGE CANVAS ANIMATION
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
// 14. APP INITIALIZATION
// ==========================================
window.onload = () => {
    loadData();
    initLandingCanvas();
    renderCategories();
    renderProducts();
    updateDashboardUI();

    if (localStorage.getItem('sf_logged_in') === 'true') {
        document.getElementById('landing-page').style.display = 'none';
        setUserDisplay();
    }

    // Enter key in restock/price modal triggers the active confirm button
    document.getElementById('restock-qty-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const confirmBtn = document.querySelector('#restock-modal .btn-success');
            if (confirmBtn) confirmBtn.click();
        }
    });

    const clearBtn = document.getElementById('btn-clear-cart');
    if (clearBtn) clearBtn.style.display = 'none';
};