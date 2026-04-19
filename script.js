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

const defaultProducts = [];
let products = [];

// Product image store
const productImages = {
    _store: {},
    save(id, dataUrl) {
        this._store[id] = dataUrl;
        try { localStorage.setItem('sf_img_' + id, dataUrl); } catch (e) { }
    },
    get(id) {
        if (this._store[id]) return this._store[id];
        const v = localStorage.getItem('sf_img_' + id);
        if (v) this._store[id] = v;
        return v || null;
    },
    remove(id) {
        delete this._store[id];
        localStorage.removeItem('sf_img_' + id);
    },
    clear() {
        Object.keys(this._store).forEach(k => localStorage.removeItem('sf_img_' + k));
        this._store = {};
    }
};

const categories = ['All', 'Meat', 'Canned Goods', 'Beverages', 'Pantry', 'Snacks', 'Others'];

// ==========================================
// 2. BILLING / SUBSCRIPTION SYSTEM
// ==========================================
const PLANS = {
    free: {
        id: 'free',
        name: 'Free',
        icon: '🆓',
        monthlyPrice: 0,
        yearlyPrice: 0,
        productLimit: 20,
        userLimit: 1,
        features: ['Dashboard overview', 'Up to 20 products', 'POS & receipts', '1 user account'],
        locked: ['Sales analytics', 'Export CSV reports', 'Multi-user access', 'Custom store branding', 'Advanced reporting', 'Unlimited users', 'Multi-branch support', '24/7 dedicated support', 'Custom integrations']
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        icon: '⚡',
        monthlyPrice: 199,
        yearlyPrice: 1910,
        productLimit: Infinity,
        userLimit: 3,
        trialDays: 30,
        features: ['Everything in Free', 'Unlimited products', 'Full sales analytics', 'Export CSV reports', 'Up to 3 user accounts', 'Priority support'],
        locked: ['Custom store branding', 'Advanced reporting', 'Unlimited users', 'Multi-branch support', '24/7 dedicated support', 'Custom integrations']
    },
    business: {
        id: 'business',
        name: 'Business',
        icon: '🏢',
        monthlyPrice: 499,
        yearlyPrice: 4790,
        productLimit: Infinity,
        userLimit: Infinity,
        trialDays: 30,
        features: ['Everything in Pro', 'Custom store branding', 'Unlimited users', 'Advanced reporting', 'Multi-branch support', '24/7 dedicated support', 'Custom integrations'],
        locked: []
    }
};

function getBillingUserKey(user = null) {
    const resolvedUser = user || currentUser || localStorage.getItem('sf_current_user') || 'guest';
    return String(resolvedUser).trim().toLowerCase() || 'guest';
}

function getBillingStorageKey(user = null) {
    return `sf_billing_${getBillingUserKey(user)}`;
}

function loadBilling(user = null) {
    const storageKey = getBillingStorageKey(user);
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Validate required fields exist; reset if corrupt
            if (!parsed || typeof parsed.plan === 'undefined') throw new Error('corrupt');
            return parsed;
        }

        const billingUser = getBillingUserKey(user);
        const legacySaved = localStorage.getItem('sf_billing');
        if (billingUser === 'demo' && legacySaved) {
            const parsedLegacy = JSON.parse(legacySaved);
            if (!parsedLegacy || typeof parsedLegacy.plan === 'undefined') throw new Error('corrupt');
            localStorage.setItem(storageKey, JSON.stringify(parsedLegacy));
            return parsedLegacy;
        }
    } catch (e) {
        // Corrupt data — clear and fall through to default
        try { localStorage.removeItem(storageKey); } catch (_) { }
    }

    // Default: free plan
    const billing = {
        plan: 'free',
        billing: 'monthly',
        status: 'active',
        trialActive: false,
        trialEnds: null,
        subscriptionStart: null,
        subscriptionEnd: null,
        paymentMethod: null
    };
    try { localStorage.setItem(storageKey, JSON.stringify(billing)); } catch (_) { }
    return billing;
}

function saveBilling(billing, user = null) {
    try {
        localStorage.setItem(getBillingStorageKey(user), JSON.stringify(billing));
    } catch (e) {
        // Storage quota exceeded or unavailable
        showToast('Could not save billing info — storage may be full.', 'warning');
    }
}

function getBillingInfo() {
    return loadBilling();
}

function getCurrentPlan() {
    const b = loadBilling();
    return PLANS[b.plan] || PLANS.free;
}

function hasPaidPlanAccess() {
    const b = loadBilling();
    return b.plan !== 'free' && (b.status === 'active' || b.status === 'trial');
}

function hasBusinessPlanAccess() {
    const b = loadBilling();
    return b.plan === 'business' && (b.status === 'active' || b.status === 'trial');
}

function getEffectiveUserLimit() {
    const plan = getCurrentPlan();
    return Number.isFinite(plan.userLimit) ? plan.userLimit : Infinity;
}

function canAddMoreUsers() {
    return users.length < getEffectiveUserLimit();
}

function getSupportPlanDetails() {
    const billing = loadBilling();
    if (billing.plan === 'business' && (billing.status === 'active' || billing.status === 'trial')) {
        return {
            label: 'Business plan support',
            responseTime: '24/7 dedicated support',
            toastMessage: 'Your Business support request has been prioritized with dedicated 24/7 coverage.'
        };
    }
    if (billing.plan === 'pro' && (billing.status === 'active' || billing.status === 'trial')) {
        return {
            label: 'Pro plan support',
            responseTime: 'Priority support within 12 hours',
            toastMessage: 'Your Pro support request has been queued with priority handling.'
        };
    }
    return {
        label: 'Free plan support',
        responseTime: 'Standard support within 24 hours',
        toastMessage: 'Your support request has been queued with standard response handling.'
    };
}

function isTrialActive() {
    const b = loadBilling();
    if (!b.trialActive || !b.trialEnds) return false;
    return new Date() < new Date(b.trialEnds);
}

function getTrialDaysLeft() {
    const b = loadBilling();
    if (!b.trialActive || !b.trialEnds) return 0;
    const diff = new Date(b.trialEnds) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function startTrial(planId, billingCycle = 'monthly') {
    try {
        const plan = PLANS[planId];
        if (!plan) { showToast('Invalid plan selected.', 'error'); return null; }
        if (!plan.trialDays || plan.trialDays <= 0) { showToast('This plan does not include a trial.', 'warning'); return null; }

        const trialEnds = new Date();
        trialEnds.setDate(trialEnds.getDate() + plan.trialDays);

        const billing = {
            plan: planId,
            billing: billingCycle,
            status: 'trial',
            trialActive: true,
            trialEnds: trialEnds.toISOString(),
            subscriptionStart: new Date().toISOString(),
            subscriptionEnd: null,
            paymentMethod: null
        };
        saveBilling(billing);
        return billing;
    } catch (e) {
        showToast('Failed to start trial. Please try again.', 'error');
        return null;
    }
}

function activateSubscription(planId, billingCycle, paymentMethod) {
    try {
        const plan = PLANS[planId];
        if (!plan) { showToast('Invalid plan selected.', 'error'); return null; }

        const now = new Date();
        const subEnd = new Date(now);
        if (billingCycle === 'yearly') {
            subEnd.setFullYear(subEnd.getFullYear() + 1);
        } else {
            subEnd.setMonth(subEnd.getMonth() + 1);
        }

        const billing = {
            plan: planId,
            billing: billingCycle,
            status: 'active',
            trialActive: false,
            trialEnds: null,
            subscriptionStart: now.toISOString(),
            subscriptionEnd: subEnd.toISOString(),
            paymentMethod: paymentMethod || { type: 'demo', last4: '4242' }
        };
        saveBilling(billing);
        return billing;
    } catch (e) {
        showToast('Failed to activate subscription. Please try again.', 'error');
        return null;
    }
}

function cancelSubscription() {
    try {
        const billing = {
            plan: 'free',
            billing: 'monthly',
            status: 'active',
            trialActive: false,
            trialEnds: null,
            subscriptionStart: null,
            subscriptionEnd: null,
            paymentMethod: null
        };
        saveBilling(billing);
        return billing;
    } catch (e) {
        showToast('Failed to cancel subscription. Please try again.', 'error');
        return null;
    }
}

function canUseFeature(feature) {
    switch (feature) {
        case 'analytics':
            return hasPaidPlanAccess();
        case 'export':
            return hasPaidPlanAccess();
        case 'multi_user':
            return hasPaidPlanAccess();
        case 'unlimited_products':
            return hasPaidPlanAccess();
        case 'custom_branding':
            return hasBusinessPlanAccess();
        case 'advanced_reporting':
            return hasBusinessPlanAccess();
        case 'integrations':
            return hasBusinessPlanAccess();
        case 'dedicated_support':
            return hasBusinessPlanAccess();
        case 'priority_support':
            return hasPaidPlanAccess();
        default:
            return true;
    }
}

function checkProductLimit() {
    const plan = getCurrentPlan();
    const b = loadBilling();
    const isOnPaidPlan = (b.plan !== 'free') && (b.status === 'active' || b.status === 'trial');
    if (isOnPaidPlan) return true;
    return products.length < plan.productLimit;
}

// ==========================================
// BILLING UI
// ==========================================
function openBillingModal() {
    try {
        const b = loadBilling();
        const plan = getCurrentPlan();
        const trialLeft = getTrialDaysLeft();

        let headerHtml = '';
        if (b.status === 'trial' && trialLeft > 0) {
            headerHtml = `
            <div style="background:linear-gradient(135deg,#fbbf24,#f59e0b);color:white;padding:14px 20px;border-radius:10px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
                <span style="font-size:1.4rem;">🎁</span>
                <div>
                    <strong>Free Trial Active</strong>
                    <div style="font-size:0.85rem;opacity:0.9;">${trialLeft} day${trialLeft !== 1 ? 's' : ''} remaining on ${plan.name} plan</div>
                </div>
            </div>`;
        } else if (b.plan !== 'free' && b.status === 'active') {
            const subEnd = b.subscriptionEnd ? new Date(b.subscriptionEnd).toLocaleDateString() : 'N/A';
            headerHtml = `
            <div style="background:linear-gradient(135deg,#10b981,#059669);color:white;padding:14px 20px;border-radius:10px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
                <span style="font-size:1.4rem;">✅</span>
                <div>
                    <strong>${plan.name} Plan — Active</strong>
                    <div style="font-size:0.85rem;opacity:0.9;">Renews ${subEnd} · ${b.billing === 'yearly' ? 'Yearly' : 'Monthly'} billing</div>
                </div>
            </div>`;
        } else {
            headerHtml = `
            <div style="background:var(--light);border:1px solid var(--border);padding:14px 20px;border-radius:10px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
                <span style="font-size:1.4rem;">🆓</span>
                <div>
                    <strong>Free Plan</strong>
                    <div style="font-size:0.85rem;color:var(--secondary);">Up to 20 products · 1 user</div>
                </div>
            </div>`;
        }

        const plansHtml = Object.values(PLANS).map(p => {
            const isCurrent = b.plan === p.id;
            const price = b.billing === 'yearly' && p.yearlyPrice > 0
                ? `₱${p.yearlyPrice.toLocaleString()}/yr`
                : (p.monthlyPrice === 0 ? 'Free' : `₱${p.monthlyPrice}/mo`);

            const visibleFeatures = p.features.slice(0, 3);
            const hiddenFeatures = p.features.slice(3);
            const extraId = `billing-extra-${p.id}`;
            const toggleId = `billing-toggle-${p.id}`;

            const hiddenHtml = hiddenFeatures.length > 0 ? `
                <div id="${extraId}" style="overflow:hidden;max-height:0;transition:max-height 0.35s cubic-bezier(0.22,1,0.36,1);">
                    ${hiddenFeatures.map(f => `<li style="margin-bottom:4px;padding-left:2px;">✓ ${f}</li>`).join('')}
                </div>
                <li style="list-style:none;padding:0;margin-top:4px;">
                    <button id="${toggleId}" onclick="toggleBillingFeatures('${p.id}')"
                        style="background:none;border:none;color:var(--accent);font-size:0.8rem;font-weight:700;cursor:pointer;padding:2px 0;font-family:inherit;display:flex;align-items:center;gap:4px;transition:opacity 0.2s;">
                        <span id="billing-toggle-icon-${p.id}" style="display:inline-block;transition:transform 0.3s;">▾</span>
                        <span id="billing-toggle-text-${p.id}">+${hiddenFeatures.length} more</span>
                    </button>
                </li>` : '';

            return `
            <div style="border:2px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'};border-radius:12px;padding:18px;flex:1;min-width:0;background:${isCurrent ? 'rgba(59,130,246,0.04)' : 'var(--white)'};display:flex;flex-direction:column;">
                <div style="font-size:1.4rem;margin-bottom:6px;">${p.icon}</div>
                <div style="font-weight:700;font-size:1rem;color:var(--primary);">${p.name}</div>
                <div style="font-weight:800;font-size:1.2rem;color:var(--accent);margin:6px 0;">${price}</div>
                ${isCurrent ? `<span style="background:var(--accent);color:white;font-size:0.7rem;font-weight:700;padding:3px 10px;border-radius:20px;display:inline-block;margin-bottom:8px;">CURRENT</span>` : ''}
                <ul style="list-style:none;padding:0;margin:8px 0 12px;font-size:0.82rem;color:var(--secondary);flex:1;">
                    ${visibleFeatures.map(f => `<li style="margin-bottom:4px;">✓ ${f}</li>`).join('')}
                    ${hiddenHtml}
                </ul>
                <div style="margin-top:auto;">
                ${!isCurrent
                    ? `<button onclick="handlePlanSelect('${p.id}')" style="width:100%;padding:9px;border:1.5px solid var(--accent);background:${p.id === 'pro' ? 'var(--accent)' : 'transparent'};color:${p.id === 'pro' ? 'white' : 'var(--accent)'};border-radius:8px;cursor:pointer;font-weight:600;font-size:0.85rem;font-family:inherit;transition:all 0.2s;">
                        ${p.monthlyPrice === 0 ? 'Downgrade to Free' : (p.trialDays ? `Start ${p.trialDays}-Day Trial` : 'Upgrade')}
                    </button>`
                    : (b.plan !== 'free'
                        ? `<button onclick="handleCancelSubscription()" style="width:100%;padding:9px;border:1.5px solid var(--danger);background:transparent;color:var(--danger);border-radius:8px;cursor:pointer;font-weight:600;font-size:0.85rem;font-family:inherit;">Cancel Plan</button>`
                        : '')}
                </div>
            </div>`;
        }).join('');

        const billingToggleHtml = `
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:18px;">
            <span style="font-size:0.88rem;font-weight:${b.billing !== 'yearly' ? '700' : '500'};color:var(--primary);">Monthly</span>
            <div onclick="toggleBillingCycle()" style="width:46px;height:24px;background:${b.billing === 'yearly' ? 'var(--accent)' : '#cbd5e1'};border-radius:12px;position:relative;cursor:pointer;transition:background 0.3s;">
                <div style="position:absolute;top:3px;left:${b.billing === 'yearly' ? '23px' : '3px'};width:18px;height:18px;background:white;border-radius:50%;transition:left 0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
            </div>
            <span style="font-size:0.88rem;font-weight:${b.billing === 'yearly' ? '700' : '500'};color:var(--primary);">Yearly <span style="background:#dcfce7;color:#16a34a;font-size:0.7rem;font-weight:700;padding:1px 7px;border-radius:20px;">Save 20%</span></span>
        </div>`;

        const paymentFooter = b.paymentMethod
            ? `<div style="margin-top:16px;padding:12px 16px;background:var(--light);border:1px solid var(--border);border-radius:8px;font-size:0.85rem;color:var(--secondary);display:flex;align-items:center;gap:10px;"><span>💳</span><span>Payment method on file: •••• ${b.paymentMethod.last4 || '4242'}</span></div>`
            : '';

        const bodyEl = document.getElementById('billing-modal-body');
        if (!bodyEl) { console.error('billing-modal-body element not found'); return; }
        bodyEl.innerHTML = headerHtml + billingToggleHtml + `<div style="display:flex;gap:12px;align-items:stretch;">${plansHtml}</div>` + paymentFooter;

        const modalEl = document.getElementById('billing-modal');
        if (!modalEl) { console.error('billing-modal element not found'); return; }
        modalEl.style.display = 'flex';

    } catch (e) {
        console.error('openBillingModal error:', e);
        showToast('Could not open billing panel. Please try again.', 'error');
    }
}

function closeBillingModal() {
    document.getElementById('billing-modal').style.display = 'none';
}

function toggleBillingCycle() {
    const b = loadBilling();
    b.billing = b.billing === 'yearly' ? 'monthly' : 'yearly';
    saveBilling(b);
    openBillingModal(); // re-render
}

function toggleBillingFeatures(planId) {
    const extra = document.getElementById(`billing-extra-${planId}`);
    const icon = document.getElementById(`billing-toggle-icon-${planId}`);
    const text = document.getElementById(`billing-toggle-text-${planId}`);
    if (!extra) return;

    const isOpen = extra.style.maxHeight && extra.style.maxHeight !== '0px';
    const plan = PLANS[planId];
    const hiddenCount = plan ? plan.features.length - 3 : 0;

    if (isOpen) {
        extra.style.maxHeight = '0px';
        icon.style.transform = 'rotate(0deg)';
        text.textContent = `+${hiddenCount} more`;
    } else {
        extra.style.maxHeight = extra.scrollHeight + 'px';
        icon.style.transform = 'rotate(180deg)';
        text.textContent = 'Show less';
    }
}

async function handlePlanSelect(planId) {
    try {
        const plan = PLANS[planId];
        if (!plan) { showToast('Invalid plan selected.', 'error'); return; }

        if (planId === 'free') {
            const ok = await showConfirm(
                'Downgrade to Free?',
                'You will lose access to Pro/Business features immediately. Are you sure?',
                'Downgrade', 'btn-danger'
            );
            if (!ok) return;
            cancelSubscription();
            closeBillingModal();
            showToast('Downgraded to Free plan.', 'info');
            updateBillingBadge();
            loadSettings();
            renderAnalytics();
            return;
        }

        // Show demo payment modal
        showPaymentModal(planId);
    } catch (e) {
        console.error('handlePlanSelect error:', e);
        showToast('Something went wrong. Please try again.', 'error');
    }
}

async function handleCancelSubscription() {
    try {
        const ok = await showConfirm(
            'Cancel Subscription?',
            'You will be moved to the Free plan immediately and lose access to premium features.',
            'Cancel Subscription', 'btn-danger'
        );
        if (!ok) return;
        cancelSubscription();
        closeBillingModal();
        showToast('Subscription cancelled. You\'re now on the Free plan.', 'info');
        updateBillingBadge();
        loadSettings();
        renderAnalytics();
    } catch (e) {
        console.error('handleCancelSubscription error:', e);
        showToast('Failed to cancel subscription. Please try again.', 'error');
    }
}

function showPaymentModal(planId) {
    try {
        const plan = PLANS[planId];
        if (!plan) { showToast('Invalid plan selected.', 'error'); return; }

        const b = loadBilling();
        const price = b.billing === 'yearly'
            ? `₱${plan.yearlyPrice.toLocaleString()}/year`
            : `₱${plan.monthlyPrice}/month`;

        const bodyEl = document.getElementById('payment-modal-body');
        if (!bodyEl) { console.error('payment-modal-body element not found'); return; }

        bodyEl.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:2rem;margin-bottom:8px;">${plan.icon}</div>
            <h3 style="margin:0 0 4px;font-size:1.1rem;color:var(--primary);">${plan.name} Plan</h3>
            <div style="color:var(--accent);font-weight:800;font-size:1.3rem;">${price}</div>
            ${plan.trialDays ? `<div style="font-size:0.82rem;color:var(--secondary);margin-top:4px;">🎁 ${plan.trialDays}-day free trial · No charge until trial ends</div>` : ''}
        </div>

        <div style="background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.15);border-radius:10px;padding:14px;margin-bottom:18px;">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--secondary);margin-bottom:8px;">Demo Mode</div>
            <div style="font-size:0.85rem;color:var(--secondary);">This is a demo. No real payment will be processed. Use any card number below to simulate checkout.</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:12px;">
            <div>
                <label style="font-size:0.75rem;font-weight:600;color:var(--secondary);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:5px;">Card Number</label>
                <input id="demo-card-num" class="search-bar" value="4242 4242 4242 4242" style="font-family:monospace;" maxlength="19" oninput="formatCardNumber(this)">
            </div>
            <div style="display:flex;gap:12px;">
                <div style="flex:1;">
                    <label style="font-size:0.75rem;font-weight:600;color:var(--secondary);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:5px;">Expiry</label>
                    <input id="demo-card-exp" class="search-bar" placeholder="MM/YY" maxlength="5" oninput="formatExpiry(this)">
                </div>
                <div style="flex:1;">
                    <label style="font-size:0.75rem;font-weight:600;color:var(--secondary);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:5px;">CVC</label>
                    <input id="demo-card-cvc" class="search-bar" placeholder="123" maxlength="3" type="password">
                </div>
            </div>
            <div>
                <label style="font-size:0.75rem;font-weight:600;color:var(--secondary);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:5px;">Cardholder Name</label>
                <input id="demo-card-name" class="search-bar" placeholder="Juan Dela Cruz">
            </div>
        </div>

        <div style="margin-top:20px;display:flex;gap:10px;">
            <button onclick="closePaymentModal()" class="btn btn-secondary flex-1">Cancel</button>
            <button onclick="processPayment('${planId}')" class="btn btn-primary flex-1" id="pay-btn">
                ${plan.trialDays ? `Start Free Trial →` : `Subscribe Now →`}
            </button>
        </div>
        <div style="text-align:center;margin-top:12px;font-size:0.75rem;color:var(--secondary);">🔒 Secured with 256-bit SSL encryption</div>
        `;

        const modalEl = document.getElementById('payment-modal');
        if (!modalEl) { console.error('payment-modal element not found'); return; }
        modalEl.style.display = 'flex';

    } catch (e) {
        console.error('showPaymentModal error:', e);
        showToast('Could not open payment panel. Please try again.', 'error');
    }
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
}

function formatCardNumber(el) {
    let v = el.value.replace(/\D/g, '').substring(0, 16);
    el.value = v.match(/.{1,4}/g)?.join(' ') || v;
}

function formatExpiry(el) {
    let v = el.value.replace(/\D/g, '').substring(0, 4);
    if (v.length >= 2) v = v.substring(0, 2) + '/' + v.substring(2);
    el.value = v;
}

async function processPayment(planId) {
    try {
        const plan = PLANS[planId];
        if (!plan) { showToast('Invalid plan. Please try again.', 'error'); return; }

        const cardNum = (document.getElementById('demo-card-num')?.value || '').replace(/\s/g, '');
        const expiry = document.getElementById('demo-card-exp')?.value || '';
        const cvc = document.getElementById('demo-card-cvc')?.value || '';
        const name = document.getElementById('demo-card-name')?.value.trim() || '';

        if (cardNum.length < 12 || !expiry.includes('/') || cvc.length < 3 || !name) {
            showToast('Please fill in all payment details.', 'warning');
            return;
        }

        const btn = document.getElementById('pay-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Processing...';
        }

        // Simulate processing delay
        await new Promise(r => setTimeout(r, 1800));

        const b = loadBilling();
        const last4 = cardNum.slice(-4);
        const paymentMethod = { type: 'card', last4, name };

        if (plan.trialDays) {
            const result = startTrial(planId, b.billing);
            if (!result) return; // startTrial already showed error toast
            // Attach payment method to the trial record
            const updated = loadBilling();
            updated.paymentMethod = paymentMethod;
            saveBilling(updated);
        } else {
            const result = activateSubscription(planId, b.billing, paymentMethod);
            if (!result) return;
        }

        closePaymentModal();
        closeBillingModal();
        updateBillingBadge();
        loadSettings();
        renderAnalytics();

        showToast(
            plan.trialDays
                ? `🎉 ${plan.trialDays}-day free trial started! Enjoy ${plan.name} features.`
                : `🎉 Welcome to ${plan.name}! Your subscription is active.`,
            'success', 5000
        );

        // Re-render analytics if visible
        const analyticsSection = document.getElementById('analytics');
        if (analyticsSection && analyticsSection.classList.contains('active')) renderAnalytics();

    } catch (e) {
        console.error('processPayment error:', e);
        const btn = document.getElementById('pay-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Try Again'; }
        showToast('Payment processing failed. Please try again.', 'error');
    }
}

function updateBillingBadge() {
    const b = loadBilling();
    const plan = getCurrentPlan();
    const badge = document.getElementById('billing-badge');
    if (!badge) return;

    const trialLeft = getTrialDaysLeft();
    if (b.status === 'trial' && trialLeft > 0) {
        badge.textContent = `Trial: ${trialLeft}d`;
        badge.style.background = '#f59e0b';
    } else if (b.plan !== 'free') {
        badge.textContent = plan.name;
        badge.style.background = 'var(--accent)';
    } else {
        badge.textContent = 'Free';
        badge.style.background = '#94a3b8';
    }
}

// ==========================================
// 3. LOCAL STORAGE MANAGEMENT
// ==========================================
function loadData() {
    const savedProducts = localStorage.getItem('sf_products');
    let parsed = savedProducts ? JSON.parse(savedProducts) : [];
    const hasEmoji = parsed.some(p => p.img && !p.img.startsWith('http') && !p.img.startsWith('data:'));
    products = hasEmoji ? [] : parsed;
    if (hasEmoji) { localStorage.removeItem('sf_products'); productImages.clear(); }

    dailyTotal = parseFloat(localStorage.getItem('sf_total')) || 0;
    transCount = parseInt(localStorage.getItem('sf_count')) || 0;

    const savedHistory = localStorage.getItem('sf_history');
    salesHistory = savedHistory ? JSON.parse(savedHistory) : [];

    const savedCatSales = localStorage.getItem('sf_catSales');
    if (savedCatSales) categorySales = JSON.parse(savedCatSales);

    const savedUsers = localStorage.getItem('sf_users');
    users = savedUsers ? JSON.parse(savedUsers) : [];
    const demoExists = users.find(u => u.username.toLowerCase() === 'demo');
    if (!demoExists) users.push({ username: 'demo', password: 'demo123', role: 'admin', active: true, created: 'Built-in' });

    currentUser = localStorage.getItem('sf_current_user') || null;

    // Auto-grant demo account a Pro plan on first load so all features are accessible
    const existingBilling = localStorage.getItem(getBillingStorageKey('demo'));
    if (!existingBilling) {
        try {
            const demoBilling = {
                plan: 'pro',
                billing: 'monthly',
                status: 'active',
                trialActive: false,
                trialEnds: null,
                subscriptionStart: new Date().toISOString(),
                subscriptionEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
                paymentMethod: { type: 'demo', last4: '4242' }
            };
            localStorage.setItem(getBillingStorageKey('demo'), JSON.stringify(demoBilling));
        } catch (e) { /* storage unavailable — fail silently */ }
    }
}

function saveData() {
    localStorage.setItem('sf_products', JSON.stringify(products));
    localStorage.setItem('sf_total', dailyTotal);
    localStorage.setItem('sf_count', transCount);
    localStorage.setItem('sf_history', JSON.stringify(salesHistory));
    localStorage.setItem('sf_catSales', JSON.stringify(categorySales));
    localStorage.setItem('sf_users', JSON.stringify(users));
    if (currentUser) localStorage.setItem('sf_current_user', currentUser);
}

// ==========================================
// 4. TOAST NOTIFICATION SYSTEM
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
// 5. CUSTOM CONFIRM MODAL
// ==========================================
let confirmResolve = null;

function showConfirm(title, message, okLabel = 'Confirm', okClass = 'btn-danger') {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.textContent = okLabel;
    okBtn.className = `btn flex-1 ${okClass}`;
    document.getElementById('confirm-modal').style.display = 'flex';
    return new Promise(resolve => { confirmResolve = resolve; });
}

function resolveConfirm(result) {
    document.getElementById('confirm-modal').style.display = 'none';
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

// ==========================================
// 6. RESTOCK MODAL
// ==========================================
let restockTargetId = null;

function restockItem(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    restockTargetId = id;

    // FIX: removed product.img reference (field no longer exists)
    document.getElementById('restock-product-name').textContent = `Restock: ${product.name}`;
    document.getElementById('restock-qty-input').type = 'number';
    document.getElementById('restock-qty-input').step = '1';
    document.getElementById('restock-qty-input').placeholder = 'Quantity (e.g. 50)';
    document.getElementById('restock-qty-input').value = '';
    document.getElementById('restock-error').textContent = 'Please enter a valid quantity.';
    document.getElementById('restock-error').classList.add('hidden');

    const confirmBtn = document.querySelector('#restock-modal .btn-success');
    confirmBtn.textContent = 'Add Stock';
    confirmBtn.onclick = confirmRestock;

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
    if (!product) return;
    product.stock += qty;
    saveData();
    renderInventory();
    renderProducts();
    updateDashboardUI();
    closeRestockModal();
    showToast(`Added ${qty} units to ${product.name}.`, 'success');
}

// ==========================================
// 6b. EDIT PRICE
// ==========================================
function editPrice(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    restockTargetId = id;

    // FIX: removed product.img reference
    document.getElementById('restock-product-name').textContent = `Edit Price: ${product.name}`;
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
    setTimeout(() => { qtyInput.focus(); qtyInput.select(); }, 100);
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
// 7. AUTHENTICATION & NAVIGATION
// ==========================================

// — OTP / Auth State —
let pendingOTP = null;
let otpExpiry = null;
let otpType = null; // 'signup' | 'forgot'
let pendingSignupData = null;
let forgotResetTarget = null;
let otpTimerInterval = null;
let loginAttempts = {}; // { identifier: { count, lockedUntil } }

const AUTH_STEPS = {
    login: { title: 'Welcome Back', subtitle: 'Sign in to your StockFlow account' },
    signup: { title: 'Create Account', subtitle: 'Join StockFlow — it\'s free to start' },
    otp: { title: 'Verify Your Email', subtitle: 'Check the preview below for your code' },
    forgot: { title: 'Reset Password', subtitle: 'We\'ll send a code to your email' },
    'forgot-otp': { title: 'Enter Reset Code', subtitle: 'Check the preview below for your code' },
    'new-password': { title: 'New Password', subtitle: 'Make it strong and memorable' }
};

function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
    showAuthStep('login');
    setTimeout(() => document.getElementById('login-identifier').focus(), 150);
}

function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
    // Clean up OTP timers
    if (otpTimerInterval) { clearInterval(otpTimerInterval); otpTimerInterval = null; }
}

function showAuthStep(step) {
    const steps = ['login-form', 'signup-form', 'otp-form', 'forgot-form', 'forgot-otp-form', 'new-password-form'];
    steps.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.add('hidden');
    });
    // Derive element ID from step name
    const formId = step + '-form';
    const el = document.getElementById(formId);
    if (el) el.classList.remove('hidden');

    const meta = AUTH_STEPS[step] || { title: 'StockFlow', subtitle: '' };
    const titleEl = document.getElementById('auth-title');
    const subtitleEl = document.getElementById('auth-subtitle');
    if (titleEl) titleEl.textContent = meta.title;
    if (subtitleEl) subtitleEl.textContent = meta.subtitle;

    // Auto-focus first input
    setTimeout(() => {
        const focusTargets = {
            login: 'login-identifier',
            signup: 'signup-user',
            forgot: 'forgot-email',
            'new-password': 'new-pass-1'
        };
        const targetId = focusTargets[step];
        if (targetId) {
            const el = document.getElementById(targetId);
            if (el) el.focus();
        }
    }, 100);
}

function toggleAuthMode(mode) {
    // Clear all error states
    ['login-error', 'login-lockout', 'signup-error', 'otp-error', 'forgot-error', 'forgot-otp-error', 'new-pass-error']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    showAuthStep(mode);
}

// — Password Visibility Toggle —
function togglePassVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁';
}

// — Password Strength —
function measurePasswordStrength(pass) {
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score; // 0–5
}

function updatePasswordStrength(pass) {
    const fill = document.getElementById('pass-strength-fill');
    const label = document.getElementById('pass-strength-label');
    if (!fill || !label) return;
    const score = measurePasswordStrength(pass);
    const levels = [
        { pct: 0, color: 'transparent', text: '' },
        { pct: 20, color: '#ef4444', text: 'Very Weak' },
        { pct: 40, color: '#f97316', text: 'Weak' },
        { pct: 60, color: '#f59e0b', text: 'Fair' },
        { pct: 80, color: '#84cc16', text: 'Strong' },
        { pct: 100, color: '#10b981', text: 'Very Strong' }
    ];
    const lvl = levels[score] || levels[0];
    fill.style.width = lvl.pct + '%';
    fill.style.background = lvl.color;
    label.textContent = lvl.text;
    label.style.color = lvl.color;
}

// — OTP System —
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function startOTPTimer(timerElementId, onExpire) {
    if (otpTimerInterval) clearInterval(otpTimerInterval);
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    otpExpiry = expiry;

    function tick() {
        const diff = Math.max(0, Math.floor((expiry - new Date()) / 1000));
        const mins = Math.floor(diff / 60).toString().padStart(2, '0');
        const secs = (diff % 60).toString().padStart(2, '0');
        const el = document.getElementById(timerElementId);
        if (el) {
            el.textContent = `${mins}:${secs}`;
            el.style.color = diff <= 60 ? 'var(--danger)' : '';
        }
        if (diff <= 0) {
            clearInterval(otpTimerInterval);
            otpTimerInterval = null;
            if (onExpire) onExpire();
        }
    }
    tick();
    otpTimerInterval = setInterval(tick, 1000);
}

function setupOTPInputs() {
    // Handle both signup and forgot-password OTP digit sets
    const groups = [
        { selector: '.otp-digit:not(.forgot-digit)', verifyFn: () => verifyOTP() },
        { selector: '.forgot-digit', verifyFn: () => verifyForgotOTP() }
    ];

    groups.forEach(({ selector, verifyFn }) => {
        const inputs = Array.from(document.querySelectorAll(selector));
        inputs.forEach((input, idx) => {
            // Remove old listeners by cloning
            const fresh = input.cloneNode(true);
            input.parentNode.replaceChild(fresh, input);
            inputs[idx] = fresh;
        });

        // Re-select after clone
        const refreshed = Array.from(document.querySelectorAll(selector));
        refreshed.forEach((input, idx) => {
            input.addEventListener('input', () => {
                input.value = input.value.replace(/\D/g, '').slice(-1);
                if (input.value && idx < refreshed.length - 1) refreshed[idx + 1].focus();
                // Auto-submit when all filled
                const allFilled = refreshed.every(i => i.value.length === 1);
                if (allFilled) setTimeout(verifyFn, 120);
            });
            input.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !input.value && idx > 0) {
                    refreshed[idx - 1].focus();
                    refreshed[idx - 1].value = '';
                }
                if (e.key === 'Enter') verifyFn();
            });
            input.addEventListener('paste', e => {
                const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
                refreshed.forEach((inp, i) => { inp.value = paste[i] || ''; });
                const last = Math.min(paste.length, refreshed.length) - 1;
                if (last >= 0) refreshed[last].focus();
                e.preventDefault();
            });
        });
    });
}

function getOTPValue(isForgot = false) {
    const sel = isForgot ? '.forgot-digit' : '.otp-digit:not(.forgot-digit)';
    return Array.from(document.querySelectorAll(sel)).map(i => i.value).join('');
}

function clearOTPInputs(isForgot = false) {
    const sel = isForgot ? '.forgot-digit' : '.otp-digit:not(.forgot-digit)';
    document.querySelectorAll(sel).forEach(i => { i.value = ''; i.style.borderColor = ''; });
}

function shakeOTPInputs(isForgot = false) {
    const sel = isForgot ? '.forgot-digit' : '.otp-digit:not(.forgot-digit)';
    document.querySelectorAll(sel).forEach(inp => {
        inp.style.borderColor = 'var(--danger)';
        inp.style.background = 'rgba(239,68,68,0.06)';
        inp.animate([
            { transform: 'translateX(-4px)' },
            { transform: 'translateX(4px)' },
            { transform: 'translateX(-3px)' },
            { transform: 'translateX(3px)' },
            { transform: 'translateX(0)' }
        ], { duration: 350, easing: 'ease-in-out' });
        setTimeout(() => { inp.style.borderColor = ''; inp.style.background = ''; }, 1400);
    });
}

// — SIGN UP —
function handleSignup(event) {
    event.preventDefault();
    const username = document.getElementById('signup-user').value.trim();
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-pass').value;
    const errEl = document.getElementById('signup-error');

    errEl.classList.add('hidden');
    errEl.textContent = '';

    // Username validation
    if (username.length < 3) {
        errEl.textContent = 'Username must be at least 3 characters.';
        return errEl.classList.remove('hidden');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        errEl.textContent = 'Username can only contain letters, numbers, and underscores.';
        return errEl.classList.remove('hidden');
    }
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        errEl.textContent = 'That username is already taken. Please choose another.';
        return errEl.classList.remove('hidden');
    }

    // Email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'Please enter a valid email address.';
        return errEl.classList.remove('hidden');
    }
    if (users.find(u => u.email && u.email.toLowerCase() === email)) {
        errEl.textContent = 'An account with this email already exists. Try logging in.';
        return errEl.classList.remove('hidden');
    }

    // Password validation
    if (password.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters long.';
        return errEl.classList.remove('hidden');
    }

    // Store pending data & generate OTP
    pendingSignupData = { username, email, password };
    pendingOTP = generateOTP();
    otpType = 'signup';

    // Show OTP step
    showAuthStep('otp');
    document.getElementById('otp-email-to').textContent = email;
    document.getElementById('otp-display-code').textContent = pendingOTP;
    clearOTPInputs(false);
    document.getElementById('otp-error').classList.add('hidden');
    document.getElementById('otp-resend-btn').disabled = false;
    document.getElementById('otp-resend-btn').textContent = 'Resend Code';

    startOTPTimer('otp-timer', () => {
        showToast('Verification code expired. Request a new one.', 'warning');
    });

    setupOTPInputs();
    setTimeout(() => {
        const first = document.querySelector('.otp-digit:not(.forgot-digit)');
        if (first) first.focus();
    }, 200);
}

function verifyOTP() {
    const entered = getOTPValue(false);
    const errEl = document.getElementById('otp-error');
    errEl.classList.add('hidden');

    if (entered.length < 6) {
        errEl.textContent = 'Please enter all 6 digits.';
        return errEl.classList.remove('hidden');
    }
    if (!pendingOTP || (otpExpiry && new Date() > otpExpiry)) {
        errEl.textContent = 'This code has expired. Please request a new one.';
        return errEl.classList.remove('hidden');
    }
    if (entered !== pendingOTP) {
        errEl.textContent = 'Incorrect code. Please check and try again.';
        errEl.classList.remove('hidden');
        shakeOTPInputs(false);
        clearOTPInputs(false);
        setTimeout(() => {
            const first = document.querySelector('.otp-digit:not(.forgot-digit)');
            if (first) first.focus();
        }, 100);
        return;
    }

    // ✅ OTP correct — complete signup
    if (otpType === 'signup' && pendingSignupData) {
        const { username, email, password } = pendingSignupData;
        users.push({
            username, email, password,
            role: 'manager', active: true,
            created: new Date().toLocaleDateString(),
            emailVerified: true
        });
        currentUser = username;
        saveData();
        localStorage.setItem('sf_logged_in', 'true');
        localStorage.setItem('sf_current_user', currentUser);

        if (otpTimerInterval) { clearInterval(otpTimerInterval); otpTimerInterval = null; }
        pendingOTP = null; pendingSignupData = null;

        closeLoginModal();
        unlockSystem();
        showToast(`🎉 Welcome to StockFlow, ${username}! Email verified.`, 'success', 5000);
    }
}

function resendOTP() {
    if (!pendingSignupData) return;

    const btn = document.getElementById('otp-resend-btn');
    btn.disabled = true;

    pendingOTP = generateOTP();
    document.getElementById('otp-display-code').textContent = pendingOTP;
    document.getElementById('otp-error').classList.add('hidden');
    clearOTPInputs(false);
    startOTPTimer('otp-timer', () => showToast('Verification code expired.', 'warning'));
    showToast('New verification code generated!', 'info');

    let cd = 30;
    btn.textContent = `Resend in ${cd}s`;
    const iv = setInterval(() => {
        cd--;
        btn.textContent = cd > 0 ? `Resend in ${cd}s` : 'Resend Code';
        if (cd <= 0) { clearInterval(iv); btn.disabled = false; }
    }, 1000);

    setTimeout(() => {
        const first = document.querySelector('.otp-digit:not(.forgot-digit)');
        if (first) first.focus();
    }, 100);
}

// — FORGOT PASSWORD —
async function sendForgotOTP() {
    const email = document.getElementById('forgot-email').value.trim().toLowerCase();
    const errEl = document.getElementById('forgot-error');
    const btn = document.getElementById('forgot-send-btn');
    errEl.classList.add('hidden');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'Please enter a valid email address.';
        return errEl.classList.remove('hidden');
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';
    await new Promise(r => setTimeout(r, 700));

    const found = users.find(u => u.email && u.email.toLowerCase() === email);
    if (!found) {
        errEl.textContent = 'No account found with that email address.';
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Send Reset Code →';
        return;
    }
    if (found.active === false) {
        errEl.textContent = 'This account has been deactivated. Contact your administrator.';
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Send Reset Code →';
        return;
    }
    if (found.username.toLowerCase() === 'demo') {
        errEl.textContent = 'The demo account password cannot be reset this way.';
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Send Reset Code →';
        return;
    }

    forgotResetTarget = found.username;
    pendingOTP = generateOTP();
    otpType = 'forgot';

    showAuthStep('forgot-otp');
    document.getElementById('forgot-otp-email-to').textContent = email;
    document.getElementById('forgot-otp-display-code').textContent = pendingOTP;
    clearOTPInputs(true);
    document.getElementById('forgot-otp-error').classList.add('hidden');

    startOTPTimer('forgot-otp-timer', () => {
        showToast('Reset code expired. Please start over.', 'warning');
    });

    setupOTPInputs();
    btn.disabled = false;
    btn.textContent = 'Send Reset Code →';
    setTimeout(() => {
        const first = document.querySelector('.forgot-digit');
        if (first) first.focus();
    }, 200);
}

function verifyForgotOTP() {
    const entered = getOTPValue(true);
    const errEl = document.getElementById('forgot-otp-error');
    errEl.classList.add('hidden');

    if (entered.length < 6) {
        errEl.textContent = 'Please enter all 6 digits.';
        return errEl.classList.remove('hidden');
    }
    if (!pendingOTP || (otpExpiry && new Date() > otpExpiry)) {
        errEl.textContent = 'This code has expired. Please start over.';
        return errEl.classList.remove('hidden');
    }
    if (entered !== pendingOTP) {
        errEl.textContent = 'Incorrect code. Please try again.';
        errEl.classList.remove('hidden');
        shakeOTPInputs(true);
        clearOTPInputs(true);
        setTimeout(() => {
            const first = document.querySelector('.forgot-digit');
            if (first) first.focus();
        }, 100);
        return;
    }

    if (otpTimerInterval) { clearInterval(otpTimerInterval); otpTimerInterval = null; }
    pendingOTP = null;

    showAuthStep('new-password');
    // Setup strength meter
    const passInput = document.getElementById('new-pass-1');
    if (passInput) {
        passInput.addEventListener('input', () => updatePasswordStrength(passInput.value));
    }
}

function confirmNewPassword() {
    const p1 = document.getElementById('new-pass-1').value;
    const p2 = document.getElementById('new-pass-2').value;
    const errEl = document.getElementById('new-pass-error');
    errEl.classList.add('hidden');

    if (p1.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        return errEl.classList.remove('hidden');
    }
    if (p1 !== p2) {
        errEl.textContent = 'Passwords do not match. Please re-enter.';
        return errEl.classList.remove('hidden');
    }
    if (!forgotResetTarget) {
        errEl.textContent = 'Session expired. Please start the reset flow again.';
        return errEl.classList.remove('hidden');
    }
    if (measurePasswordStrength(p1) < 2) {
        errEl.textContent = 'Password is too weak. Add uppercase letters or numbers.';
        return errEl.classList.remove('hidden');
    }

    const user = users.find(u => u.username === forgotResetTarget);
    if (!user) {
        errEl.textContent = 'User not found. Please try again.';
        return errEl.classList.remove('hidden');
    }

    user.password = p1;
    saveData();
    forgotResetTarget = null;
    closeLoginModal();
    showToast('Password reset successfully! You can now log in.', 'success', 5000);
    setTimeout(() => showLoginModal(), 300);
}

// — LOGIN —
function handleLogin(event) {
    event.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const pass = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');
    const lockEl = document.getElementById('login-lockout');
    errEl.classList.add('hidden');
    lockEl.classList.add('hidden');

    // Rate limiting
    const key = identifier.toLowerCase();
    if (!loginAttempts[key]) loginAttempts[key] = { count: 0, lockedUntil: null };
    const attempt = loginAttempts[key];

    if (attempt.lockedUntil && new Date() < new Date(attempt.lockedUntil)) {
        const mins = Math.max(1, Math.ceil((new Date(attempt.lockedUntil) - new Date()) / 60000));
        lockEl.innerHTML = `🔒 Too many failed attempts. Account locked for <strong>${mins} minute${mins !== 1 ? 's' : ''}</strong>.<br><small style="opacity:0.8;">Contact your admin if you're locked out.</small>`;
        lockEl.classList.remove('hidden');
        return;
    }

    // Find by email OR username
    const found = users.find(u =>
        (u.email && u.email.toLowerCase() === identifier.toLowerCase()) ||
        u.username.toLowerCase() === identifier.toLowerCase()
    );

    if (found && found.password === pass) {
        if (found.active === false) {
            errEl.textContent = 'This account has been deactivated. Contact your administrator.';
            return errEl.classList.remove('hidden');
        }

        // Clear rate limit on success
        delete loginAttempts[key];

        currentUser = found.username;
        localStorage.setItem('sf_logged_in', 'true');
        localStorage.setItem('sf_current_user', currentUser);
        closeLoginModal();
        unlockSystem();
        event.target.reset();
        showToast(`Welcome back, ${currentUser}! 👋`, 'success');
    } else {
        attempt.count++;
        const remaining = Math.max(0, 5 - attempt.count);

        if (attempt.count >= 5) {
            const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
            attempt.lockedUntil = lockUntil.toISOString();
            lockEl.innerHTML = `🔒 Too many failed attempts. Account locked for <strong>15 minutes</strong>.<br><small style="opacity:0.8;">Try again later or contact your admin.</small>`;
            lockEl.classList.remove('hidden');
        } else {
            errEl.textContent = remaining > 0
                ? `Incorrect email/username or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`
                : 'Incorrect email/username or password.';
            errEl.classList.remove('hidden');
        }

        document.getElementById('login-pass').value = '';
        document.getElementById('login-pass').focus();
    }
}

function unlockSystem() {
    setUserDisplay();
    applyRoleRestrictions();
    updateBillingBadge();
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
    document.getElementById('sidebar-avatar').textContent = currentUser.charAt(0).toUpperCase();

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

// FIX: renamed alias so updateSettingsOverlay() works — it was calling getCurrentUserRole() which didn't exist
function getCurrentUserRole() {
    return getUserRole();
}

function applyRoleRestrictions() {
    const role = getUserRole();
    const navUsers = document.getElementById('nav-users');
    if (navUsers) {
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
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen = sidebar.classList.toggle('open');
    overlay.classList.toggle('active', isOpen);
}

function showPage(pageId, element) {
    if (pageId === 'users') {
        const role = getUserRole();
        if (role !== 'admin' && role !== 'manager') {
            showToast('Access denied. Only Admins and Managers can manage users.', 'error');
            return;
        }
    }

    // FIX: gate analytics behind subscription
    if (pageId === 'analytics' && !canUseFeature('analytics')) {
        showUpgradePrompt('Sales Analytics');
        return;
    }

    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(pageId).classList.add('active');
    if (element) element.classList.add('active');

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
        const userSearch = document.getElementById('user-search');
        const userFilter = document.getElementById('user-role-filter');
        if (userSearch) userSearch.value = '';
        if (userFilter) userFilter.value = 'all';
        renderUsers();
    }
    if (pageId === 'analytics') renderAnalytics();
    if (pageId === 'settings') loadSettings();
}

function showUpgradePrompt(featureName) {
    showConfirm(
        `🔒 ${featureName} — Pro Feature`,
        `${featureName} is available on the Pro and Business plans. Upgrade to unlock this feature and many more!`,
        'View Plans', 'btn-primary'
    ).then(ok => { if (ok) openBillingModal(); });
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
        if (document.getElementById('user-settings-overlay').style.display === 'flex') closeUserSettings();
        if (document.getElementById('billing-modal').style.display === 'flex') closeBillingModal();
        if (document.getElementById('payment-modal').style.display === 'flex') closePaymentModal();
        if (document.getElementById('change-username-modal') && document.getElementById('change-username-modal').style.display === 'flex') closeChangeUsernameModal();
        if (document.getElementById('change-email-modal') && document.getElementById('change-email-modal').style.display === 'flex') closeChangeEmailModal();
        if (document.getElementById('change-password-modal') && document.getElementById('change-password-modal').style.display === 'flex') closeChangePasswordModal();
    }
});

function handleModalBackdropClick(event, modalId, closeFn) {
    if (event.target.id === modalId) {
        if (closeFn) closeFn();
        else document.getElementById(modalId).style.display = 'none';
    }
}

// ==========================================
// 8. POS AND PRODUCT RENDERING
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
        const matchCat = activeCategory === 'All' || p.category === activeCategory;
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
        if (p.stock === 0) { stockClass = 'badge-out'; stockText = 'Out of Stock'; }
        else if (p.stock <= 10) { stockClass = 'badge-low'; stockText = `Low: ${p.stock}`; }

        return `
        <div class="product-card ${p.stock === 0 ? 'out-of-stock' : ''}" onclick="addToCart(${p.id})">
            <div class="product-image" style="overflow:hidden;padding:0;">
                ${(() => {
                const src = productImages.get(p.id);
                return src
                    ? `<img src="${src}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;">`
                    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--light);color:#94a3b8;font-size:0.7rem;font-weight:600;text-align:center;padding:4px;">${p.name.substring(0, 10)}</div>`;
            })()}
            </div>
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
// 9. CART LOGIC
// ==========================================
function addToCart(id) {
    const product = products.find(p => p.id === id);
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
    const product = products.find(p => p.id === id);
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
    const clearBtn = document.getElementById('btn-clear-cart');

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
        // FIX: removed item.img reference — products no longer carry an img field in cart
        return `
        <div class="cart-item">
            <div class="item-info flex-1">
                <p class="cart-item-name">${item.name}</p>
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
    const cashInput = document.getElementById('cash-tendered').value;
    const checkoutBtn = document.getElementById('btn-checkout');
    const changeDis = document.getElementById('change-display');

    if (currentCart.length === 0) {
        checkoutBtn.disabled = true;
        checkoutBtn.classList.remove('btn-primary');
        changeDis.innerText = 'Change: ₱0.00';
        changeDis.className = 'change-display text-right mt-2 text-primary';
        return;
    }

    if (cashInput === '' || parseFloat(cashInput) < cartTotalAmt) {
        checkoutBtn.disabled = true;
        checkoutBtn.classList.remove('btn-primary');
        changeDis.innerText = cashInput === '' ? 'Enter amount received' : 'Insufficient amount';
        changeDis.className = 'change-display text-right mt-2 error-text';
    } else {
        checkoutBtn.disabled = false;
        checkoutBtn.classList.add('btn-primary');
        const change = parseFloat(cashInput) - cartTotalAmt;
        changeDis.innerText = `Change: ₱${change.toFixed(2)}`;
        changeDis.className = 'change-display text-right mt-2 text-success';
    }
}

async function confirmClearCart() {
    if (currentCart.length === 0) return;
    const ok = await showConfirm('Clear Cart?', 'This will remove all items from the current order.', 'Clear Cart', 'btn-danger');
    if (ok) { currentCart = []; updateCartUI(); showToast('Cart cleared.', 'info'); }
}

// ==========================================
// 10. CHECKOUT & RECEIPT LOGIC
// ==========================================
function checkout() {
    const cashTendered = parseFloat(document.getElementById('cash-tendered').value);
    const change = cashTendered - cartTotalAmt;
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
        id: transCount,
        total: cartTotalAmt,
        cash: cashTendered,
        change: change,
        items: currentCart.length,
        itemDetails: currentCart.map(item => ({ name: item.name, qty: item.qty, price: item.price, category: item.category })),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString()
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
    const settings = JSON.parse(localStorage.getItem('sf_settings') || '{}');
    const headerEl = document.getElementById('receipt-header-text');
    const taglineEl = document.getElementById('receipt-tagline-text');
    const footerEl = document.getElementById('receipt-footer-text');
    const brandingEnabled = canUseFeature('custom_branding');

    if (headerEl) headerEl.textContent = brandingEnabled ? (settings.receiptHeader || settings.storeName || 'StockFlow') : 'StockFlow';
    if (taglineEl) taglineEl.textContent = brandingEnabled ? (settings.receiptTagline || 'Your trusted neighborhood store') : 'Official Receipt';
    if (footerEl) footerEl.textContent = brandingEnabled ? (settings.receiptFooter || 'Thank you, come again!') : 'Thank you, come again!';

    document.getElementById('receipt-txn').innerText = transCount.toString().padStart(5, '0');
    document.getElementById('receipt-date').innerText = new Date().toLocaleDateString();

    document.getElementById('receipt-items').innerHTML = cartItems.map(item =>
        `<div class="flex-between" style="font-size:0.88rem;margin-bottom:6px;">
            <span>${item.qty}× ${item.name}</span>
            <span>₱${(item.price * item.qty).toFixed(2)}</span>
        </div>`
    ).join('');

    document.getElementById('receipt-total').innerText = `₱${total.toFixed(2)}`;
    document.getElementById('receipt-cash').innerText = `₱${cash.toFixed(2)}`;
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

    const settings = JSON.parse(localStorage.getItem('sf_settings') || '{}');
    const headerEl = document.getElementById('receipt-header-text');
    const taglineEl = document.getElementById('receipt-tagline-text');
    const footerEl = document.getElementById('receipt-footer-text');
    const brandingEnabled = canUseFeature('custom_branding');

    if (headerEl) headerEl.textContent = brandingEnabled ? (settings.receiptHeader || settings.storeName || 'StockFlow') : 'StockFlow';
    if (taglineEl) taglineEl.textContent = brandingEnabled ? (settings.receiptTagline || 'Your trusted neighborhood store') : 'Official Receipt';
    if (footerEl) footerEl.textContent = brandingEnabled ? (settings.receiptFooter || 'Thank you, come again!') : 'Thank you, come again!';

    document.getElementById('receipt-txn').innerText = txn.id.toString().padStart(5, '0');
    document.getElementById('receipt-date').innerText = txn.date || 'N/A';

    document.getElementById('receipt-items').innerHTML = txn.itemDetails.map(item =>
        `<div class="flex-between" style="font-size:0.88rem;margin-bottom:6px;">
            <span>${item.qty}× ${item.name}</span>
            <span>₱${(item.price * item.qty).toFixed(2)}</span>
        </div>`
    ).join('');

    document.getElementById('receipt-total').innerText = `₱${txn.total.toFixed(2)}`;
    document.getElementById('receipt-cash').innerText = txn.cash ? `₱${txn.cash.toFixed(2)}` : '—';
    document.getElementById('receipt-change').innerText = txn.change != null ? `₱${txn.change.toFixed(2)}` : '—';

    document.getElementById('receipt-modal').style.display = 'flex';
}

// ==========================================
// 11. INVENTORY MANAGEMENT
// ==========================================
function handleProductImageUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const url = e.target.result;
        document.getElementById('new-p-img-data').value = url;
        const lbl = document.getElementById('img-upload-label-text');
        lbl.textContent = file.name.length > 26 ? file.name.substring(0, 24) + '...' : file.name;
        document.getElementById('new-p-img-preview').innerHTML =
            `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    };
    reader.readAsDataURL(file);
}

function addProduct(event) {
    event.preventDefault();
    const name = document.getElementById('new-p-name').value.trim();
    const category = document.getElementById('new-p-cat').value;
    const price = parseFloat(document.getElementById('new-p-price').value);
    const stock = parseInt(document.getElementById('new-p-stock').value);
    const imgData = document.getElementById('new-p-img-data').value.trim();

    // FIX: gate product limit on billing plan
    if (!checkProductLimit()) {
        showToast(`Free plan is limited to ${PLANS.free.productLimit} products. Upgrade to add more!`, 'warning', 5000);
        setTimeout(() => openBillingModal(), 500);
        return;
    }

    if (products.find(p => p.name.toLowerCase() === name.toLowerCase())) {
        showToast('A product with this name already exists.', 'warning');
        return;
    }

    const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
    if (imgData) productImages.save(newId, imgData);
    products.push({ id: newId, name, category, price, stock });

    saveData();
    renderProducts();
    renderInventory();
    updateDashboardUI();
    event.target.reset();
    document.getElementById('new-p-img-data').value = '';
    document.getElementById('img-upload-label-text').textContent = 'Upload Product Image';
    document.getElementById('new-p-img-preview').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    document.getElementById('new-p-img-file').value = '';
    showToast(`${name} added to inventory!`, 'success');
}

function renderInventory() {
    const search = (document.getElementById('inventory-search')?.value || '').toLowerCase();
    const filterVal = document.getElementById('inventory-filter')?.value || 'all';

    const filtered = products.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search);
        let matchFilter = true;
        if (filterVal === 'low') matchFilter = p.stock > 0 && p.stock <= 10;
        if (filterVal === 'out') matchFilter = p.stock === 0;
        if (filterVal === 'in') matchFilter = p.stock > 10;
        return matchSearch && matchFilter;
    });

    const emptyEl = document.getElementById('inventory-empty');
    const tbody = document.getElementById('inventory-table');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
    } else {
        emptyEl.classList.add('hidden');
        tbody.innerHTML = filtered.map(p => {
            let stockClass = 'badge-in', stockText = 'In Stock';
            if (p.stock === 0) { stockClass = 'badge-out'; stockText = 'Out of Stock'; }
            else if (p.stock <= 10) { stockClass = 'badge-low'; stockText = 'Low Stock'; }

            return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        ${(() => {
                    const src = productImages.get(p.id);
                    return src
                        ? `<img src="${src}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
                        : `<div style="width:36px;height:36px;border-radius:6px;background:var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#94a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/></svg></div>`;
                })()}
                        <strong>${p.name}</strong>
                    </div>
                </td>
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
        productImages.remove(id);
        saveData();
        renderInventory();
        renderProducts();
        showToast(`${product.name} removed from inventory.`, 'info');
    }
}

// ==========================================
// 12. DASHBOARD & CHARTS
// ==========================================
function animateValue(el, target, prefix = '') {
    if (!el) return;
    const isFloat = target % 1 !== 0;
    const duration = 800;
    const start = performance.now();
    const from = parseFloat(el.dataset.current || 0);

    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const ease = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const current = from + (target - from) * ease;
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
    document.getElementById('chart-container').style.display = hasSales ? 'block' : 'none';
    if (!hasSales) return;

    const ctx = document.getElementById('salesChart').getContext('2d');
    const labels = Object.keys(categorySales).filter((_, i) => Object.values(categorySales)[i] > 0);
    const data = Object.values(categorySales).filter(v => v > 0);

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
                    labels: { usePointStyle: true, padding: 16, font: { family: 'Inter', size: 13 } }
                },
                tooltip: {
                    callbacks: { label: ctx => ` ₱${ctx.parsed.toLocaleString(undefined, { minimumFractionDigits: 2 })}` }
                }
            },
            cutout: '65%'
        }
    });
}

// ==========================================
// 13. DAILY SALES RESET
// ==========================================
async function confirmResetDailySales() {
    const ok = await showConfirm(
        'Reset Daily Sales?',
        'This will clear today\'s total, transaction count, and category sales. Inventory stock will not be affected.',
        'Reset', 'btn-danger'
    );
    if (!ok) return;

    dailyTotal = 0;
    transCount = 0;
    salesHistory = [];
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
// 14. LANDING PAGE
// ==========================================
function lpScroll(sectionId) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const lp = document.getElementById('landing-page');
    const target = el.offsetTop - 73;
    lp.scrollTo({ top: target, behavior: 'smooth' });
    document.getElementById('lp-nav-links').classList.remove('open');
}

function toggleLpNav() {
    document.getElementById('lp-nav-links').classList.toggle('open');
}

let billingYearly = false;
function toggleBilling() {
    billingYearly = !billingYearly;
    const thumb = document.getElementById('lp-toggle-thumb');
    const track = document.getElementById('lp-billing-toggle');
    const proAmt = document.getElementById('pro-price');
    const proP = document.getElementById('pro-period');
    const proT = document.getElementById('pro-trial');
    const bizAmt = document.getElementById('biz-price');
    const bizP = document.getElementById('biz-period');
    const bizT = document.getElementById('biz-trial');

    if (billingYearly) {
        thumb.classList.add('right');
        track.classList.add('active');
        proAmt.textContent = '₱1,910';
        proP.textContent = '/year';
        proT.textContent = '🎁 Save ₱478 vs monthly + 30-day trial';
        bizAmt.textContent = '₱4,790';
        bizP.textContent = '/year';
        bizT.textContent = '🎁 Save ₱1,198 vs monthly + 30-day trial';
    } else {
        thumb.classList.remove('right');
        track.classList.remove('active');
        proAmt.textContent = '₱199';
        proP.textContent = '/month';
        proT.textContent = '🎁 30-day free trial included';
        bizAmt.textContent = '₱499';
        bizP.textContent = '/month';
        bizT.textContent = '🎁 30-day free trial included';
    }
}

function initLandingNavbar() {
    const lp = document.getElementById('landing-page');
    const nav = document.getElementById('lp-navbar');
    if (!lp || !nav) return;
    lp.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', lp.scrollTop > 20);
    });
}

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
            if (d.x < 0 || d.x > canvas.width) d.dx *= -1;
            if (d.y < 0 || d.y > canvas.height) d.dy *= -1;
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
// 15. DARK MODE
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
// 16. USER SETTINGS OVERLAY
// ==========================================
function openUserSettings() {
    if (!currentUser) return;
    updateSettingsOverlay();
    document.getElementById('user-settings-overlay').style.display = 'flex';
}

function closeUserSettings() {
    document.getElementById('user-settings-overlay').style.display = 'none';
}

function updateSettingsOverlay() {
    const isDark = document.body.classList.contains('dark-mode');

    const avatar = document.getElementById('usp-avatar');
    const username = document.getElementById('usp-username');
    const roleBadge = document.getElementById('usp-role-badge');

    if (avatar) avatar.textContent = (currentUser || '?').charAt(0).toUpperCase();
    if (username) username.textContent = currentUser || 'Guest';
    if (roleBadge) {
        const role = getCurrentUserRole();
        roleBadge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        roleBadge.className = 'usp-role-badge role-' + role;
    }

    // Show email in settings overlay
    const emailEl = document.getElementById('usp-email-display');
    if (emailEl) {
        const user = users.find(u => u.username.toLowerCase() === (currentUser || '').toLowerCase());
        emailEl.textContent = (user && user.email) ? user.email : 'Not set — click to add';
    }
    const unameEl = document.getElementById('usp-username-display');
    if (unameEl) {
        unameEl.textContent = currentUser ? `@${currentUser}` : 'Update your display name';
    }

    // Billing info in settings overlay
    const billingInfoEl = document.getElementById('usp-billing-info');
    if (billingInfoEl) {
        const b = loadBilling();
        const plan = getCurrentPlan();
        const trialLeft = getTrialDaysLeft();
        if (b.status === 'trial' && trialLeft > 0) {
            billingInfoEl.textContent = `${plan.name} Trial · ${trialLeft}d left`;
        } else if (b.plan !== 'free') {
            billingInfoEl.textContent = `${plan.name} Plan · Active`;
        } else {
            billingInfoEl.textContent = 'Free Plan';
        }
    }

    const toggle = document.getElementById('usp-dark-toggle');
    const themeIcon = document.getElementById('usp-theme-icon');
    const themeTitle = document.getElementById('usp-theme-title');
    if (toggle) toggle.checked = isDark;
    if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
    if (themeTitle) themeTitle.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

// ==========================================
// 16b. CHANGE USERNAME & EMAIL
// ==========================================
function showChangeUsernameModal() {
    if (!currentUser) return;
    document.getElementById('new-username-input').value = '';
    document.getElementById('change-username-pass').value = '';
    document.getElementById('change-username-error').classList.add('hidden');
    document.getElementById('change-username-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('new-username-input').focus(), 150);
}

function closeChangeUsernameModal() {
    document.getElementById('change-username-modal').style.display = 'none';
}

function confirmChangeUsername() {
    const newName = document.getElementById('new-username-input').value.trim();
    const pass = document.getElementById('change-username-pass').value;
    const errEl = document.getElementById('change-username-error');
    errEl.classList.add('hidden');

    if (!newName || newName.length < 3) {
        errEl.textContent = 'Username must be at least 3 characters.';
        return errEl.classList.remove('hidden');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(newName)) {
        errEl.textContent = 'Username can only contain letters, numbers, and underscores.';
        return errEl.classList.remove('hidden');
    }
    if (newName.toLowerCase() === (currentUser || '').toLowerCase()) {
        errEl.textContent = 'That\'s already your current username.';
        return errEl.classList.remove('hidden');
    }
    if (users.find(u => u.username.toLowerCase() === newName.toLowerCase())) {
        errEl.textContent = 'That username is already taken.';
        return errEl.classList.remove('hidden');
    }

    const user = users.find(u => u.username.toLowerCase() === (currentUser || '').toLowerCase());
    if (!user) { errEl.textContent = 'User not found.'; return errEl.classList.remove('hidden'); }
    if (user.password !== pass) {
        errEl.textContent = 'Incorrect password.';
        document.getElementById('change-username-pass').value = '';
        document.getElementById('change-username-pass').focus();
        return errEl.classList.remove('hidden');
    }
    if (currentUser && currentUser.toLowerCase() === 'demo') {
        errEl.textContent = 'The demo account username cannot be changed.';
        return errEl.classList.remove('hidden');
    }

    const old = user.username;
    user.username = newName;
    currentUser = newName;
    localStorage.setItem('sf_current_user', currentUser);
    saveData();

    closeChangeUsernameModal();
    setUserDisplay();
    updateSettingsOverlay();
    renderUsers();
    showToast(`Username changed from "@${old}" to "@${newName}".`, 'success', 4000);
}

function showChangeEmailModal() {
    if (!currentUser) return;
    const user = users.find(u => u.username.toLowerCase() === currentUser.toLowerCase());
    const currentEmailEl = document.getElementById('change-email-current');
    if (currentEmailEl) currentEmailEl.textContent = (user && user.email) ? user.email : 'Not set';
    document.getElementById('new-email-input').value = '';
    document.getElementById('change-email-pass').value = '';
    document.getElementById('change-email-error').classList.add('hidden');
    document.getElementById('change-email-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('new-email-input').focus(), 150);
}

function closeChangeEmailModal() {
    document.getElementById('change-email-modal').style.display = 'none';
}

function confirmChangeEmail() {
    const newEmail = document.getElementById('new-email-input').value.trim().toLowerCase();
    const pass = document.getElementById('change-email-pass').value;
    const errEl = document.getElementById('change-email-error');
    errEl.classList.add('hidden');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        errEl.textContent = 'Please enter a valid email address.';
        return errEl.classList.remove('hidden');
    }
    const existing = users.find(u =>
        u.email && u.email.toLowerCase() === newEmail &&
        u.username.toLowerCase() !== (currentUser || '').toLowerCase()
    );
    if (existing) {
        errEl.textContent = 'This email is already associated with another account.';
        return errEl.classList.remove('hidden');
    }

    const user = users.find(u => u.username.toLowerCase() === (currentUser || '').toLowerCase());
    if (!user) { errEl.textContent = 'User not found.'; return errEl.classList.remove('hidden'); }
    if (user.password !== pass) {
        errEl.textContent = 'Incorrect password.';
        document.getElementById('change-email-pass').value = '';
        document.getElementById('change-email-pass').focus();
        return errEl.classList.remove('hidden');
    }

    const old = user.email || 'none';
    user.email = newEmail;
    saveData();

    closeChangeEmailModal();
    updateSettingsOverlay();
    showToast('Email address updated successfully.', 'success');
}

// ==========================================
// CHANGE PASSWORD
// ==========================================
function showChangePasswordModal() {
    if (!currentUser) return;
    document.getElementById('change-pass-current').value = '';
    document.getElementById('change-pass-new').value = '';
    document.getElementById('change-pass-confirm').value = '';
    document.getElementById('change-pass-error').classList.add('hidden');
    document.getElementById('change-pass-strength-wrap').style.display = 'none';
    document.getElementById('change-pass-strength-bar').style.width = '0%';
    document.getElementById('change-pass-strength-label').textContent = '';

    // Wire up live strength meter on the new password field
    const newPassInput = document.getElementById('change-pass-new');
    newPassInput.oninput = function () { updateChangePassStrength(this.value); };

    document.getElementById('change-password-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('change-pass-current').focus(), 150);
}

function closeChangePasswordModal() {
    document.getElementById('change-password-modal').style.display = 'none';
    // Remove the live listener to avoid stale handlers
    const el = document.getElementById('change-pass-new');
    if (el) el.oninput = null;
}

function updateChangePassStrength(val) {
    const wrap = document.getElementById('change-pass-strength-wrap');
    const bar = document.getElementById('change-pass-strength-bar');
    const label = document.getElementById('change-pass-strength-label');
    if (!val) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';

    let score = 0;
    if (val.length >= 6) score++;
    if (val.length >= 10) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const levels = [
        { pct: '20%', color: '#ef4444', text: 'Weak' },
        { pct: '40%', color: '#f59e0b', text: 'Fair' },
        { pct: '60%', color: '#f59e0b', text: 'Moderate' },
        { pct: '80%', color: '#10b981', text: 'Strong' },
        { pct: '100%', color: '#10b981', text: 'Very Strong' },
    ];
    const lvl = levels[Math.min(score, 4)];
    bar.style.width = lvl.pct;
    bar.style.background = lvl.color;
    label.textContent = lvl.text;
    label.style.color = lvl.color;
}

function confirmChangePassword() {
    const current = document.getElementById('change-pass-current').value;
    const newPass = document.getElementById('change-pass-new').value;
    const confirm = document.getElementById('change-pass-confirm').value;
    const errEl = document.getElementById('change-pass-error');
    errEl.classList.add('hidden');

    const user = users.find(u => u.username.toLowerCase() === (currentUser || '').toLowerCase());
    if (!user) {
        errEl.textContent = 'User not found. Please log in again.';
        return errEl.classList.remove('hidden');
    }
    if (user.password !== current) {
        errEl.textContent = 'Current password is incorrect.';
        document.getElementById('change-pass-current').value = '';
        document.getElementById('change-pass-current').focus();
        return errEl.classList.remove('hidden');
    }
    if (newPass.length < 6) {
        errEl.textContent = 'New password must be at least 6 characters.';
        document.getElementById('change-pass-new').focus();
        return errEl.classList.remove('hidden');
    }
    if (newPass === current) {
        errEl.textContent = 'New password must be different from your current password.';
        document.getElementById('change-pass-new').value = '';
        document.getElementById('change-pass-confirm').value = '';
        document.getElementById('change-pass-new').focus();
        return errEl.classList.remove('hidden');
    }
    if (newPass !== confirm) {
        errEl.textContent = 'Passwords do not match.';
        document.getElementById('change-pass-confirm').value = '';
        document.getElementById('change-pass-confirm').focus();
        return errEl.classList.remove('hidden');
    }

    user.password = newPass;
    saveData();
    closeChangePasswordModal();
    showToast('Password updated successfully.', 'success');
}

// ==========================================
// 17. TEAM PORTFOLIO
// ==========================================
const teamMembers = [
    {
        name: 'Christian Reynald Canto', role: 'Project Manager', sub: 'Lead Developer', initials: 'CC',
        photo: 'pfps/Canto.jpg',
        about: 'Christian leads the StockFlow project, coordinating the team\'s efforts and translating business needs into technical solutions.',
        skills: ['Project Management', 'JavaScript', 'HTML/CSS', 'System Architecture', 'Git'],
        contributions: ['Designed and implemented the core application architecture', 'Built the POS checkout and receipt generation system', 'Led sprint planning and task distribution across the team', 'Implemented local storage data persistence layer']
    },
    {
        name: 'Samuel Deocares Divina', role: 'QA Tester', sub: 'Storyboard & Testing', initials: 'SD',
        photo: 'pfps/Divina.jpg',
        about: 'Samuel contributed to the StockFlow project by creating the initial storyboard and participating in key testing phases.',
        skills: ['Storyboarding', 'User Testing', 'QA Testing'],
        contributions: ['Created the project storyboard and initial user flow diagrams', 'Assisted in functional testing of key application features', 'Reported bugs and usability issues during testing sessions']
    },
    {
        name: 'Jayvie Gonzales Garcia', role: 'UX Designer', sub: 'Front-End Integration', initials: 'JG',
        photo: 'pfps/garcia.jpg',
        about: 'Jayvie bridges design and code, crafting user experiences that are intuitive for everyday shop owners.',
        skills: ['UX/UI Design', 'Figma', 'CSS', 'User Research', 'Prototyping'],
        contributions: ['Designed the full UX flow and wireframes for the dashboard', 'Implemented the responsive front-end layout and components', 'Conducted user research with sari-sari store owners', 'Created the landing page visual design and interactions']
    },
    {
        name: 'Jhaila David Pagaduan', role: 'Researcher', sub: 'Scope & Delimitations', initials: 'JP',
        photo: 'pfps/Pagaduan.jpg',
        about: 'Jhaila defined the research boundaries of the StockFlow project, outlining its scope and delimitations.',
        skills: ['Research', 'Documentation', 'Scope Definition'],
        contributions: ['Defined the project scope and delimitations in the research document', 'Outlined the target users and coverage of the system', 'Documented boundaries and limitations of the StockFlow application']
    },
    {
        name: 'Mark Rain Rodolfo', role: 'UI Designer', sub: 'Visual Aesthetics', initials: 'MR',
        photo: 'pfps/Rodolfo.PNG',
        about: 'Mark is responsible for the visual language that makes StockFlow look polished and professional.',
        skills: ['UI Design', 'Visual Design', 'Color Theory', 'Typography', 'Figma'],
        contributions: ['Established the design system, color palette, and typography', 'Designed all UI components, icons, and visual elements', 'Created the StockFlow brand identity and logo', 'Produced high-fidelity mockups for developer handoff']
    }
];

function openMemberPortfolio(index) {
    if (index < 0 || index >= teamMembers.length) {
        console.warn('openMemberPortfolio: index out of bounds', index);
        return;
    }
    const m = teamMembers[index];

    const avatarEl = document.getElementById('pm-avatar');
    if (avatarEl) {
        if (m.photo) {
            avatarEl.innerHTML = `<img src="${m.photo}" alt="${m.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.textContent='${m.initials}'">`;
        } else {
            avatarEl.textContent = m.initials;
        }
    }

    const nameEl = document.getElementById('pm-name');
    if (nameEl) nameEl.textContent = m.name;
    const roleEl = document.getElementById('pm-role');
    if (roleEl) roleEl.textContent = m.role;
    const subEl = document.getElementById('pm-sub');
    if (subEl) subEl.textContent = m.sub;
    const aboutEl = document.getElementById('pm-about');
    if (aboutEl) aboutEl.textContent = m.about;
    const skillsEl = document.getElementById('pm-skills');
    if (skillsEl) skillsEl.innerHTML = m.skills.map(s => `<span class="skill-tag">${s}</span>`).join('');
    const contribEl = document.getElementById('pm-contributions');
    if (contribEl) contribEl.innerHTML = m.contributions.map(c => `<li>${c}</li>`).join('');

    const modal = document.getElementById('member-portfolio-modal');
    if (modal) modal.style.display = 'flex';
}

function closeMemberPortfolio() {
    document.getElementById('member-portfolio-modal').style.display = 'none';
}

// ==========================================
// 18. DELETE ACCOUNT
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
// 19. EXPORT CSV
// ==========================================
function exportCSV() {
    // FIX: gate export behind subscription
    if (!canUseFeature('export')) {
        showUpgradePrompt('CSV Export');
        return;
    }

    if (salesHistory.length === 0) {
        showToast('No sales data to export.', 'warning');
        return;
    }

    const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const avg = transCount > 0 ? (dailyTotal / transCount).toFixed(2) : '0.00';

    let csv = '===== DAILY SALES REPORT =====\n';
    csv += `Date: ${date}\n`;
    csv += `Total Revenue: ${dailyTotal.toFixed(2)}\n`;
    csv += `Total Transactions: ${transCount}\n`;
    csv += `Average Order Value: ${avg}\n`;

    const activeCats = Object.entries(categorySales).filter(([, amt]) => amt > 0);
    if (activeCats.length > 0) {
        csv += '\n===== TOP CATEGORIES =====\n';
        csv += 'Category: Revenue\n';
        activeCats.sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
            csv += `${cat}: ${amt.toFixed(2)}\n`;
        });
    }

    csv += '\n===== TRANSACTIONS =====\n';
    csv += 'Txn #,Time,Items,Total\n';
    salesHistory.forEach(log => {
        csv += `${log.id},${log.time},${log.items},${log.total.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stockflow_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Sales data exported!', 'success');
}

// ==========================================
// 20. ANALYTICS PAGE
// ==========================================
function renderAnalytics() {
    document.getElementById('analytics-revenue').textContent = `₱${dailyTotal.toFixed(2)}`;
    document.getElementById('analytics-transactions').textContent = transCount;
    document.getElementById('analytics-avg').textContent = transCount > 0
        ? `₱${(dailyTotal / transCount).toFixed(2)}`
        : '₱0.00';

    const topCat = Object.entries(categorySales)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);
    document.getElementById('analytics-top-cat').textContent = topCat.length > 0 ? topCat[0][0] : '—';

    const topProdsEl = document.getElementById('analytics-top-products');
    const topEmptyEl = document.getElementById('analytics-top-empty');
    if (salesHistory.length === 0) {
        topProdsEl.innerHTML = '';
        topEmptyEl.classList.remove('hidden');
    } else {
        topEmptyEl.classList.add('hidden');
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

        let productsSorted = Object.values(soldMap).sort((a, b) => b.sold - a.sold).slice(0, 10);

        if (productsSorted.length === 0) {
            topProdsEl.innerHTML = '';
            topEmptyEl.classList.remove('hidden');
        } else {
            topProdsEl.innerHTML = productsSorted.map((p, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        ${(() => {
                    const src = productImages.get(p.id);
                    return src
                        ? `<img src="${src}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
                        : `<div style="width:36px;height:36px;border-radius:6px;background:var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#94a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/></svg></div>`;
                })()}
                        <strong>${p.name}</strong>
                    </div>
                </td>
                    <td><span style="color:var(--secondary);font-size:0.85rem;">${p.category || '—'}</span></td>
                    <td style="font-weight:700;color:var(--success);">₱${p.price.toFixed(2)}</td>
                    <td><strong>${p.sold}</strong> units</td>
                </tr>
            `).join('');
        }
    }

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

    renderAdvancedReporting();
}

function parseTransactionDate(log) {
    if (!log) return null;
    if (log.date) {
        const fromStored = new Date(log.date);
        if (!Number.isNaN(fromStored.getTime())) return fromStored;
    }
    if (log.time) {
        const combined = new Date(`${new Date().toLocaleDateString()} ${log.time}`);
        if (!Number.isNaN(combined.getTime())) return combined;
    }
    return null;
}

function renderAdvancedReporting() {
    const section = document.getElementById('advanced-reporting-section');
    if (!section) return;

    const lockEl = document.getElementById('advanced-reporting-lock');
    const gridEl = document.getElementById('advanced-reporting-grid');
    const rangeEl = document.getElementById('advanced-reporting-range');
    const hasAccess = canUseFeature('advanced_reporting');

    if (rangeEl) rangeEl.disabled = !hasAccess;
    if (!hasAccess) {
        if (lockEl) {
            lockEl.classList.remove('hidden');
            lockEl.innerHTML = '<div class="plan-lock-note">Business plan only: advanced reporting, trend windows, and range-based summaries are locked on Free and Pro.</div>';
        }
        if (gridEl) gridEl.classList.add('analytics-advanced-disabled');
        document.getElementById('adv-range-revenue').textContent = 'PHP 0.00';
        document.getElementById('adv-range-revenue-sub').textContent = 'Upgrade to Business to unlock range summaries';
        document.getElementById('adv-range-transactions').textContent = '0';
        document.getElementById('adv-range-transactions-sub').textContent = 'Business reporting only';
        document.getElementById('adv-busiest-day').textContent = '--';
        document.getElementById('adv-busiest-day-sub').textContent = 'Business reporting only';
        document.getElementById('adv-daily-average').textContent = 'PHP 0.00';
        document.getElementById('adv-daily-average-sub').textContent = 'Business reporting only';
        return;
    }

    if (lockEl) {
        lockEl.classList.add('hidden');
        lockEl.innerHTML = '';
    }
    if (gridEl) gridEl.classList.remove('analytics-advanced-disabled');

    const range = rangeEl ? rangeEl.value : '7';
    const now = new Date();
    const rangeStart = range === 'all'
        ? null
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() - (parseInt(range, 10) - 1));

    const filtered = salesHistory.filter(log => {
        const parsed = parseTransactionDate(log);
        if (!parsed) return false;
        return !rangeStart || parsed >= rangeStart;
    });

    const revenue = filtered.reduce((sum, log) => sum + (log.total || 0), 0);
    const dayTotals = {};
    filtered.forEach(log => {
        const parsed = parseTransactionDate(log);
        if (!parsed) return;
        const key = parsed.toLocaleDateString();
        dayTotals[key] = (dayTotals[key] || 0) + (log.total || 0);
    });

    const busiestEntry = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
    const activeDays = Object.keys(dayTotals).length;
    const avgDailyRevenue = activeDays > 0 ? revenue / activeDays : 0;

    document.getElementById('adv-range-revenue').textContent = `PHP ${revenue.toFixed(2)}`;
    document.getElementById('adv-range-revenue-sub').textContent = `${filtered.length} transaction${filtered.length !== 1 ? 's' : ''} included`;
    document.getElementById('adv-range-transactions').textContent = filtered.length.toString();
    document.getElementById('adv-range-transactions-sub').textContent = range === 'all' ? 'Showing all recorded sales' : `Filtered to the last ${range} days`;
    document.getElementById('adv-busiest-day').textContent = busiestEntry ? busiestEntry[0] : '--';
    document.getElementById('adv-busiest-day-sub').textContent = busiestEntry ? `Generated PHP ${busiestEntry[1].toFixed(2)} in sales` : 'Complete more sales to reveal trends';
    document.getElementById('adv-daily-average').textContent = `PHP ${avgDailyRevenue.toFixed(2)}`;
    document.getElementById('adv-daily-average-sub').textContent = activeDays > 0 ? `Across ${activeDays} sale day${activeDays !== 1 ? 's' : ''}` : 'Based on days with sales in range';
}

// ==========================================
// 21. USERS PAGE
// ==========================================
function renderUsers() {
    const search = (document.getElementById('user-search')?.value || '').toLowerCase();
    const roleFilter = document.getElementById('user-role-filter')?.value || 'all';

    const filtered = users.filter(u => {
        const matchSearch = u.username.toLowerCase().includes(search) ||
            (u.email && u.email.toLowerCase().includes(search));
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
            const emailCell = u.email
                ? `<span style="color:var(--secondary);font-size:0.82rem;">${u.email}</span>`
                : `<span style="color:#cbd5e1;font-size:0.8rem;font-style:italic;">not set</span>`;

            return `
            <tr>
                <td>
                    <strong>${u.username}</strong>
                    ${isCurrentUser ? ' <small style="color:var(--accent);font-weight:600;">(you)</small>' : ''}
                    <div style="margin-top:2px;">${emailCell}</div>
                </td>
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
    const plan = getCurrentPlan();
    const userLimit = getEffectiveUserLimit();
    if (!canAddMoreUsers()) {
        showToast(`${plan.name} plan supports only ${userLimit} user account${userLimit !== 1 ? 's' : ''}. Upgrade to add more!`, 'warning', 5000);
        setTimeout(() => openBillingModal(), 500);
        return;
    }

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
    const plan = getCurrentPlan();
    const username = document.getElementById('new-user-name').value.trim();
    const email = (document.getElementById('new-user-email')?.value || '').trim().toLowerCase();
    const password = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;
    const errEl = document.getElementById('add-user-error');

    errEl.classList.add('hidden');

    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        errEl.textContent = 'Username already exists!';
        return errEl.classList.remove('hidden');
    }
    if (email && users.find(u => u.email && u.email.toLowerCase() === email)) {
        errEl.textContent = 'An account with this email already exists.';
        return errEl.classList.remove('hidden');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'Please enter a valid email address.';
        return errEl.classList.remove('hidden');
    }
    if (!canAddMoreUsers()) {
        errEl.textContent = `${plan.name} plan supports only ${getEffectiveUserLimit()} user account${getEffectiveUserLimit() !== 1 ? 's' : ''}.`;
        return errEl.classList.remove('hidden');
    }

    users.push({ username, email: email || null, password, role, active: true, created: new Date().toLocaleDateString() });
    saveData();
    closeAddUserModal();
    renderUsers();
    showToast(`User "@${username}" created as ${role}.`, 'success');
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
    const ok = await showConfirm('Delete User?', `Remove user "${username}"? This cannot be undone.`, 'Delete', 'btn-danger');
    if (!ok) return;
    users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
    saveData();
    renderUsers();
    showToast(`User "${username}" removed.`, 'info');
}

// ==========================================
// 22. SETTINGS PAGE
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

    const integrations = JSON.parse(localStorage.getItem('sf_integrations') || '{}');
    const integrationsEnabled = canUseFeature('integrations');
    if (document.getElementById('int-cloud')) document.getElementById('int-cloud').checked = integrationsEnabled && !!integrations.cloud;
    if (document.getElementById('int-sms')) document.getElementById('int-sms').checked = integrationsEnabled && !!integrations.sms;
    if (document.getElementById('int-email')) document.getElementById('int-email').checked = integrationsEnabled && !!integrations.email;

    updateBrandingPreview();
    renderSettingsAccess();
    renderBranches();
    renderBillingSection();
    renderSupportExperience();
    updateBillingBadge();
}

function renderSettingsAccess() {
    const brandingLocked = !canUseFeature('custom_branding');
    const brandingInputs = ['set-receipt-header', 'set-receipt-footer', 'set-receipt-tagline']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    brandingInputs.forEach(input => input.disabled = brandingLocked);

    const brandingNote = document.getElementById('receipt-branding-access-note');
    if (brandingNote) {
        brandingNote.innerHTML = brandingLocked
            ? '<div class="plan-lock-note">Business plan only: custom receipt branding is locked on Free and Pro.</div>'
            : '<div class="plan-live-note">Business feature active: your custom branding will appear on printed receipts.</div>';
    }

    const integrationsLocked = !canUseFeature('integrations');
    ['int-cloud', 'int-sms', 'int-email']
        .map(id => document.getElementById(id))
        .filter(Boolean)
        .forEach(input => input.disabled = integrationsLocked);

    const integrationsNote = document.getElementById('integrations-access-note');
    if (integrationsNote) {
        integrationsNote.innerHTML = integrationsLocked
            ? '<div class="plan-lock-note">Business plan only: custom integrations are disabled on Free and Pro.</div>'
            : '<div class="plan-live-note">Business feature active: integrations can be configured for this store.</div>';
    }
}

function renderBillingSection() {
    const el = document.getElementById('settings-billing-section');
    if (!el) return;

    const b = loadBilling();
    const plan = getCurrentPlan();
    const trialLeft = getTrialDaysLeft();

    let statusHtml = '';
    if (b.status === 'trial' && trialLeft > 0) {
        statusHtml = `<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #fbbf24;border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;"><span style="font-size:1.3rem;">🎁</span><div><strong style="color:#92400e;">${plan.name} Trial Active</strong><div style="font-size:0.82rem;color:#78350f;">${trialLeft} days remaining · Trial ends ${new Date(b.trialEnds).toLocaleDateString()}</div></div></div>`;
    } else if (b.plan !== 'free' && b.status === 'active') {
        const renew = b.subscriptionEnd ? new Date(b.subscriptionEnd).toLocaleDateString() : 'N/A';
        statusHtml = `<div style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);border:1px solid #86efac;border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;"><span style="font-size:1.3rem;">✅</span><div><strong style="color:#14532d;">${plan.name} Plan — Active</strong><div style="font-size:0.82rem;color:#166534;">Renews ${renew} · ${b.billing === 'yearly' ? 'Yearly' : 'Monthly'} billing${b.paymentMethod ? ` · •••• ${b.paymentMethod.last4}` : ''}</div></div></div>`;
    } else {
        statusHtml = `<div style="background:var(--light);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;"><span style="font-size:1.3rem;">🆓</span><div><strong>Free Plan</strong><div style="font-size:0.82rem;color:var(--secondary);">Up to ${PLANS.free.productLimit} products · ${PLANS.free.userLimit} user account</div></div></div>`;
    }

    el.innerHTML = statusHtml + `<button onclick="openBillingModal()" class="btn btn-primary btn-sm" style="width:100%;">💳 Manage Subscription</button>`;
}

function saveSettings(event) {
    event.preventDefault();
    // FIX: save ALL settings (profile + receipt branding) together
    const existing = JSON.parse(localStorage.getItem('sf_settings') || '{}');
    const settings = {
        ...existing,
        storeName: document.getElementById('set-store-name').value.trim(),
        ownerName: document.getElementById('set-owner-name').value.trim(),
        address: document.getElementById('set-address').value.trim(),
        contact: document.getElementById('set-contact').value.trim()
    };
    if (canUseFeature('custom_branding')) {
        settings.receiptHeader = document.getElementById('set-receipt-header').value.trim();
        settings.receiptFooter = document.getElementById('set-receipt-footer').value.trim();
        settings.receiptTagline = document.getElementById('set-receipt-tagline').value.trim();
    }
    localStorage.setItem('sf_settings', JSON.stringify(settings));
    showToast('Settings saved successfully!', 'success');
}

function updateBrandingPreview() {
    const brandingEnabled = canUseFeature('custom_branding');
    const header = brandingEnabled ? (document.getElementById('set-receipt-header')?.value || 'StockFlow') : 'StockFlow';
    const tagline = brandingEnabled ? (document.getElementById('set-receipt-tagline')?.value || 'Your trusted neighborhood store') : 'Official Receipt';
    const footer = brandingEnabled ? (document.getElementById('set-receipt-footer')?.value || 'Thank you for your purchase!') : 'Thank you for your purchase!';

    const ph = document.getElementById('preview-header');
    const pt = document.getElementById('preview-tagline');
    const pf = document.getElementById('preview-footer');
    if (ph) ph.textContent = header || 'StockFlow';
    if (pt) pt.textContent = tagline || 'Your trusted neighborhood store';
    if (pf) pf.textContent = footer || 'Thank you for your purchase!';

    // Auto-save receipt branding
    if (brandingEnabled) {
        const settings = JSON.parse(localStorage.getItem('sf_settings') || '{}');
        settings.receiptHeader = document.getElementById('set-receipt-header')?.value.trim() || '';
        settings.receiptFooter = document.getElementById('set-receipt-footer')?.value.trim() || '';
        settings.receiptTagline = document.getElementById('set-receipt-tagline')?.value.trim() || '';
        localStorage.setItem('sf_settings', JSON.stringify(settings));
    }
}

function renderBranches() {
    const container = document.getElementById('branches-list');
    const input = document.getElementById('new-branch-name');
    const addButton = document.getElementById('add-branch-btn')
        || document.querySelector('.add-branch-form button[onclick="addBranch()"]');
    if (!container) return;

    const hasAccess = hasBusinessPlanAccess();
    if (input) input.disabled = !hasAccess;
    if (addButton) addButton.disabled = !hasAccess;

    if (!hasAccess) {
        if (input) input.value = '';
        container.innerHTML = '<div class="branches-empty">Multi-branch support is available on the Business plan only.</div>';
        return;
    }

    const branches = JSON.parse(localStorage.getItem('sf_branches') || '[]');

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
    if (!hasBusinessPlanAccess()) {
        showToast('Multi-branch support is available on the Business plan only.', 'warning', 5000);
        return;
    }

    const input = document.getElementById('new-branch-name');
    const name = input.value.trim();
    if (!name) { showToast('Please enter a branch name.', 'warning'); return; }

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
    if (!hasBusinessPlanAccess()) {
        showToast('Multi-branch support is available on the Business plan only.', 'warning', 5000);
        return;
    }

    const branches = JSON.parse(localStorage.getItem('sf_branches') || '[]');
    if (index < 0 || index >= branches.length) return;

    const ok = await showConfirm('Delete Branch?', `Remove branch "${branches[index].name}"?`, 'Delete', 'btn-danger');
    if (!ok) return;

    const removed = branches.splice(index, 1);
    localStorage.setItem('sf_branches', JSON.stringify(branches));
    renderBranches();
    showToast(`Branch "${removed[0].name}" removed.`, 'info');
}

function toggleIntegration(key, enabled) {
    if (!canUseFeature('integrations')) {
        const input = document.getElementById(`int-${key}`);
        if (input) input.checked = false;
        showToast('Custom integrations are available on the Business plan only.', 'warning', 5000);
        return;
    }

    const integrations = JSON.parse(localStorage.getItem('sf_integrations') || '{}');
    integrations[key] = enabled;
    localStorage.setItem('sf_integrations', JSON.stringify(integrations));
    const names = { cloud: 'Cloud Backup', sms: 'SMS Notifications', email: 'Email Reports' };
    showToast(`${names[key] || key} ${enabled ? 'enabled' : 'disabled'}.`, enabled ? 'success' : 'info');
}

// ==========================================
// 23. CONTACT & SUPPORT FORMS
// ==========================================
function handleContactForm(event) {
    event.preventDefault();
    event.target.reset();
    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = '✅ Message Sent!';
    btn.style.background = '#10b981';
    setTimeout(() => { btn.textContent = originalText; btn.style.background = ''; }, 3000);
}

function handleSupportTicket(event) {
    event.preventDefault();
    const name = document.getElementById('support-name').value.trim();
    const supportDetails = getSupportPlanDetails();
    showToast(`Thank you, ${name}! Your support ticket has been submitted. ${supportDetails.toastMessage}`, 'success', 5000);
    event.target.reset();
}

function renderSupportExperience() {
    const supportDetails = getSupportPlanDetails();
    const responseTimeEl = document.getElementById('support-response-time');
    const supportNote = document.getElementById('support-access-note');
    if (responseTimeEl) responseTimeEl.textContent = supportDetails.responseTime;
    if (supportNote) {
        supportNote.innerHTML = `<div class="plan-support-note">${supportDetails.label}: ${supportDetails.responseTime}.</div>`;
    }
}

// ==========================================
// 24. APP INITIALIZATION
// ==========================================
window.onload = () => {
    loadData();
    initLandingCanvas();
    initLandingNavbar();
    renderCategories();
    renderProducts();
    updateDashboardUI();

    if (localStorage.getItem('sf_dark_mode') === 'true') {
        document.body.classList.add('dark-mode');
        const label = document.getElementById('dark-mode-label');
        if (label) label.textContent = 'Light Mode';
        const btn = document.getElementById('dark-mode-btn');
        if (btn) btn.querySelector('.nav-icon').textContent = '☀️';
    }

    const invSearch = document.getElementById('inventory-search');
    if (invSearch) invSearch.addEventListener('input', renderInventory);

    if (localStorage.getItem('sf_logged_in') === 'true') {
        document.getElementById('landing-page').style.display = 'none';
        setUserDisplay();
        // FIX: apply role restrictions on page load when already logged in
        applyRoleRestrictions();
        updateBillingBadge();
    }

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

    loadSettings();

    // Ensure all users have required fields
    users.forEach(u => {
        if (!u.role) u.role = u.username.toLowerCase() === 'demo' ? 'admin' : 'cashier';
        if (u.active === undefined) u.active = true;
        if (!u.created) u.created = 'Legacy';
        if (u.email === undefined) u.email = null;
        if (u.emailVerified === undefined) u.emailVerified = false;
    });
    // Give demo account a demo email so forgot-password has something to show
    const demoUser = users.find(u => u.username.toLowerCase() === 'demo');
    if (demoUser && !demoUser.email) demoUser.email = 'demo@stockflow.app';
    saveData();
};
// ==========================================
// PLAN DETAILS MODAL (Landing Page)
// ==========================================
const PLAN_DETAILS = {
    free: {
        name: 'Free Plan',
        icon: '🆓',
        price: '₱0',
        period: 'forever',
        color: '#64748b',
        tagline: 'Perfect for getting started — no credit card required.',
        features: [
            {
                category: 'Core Features', items: [
                    { label: 'Live Dashboard', desc: 'Real-time overview of daily sales and activity', included: true },
                    { label: 'Up to 20 Products', desc: 'Add and manage up to 20 items in your inventory', included: true },
                    { label: 'Point of Sale (POS)', desc: 'Full cart system with cash change calculator', included: true },
                    { label: 'Digital Receipts', desc: 'Auto-generated, printable receipts after every sale', included: true },
                    { label: '1 User Account', desc: 'Single login for the store owner', included: true },
                ]
            },
            {
                category: 'Advanced Features', items: [
                    { label: 'Sales Analytics', desc: 'Visual charts breaking down revenue by category', included: false },
                    { label: 'Export CSV Reports', desc: 'Download daily sales reports as spreadsheets', included: false },
                    { label: 'Multi-User Access', desc: 'Add cashiers and managers as separate accounts', included: false },
                    { label: 'Custom Store Branding', desc: 'Add your store name and logo to receipts', included: false },
                    { label: 'Advanced Reporting', desc: 'Deeper analytics with trends and custom date ranges', included: false },
                    { label: 'Unlimited Users', desc: 'Remove staff account limits as your team grows', included: false },
                    { label: 'Multi-Branch Support', desc: 'Manage multiple store locations', included: false },
                    { label: '24/7 Dedicated Support', desc: 'Priority customer service around the clock', included: false },
                    { label: 'Custom Integrations', desc: 'Connect StockFlow with external tools and platforms', included: false },
                ]
            }
        ]
    },
    pro: {
        name: 'Pro Plan',
        icon: '⚡',
        price: '₱199',
        period: '/month',
        color: '#3b82f6',
        tagline: 'Everything you need to run your store like a pro.',
        features: [
            {
                category: 'Everything in Free, plus:', items: [
                    { label: 'Unlimited Products', desc: 'No cap on how many items you can manage', included: true },
                    { label: 'Full Sales Analytics', desc: 'Visual doughnut chart with category breakdowns', included: true },
                    { label: 'Export CSV Reports', desc: 'Download daily and historical sales reports', included: true },
                    { label: 'Up to 3 User Accounts', desc: 'Add cashiers and managers to your store', included: true },
                    { label: 'Priority Support', desc: 'Faster response times and dedicated assistance', included: true },
                    { label: 'Dashboard Overview', desc: 'Live daily sales, transaction count, and alerts', included: true },
                    { label: 'POS & Digital Receipts', desc: 'Full cart system with printable receipts', included: true },
                ]
            },
            {
                category: 'Not Included', items: [
                    { label: 'Custom Store Branding', desc: 'Add your logo and branding to receipts', included: false },
                    { label: 'Advanced Reporting', desc: 'Access deeper trends and custom reporting ranges', included: false },
                    { label: 'Unlimited Users', desc: 'Add unlimited staff accounts', included: false },
                    { label: 'Multi-Branch Support', desc: 'Manage multiple store locations', included: false },
                    { label: '24/7 Dedicated Support', desc: 'Around-the-clock priority customer service', included: false },
                    { label: 'Custom Integrations', desc: 'Connect with external tools and business systems', included: false },
                ]
            }
        ]
    },
    business: {
        name: 'Business Plan',
        icon: '🏢',
        price: '₱499',
        period: '/month',
        color: '#6366f1',
        tagline: 'Built for growing stores that need full control.',
        features: [
            {
                category: 'Everything in Pro, plus:', items: [
                    { label: 'Custom Store Branding', desc: 'Add your store name, logo, and colors to all receipts', included: true },
                    { label: 'Unlimited Users', desc: 'No limit on staff and manager accounts', included: true },
                    { label: 'Advanced Reporting', desc: 'Deeper analytics with trends and custom date ranges', included: true },
                    { label: 'Multi-Branch Support', desc: 'Manage and compare multiple store locations', included: true },
                    { label: '24/7 Dedicated Support', desc: 'Round-the-clock priority customer service line', included: true },
                    { label: 'Custom Integrations', desc: 'Connect with external tools and platforms', included: true },
                    { label: 'Unlimited Products', desc: 'Manage as many SKUs as your store needs', included: true },
                    { label: 'Full Sales Analytics', desc: 'Visual charts and category-level insights', included: true },
                    { label: 'Export CSV Reports', desc: 'Download and share sales data at any time', included: true },
                    { label: 'POS, Receipts & Dashboard', desc: 'All core StockFlow features included', included: true },
                ]
            },
        ]
    }
};

function openPlanDetails(planId) {
    const d = PLAN_DETAILS[planId];
    if (!d) return;

    const featuresHtml = d.features.map(section => `
        <div class="pd-section">
            <div class="pd-section-label">${section.category}</div>
            <ul class="pd-feature-list">
                ${section.items.map(item => `
                    <li class="pd-feature-item ${item.included ? 'pd-included' : 'pd-excluded'}">
                        <span class="pd-feature-icon">${item.included ? '✓' : '✗'}</span>
                        <div class="pd-feature-text">
                            <span class="pd-feature-name">${item.label}</span>
                            <span class="pd-feature-desc">${item.desc}</span>
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>
    `).join('');

    document.getElementById('plan-details-body').innerHTML = `
        <div class="pd-header" style="--plan-color:${d.color};">
            <div class="pd-header-icon">${d.icon}</div>
            <div class="pd-header-info">
                <h2 class="pd-header-name">${d.name}</h2>
                <div class="pd-header-price"><span class="pd-price-amount">${d.price}</span><span class="pd-price-period">${d.period}</span></div>
                <p class="pd-header-tagline">${d.tagline}</p>
            </div>
        </div>
        <div class="pd-body">
            ${featuresHtml}
            <button class="pd-cta-btn" onclick="closePlanDetails(); showLoginModal();">
                ${planId === 'free' ? 'Get Started Free →' : 'Start 30-Day Free Trial →'}
            </button>
        </div>
    `;

    document.getElementById('plan-details-modal').style.display = 'flex';
}

function closePlanDetails() {
    document.getElementById('plan-details-modal').style.display = 'none';
}



