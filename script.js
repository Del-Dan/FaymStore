const API_URL = "https://script.google.com/macros/s/AKfycbzxG09tYFfcV7ben74vi6TjQXnqZ6DB3hLnW7PVMRoW24BaQpnqvyH6GZ48A8GO38kc/exec";

// --- STATE MANAGEMENT ---
const AppState = {
    user: JSON.parse(localStorage.getItem('faym_user')) || null,
    favorites: [],
    cart: JSON.parse(localStorage.getItem('faym_cart')) || [],
    products: [],
    inventory: [],
    config: {},
    locations: [],
    currency: 'GH₵'
};

const formatImage = (url) => {
    if (!url) return 'https://via.placeholder.com/400x500?text=No+Image';

    // --- 1. CLOUDINARY HANDLING (Speed Boost) ---
    if (url.includes('cloudinary.com')) {
        if (url.includes('f_auto') || url.includes('q_auto')) {
            return url;
        }
        return url.replace('/upload/', '/upload/f_auto,q_auto/');
    }

    // --- 2. GOOGLE DRIVE HANDLING (Legacy Support) ---
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
        const driveRegex = /(?:\/d\/|id=)([-\w]{25,})/;
        const match = url.match(driveRegex);
        if (match && match[1]) {
            // "sz=s1000" requests high-res
            return `https://lh3.googleusercontent.com/d/$${match[1]}=s1000`;
        }
    }

    return url;
};

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    renderCartCount();
    checkSession();
    try {
        const res = await fetch(`${API_URL}?action=getStoreData`).then(r => r.json());

        // Data Transformation
        AppState.products = res.products.map(p => ({
            ...p,
            base_price: Number(p.base_price),
            discount_price: Number(p.discount_price),
            is_new: String(p.is_new).toUpperCase() === 'TRUE'
        }));

        AppState.inventory = res.inventory;
        AppState.config = res.config;
        AppState.locations = res.locations;

        finalizeInit();

    } catch (e) {
        console.error("Critical Init Error", e);
        // User-friendly error screen (No Mock Data for Production)
        document.getElementById('productGrid').innerHTML = `
            <div class="col-span-full py-20 text-center">
                <i class="bi bi-wifi-off text-6xl text-gray-300 mb-4 block"></i>
                <h2 class="text-xl font-bold text-gray-800">Connection Failed</h2>
                <p class="text-gray-500 mb-6">We couldn't load the store. Please check your internet.</p>
                <button onclick="window.location.reload()" class="bg-black text-white px-6 py-2 rounded-full font-bold hover:bg-gray-800 transition">Retry</button>
            </div>
        `;
        document.getElementById('heroSection').style.display = 'none';
        document.getElementById('latestDropsSection').style.display = 'none';
    }
}

function finalizeInit() {
    populateFilters();
    renderProductGrid();
    initHero();
    renderLatestDrops();
    if (AppState.user) fetchLikes();
    renderCartDrawer();
}

// --- AUTH ---
function checkSession() {
    if (AppState.user) {
        document.getElementById('authIcon').className = "bi bi-person-fill";
        document.getElementById('authStatusDot').classList.remove('hidden');
    }
}
function handleAuthClick() { AppState.user ? openProfile() : openAuth(); }

function openProfile() {
    if (!AppState.user) return;
    document.getElementById('profName').value = AppState.user.fullName;
    document.getElementById('profEmail').value = AppState.user.email;
    document.getElementById('profPhone').value = AppState.user.phone || "";
    document.getElementById('profileModal').classList.remove('hidden');
    document.getElementById('profileModal').classList.add('flex');
    switchProfileTab('details');
}

function switchProfileTab(tab) {
    const tDet = document.getElementById('tabDetails');
    const tOrd = document.getElementById('tabOrders');
    const tWish = document.getElementById('tabWishlist');

    const pDet = document.getElementById('paneDetails');
    const pOrd = document.getElementById('paneOrders');
    const pWish = document.getElementById('paneWishlist');

    // Reset All
    [tDet, tOrd, tWish].forEach(t => t.className = "pb-2 text-sm font-bold text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition");
    [pDet, pOrd, pWish].forEach(p => p.classList.add('hidden'));

    // Activate
    if (tab === 'details') {
        tDet.className = "pb-2 text-sm font-bold border-b-2 border-black transition";
        tDet.classList.remove('text-gray-400');
        pDet.classList.remove('hidden');
    } else if (tab === 'orders') {
        tOrd.className = "pb-2 text-sm font-bold border-b-2 border-black transition";
        tOrd.classList.remove('text-gray-400');
        pOrd.classList.remove('hidden');
        loadOrderHistory();
    } else if (tab === 'wishlist') {
        tWish.className = "pb-2 text-sm font-bold border-b-2 border-black transition";
        tWish.classList.remove('text-gray-400');
        pWish.classList.remove('hidden');
        renderWishlist();
    }
}

function renderWishlist() {
    const div = document.getElementById('paneWishlist');
    div.innerHTML = '';

    // Filter Products
    const likedCodes = AppState.favorites;
    // Find variants that match sub_code
    // Issue: AppState.products list variants individually? No, grouped by parent usually in UI?
    // Actually AppState.products is raw list of ALL variants.

    const likedProds = AppState.products.filter(p => likedCodes.includes(p.sub_code));

    if (likedProds.length === 0) {
        div.innerHTML = `<div class="col-span-2 text-center py-8 text-gray-500"><i class="bi bi-heart text-4xl mb-2 block"></i><p>No favorites yet.</p></div>`;
        return;
    }

    likedProds.forEach(p => {
        // Mini Card
        const el = document.createElement('div');
        el.className = "border rounded cursor-pointer hover:shadow-md transition bg-white";
        el.onclick = () => { closeProfile(); openProductModal(p); };
        el.innerHTML = `
            <div class="aspect-[4/5] bg-gray-100 mb-2 overflow-hidden">
                <img src="${formatImage(p.main_image_url)}" class="w-full h-full object-cover">
            </div>
            <div class="px-2 pb-2">
                <h4 class="font-bold text-xs line-clamp-1">${p.product_name}</h4>
                <div class="text-xs text-gray-500">${AppState.currency}${p.discount_active ? p.discount_price : p.base_price}</div>
            </div>
        `;
        div.appendChild(el);
    });
}

async function loadOrderHistory() {
    const div = document.getElementById('paneOrders');
    div.innerHTML = '<div class="text-center py-4"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div></div>';

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'getOrderHistory', payload: { phone: AppState.user.phone } })
        }).then(r => r.json());

        if (res.success && res.orders.length > 0) {
            div.innerHTML = res.orders.map(o => `
                <div class="border rounded-lg p-3 text-sm">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <div class="font-bold">#${o.order_id}</div>
                            <div class="text-xs text-gray-500">${new Date(o.date).toLocaleDateString()}</div>
                        </div>
                        <div class="px-2 py-1 rounded text-xs font-bold ${getStatusColor(o.status)}">
                            ${o.status.toUpperCase()}
                        </div>
                    </div>
                    <div class="space-y-1 mb-2">
                        ${o.items.map(i => `<div class="text-gray-600 truncate">${i.item_name} (x${i.qty})</div>`).join('')}
                    </div>
                    <div class="flex justify-between items-center border-t pt-2 mt-2">
                        <span class="font-bold">Total</span>
                        <span class="font-bold">${AppState.currency}${o.total}</span>
                    </div>
                </div>
            `).join('');
        } else {
            div.innerHTML = `<div class="text-center py-8 text-gray-500"><i class="bi bi-bag-x text-4xl mb-2 block"></i><p>No orders found.</p></div>`;
        }
    } catch (e) {
        div.innerHTML = '<div class="text-red-500 text-center text-sm">Failed to load orders.</div>';
    }
}

function getStatusColor(status) {
    switch (status.toLowerCase()) {
        case 'pending': return 'bg-yellow-100 text-yellow-800';
        case 'paid': return 'bg-blue-100 text-blue-800';
        case 'processing': return 'bg-purple-100 text-purple-800';
        case 'shipped': return 'bg-indigo-100 text-indigo-800';
        case 'delivered': return 'bg-green-100 text-green-800';
        case 'cancelled': return 'bg-red-100 text-red-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

function closeProfile() {
    document.getElementById('profileModal').classList.add('hidden');
    document.getElementById('profileModal').classList.remove('flex');
}

function logoutUser() {
    localStorage.removeItem('faym_user');
    location.reload();
}

async function handleUpdateProfile(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const txt = btn.innerText;

    const currPass = document.getElementById('profCurrPass').value;
    const newPass = document.getElementById('profNewPass').value;
    const repPass = document.getElementById('profRepPass').value;

    if (newPass || repPass) {
        if (!currPass) { alert("Please enter your current password to change it."); return; }
        if (newPass !== repPass) { alert("New passwords do not match."); return; }
        if (newPass.length < 6) { alert("New password must be at least 6 characters."); return; }
    }

    btn.innerText = "Saving..."; btn.disabled = true;

    try {
        const payload = {
            userId: AppState.user.userId,
            fullName: document.getElementById('profName').value,
            phone: document.getElementById('profPhone').value
        };
        if (newPass) {
            payload.currentPassword = currPass;
            payload.newPassword = newPass;
        }

        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'updateUser', payload: payload })
        }).then(r => r.json());

        if (res.success) {
            AppState.user = res.user;
            localStorage.setItem('faym_user', JSON.stringify(res.user));
            alert("Profile Updated Successfully!");
            document.getElementById('profCurrPass').value = '';
            document.getElementById('profNewPass').value = '';
            document.getElementById('profRepPass').value = '';
            closeProfile();
        } else {
            alert(res.message || "Update failed.");
        }
    } catch (e) { alert("Connection Error"); }
    btn.innerText = txt; btn.disabled = false;
}

// --- AUTH LOGIC ---
function openAuth() { document.getElementById('authModal').classList.remove('hidden'); document.getElementById('authModal').classList.add('flex'); }
function closeAuth() { document.getElementById('authModal').classList.add('hidden'); document.getElementById('authModal').classList.remove('flex'); }

function switchAuth(mode) {
    ['loginForm', 'registerForm', 'forgotForm'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(`${mode}Form`).classList.remove('hidden');
}

function clearError(input) {
    input.classList.remove('border-red-500');
    const p = input.nextElementSibling;
    if (p && p.classList.contains('error-msg')) p.classList.add('hidden');
}

function showError(input, msg) {
    input.classList.add('border-red-500');
    const p = input.nextElementSibling;
    if (p && p.classList.contains('error-msg')) {
        p.innerText = msg;
        p.classList.remove('hidden');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const f = e.target;
    let valid = true;

    clearError(f.email);
    clearError(f.password);

    if (!f.email.value.trim()) { showError(f.email, 'Email is required'); valid = false; }
    if (!f.password.value.trim()) { showError(f.password, 'Password is required'); valid = false; }

    if (!valid) return;

    const btn = f.querySelector('button[type="submit"]');
    const txt = btn.innerText;
    btn.innerText = "Verifying..."; btn.disabled = true;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'loginUser', payload: { email: f.email.value.trim(), password: f.password.value.trim() } })
        }).then(r => r.json());

        if (res.success) {
            AppState.user = res.user;
            localStorage.setItem('faym_user', JSON.stringify(res.user));
            location.reload();
        } else {
            showError(f.password, res.message || "Invalid credentials");
        }
    } catch (e) { showError(f.password, "Connection Error"); }
    btn.innerText = txt; btn.disabled = false;
}

async function handleRegister(e) {
    e.preventDefault();
    const f = e.target;
    let valid = true;

    clearError(f.fullName);
    clearError(f.email);
    clearError(f.phone);
    clearError(f.password);

    if (!f.fullName.value.trim()) { showError(f.fullName, 'Name is required'); valid = false; }
    if (!f.email.value.trim() || !f.email.value.includes('@')) { showError(f.email, 'Valid email required'); valid = false; }
    if (!f.phone.value.trim() || f.phone.value.length < 10) { showError(f.phone, 'Valid phone required'); valid = false; }
    if (f.password.value.length < 6) { showError(f.password, 'Min 6 chars required'); valid = false; }

    if (!valid) return;

    const btn = f.querySelector('button[type="submit"]');
    const txt = btn.innerText;
    btn.innerText = "Creating..."; btn.disabled = true;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'registerUser',
                payload: {
                    fullName: f.fullName.value,
                    email: f.email.value.trim(),
                    phone: f.phone.value,
                    password: f.password.value
                }
            })
        }).then(r => r.json());

        if (res.success) {
            alert('Account Created! Please Login.');
            switchAuth('login');
        } else {
            if (res.message.toLowerCase().includes('email')) showError(f.email, res.message);
            else showError(f.fullName, res.message);
        }
    } catch (e) { showError(f.fullName, "Connection Error"); }
    btn.innerText = txt; btn.disabled = false;
}

function openForgotPass() { switchAuth('forgot'); }

async function handleForgotPass(e) {
    e.preventDefault();
    const f = e.target;
    if (!f.email.value.trim()) { showError(f.email, 'Email is required'); return; }

    const btn = f.querySelector('button');
    const txt = btn.innerText;
    btn.innerText = "Sending..."; btn.disabled = true;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'forgotPassword', payload: { email: f.email.value.trim() } })
        }).then(r => r.json());

        if (res.success) {
            alert("OTP sent to your email (Valid for 15 mins). Check Spam/Inbox.");
            switchAuth('login');
        } else {
            showError(f.email, res.message || "User not found");
        }
    } catch (e) { showError(f.email, "Network Error"); }
    btn.innerText = txt; btn.disabled = false;
}

// --- GRID & DROPS ---
function renderProductGrid(products = AppState.products) {
    const grid = document.getElementById('productGrid');
    grid.innerHTML = '';
    const grouped = groupProducts(products);
    if (grouped.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-400">No products match.</div>';
        return;
    }
    grouped.forEach(p => grid.appendChild(createProductCard(p)));
}

function renderLatestDrops() {
    const drops = AppState.products.filter(p => p.is_new === true);
    const sec = document.getElementById('latestDropsSection');
    if (drops.length === 0) {
        sec.classList.add('hidden');
        return;
    }
    sec.classList.remove('hidden');
    const grid = document.getElementById('latestGrid');
    grid.innerHTML = '';
    groupProducts(drops).slice(0, 4).forEach(p => grid.appendChild(createProductCard(p)));
}

function groupProducts(list) {
    const map = {};
    list.forEach(p => {
        if (!map[p.parent_code]) map[p.parent_code] = { ...p, variants: [] };
        map[p.parent_code].variants.push(p);
    });
    return Object.values(map);
}

function createProductCard(p) {
    const div = document.createElement('div');
    div.className = "group cursor-pointer";
    div.onclick = () => openProductModal(p);

    // Color dots
    let dots = p.variants.map(v => {
        const hasStock = AppState.inventory.some(i => i.sub_code === v.sub_code && i.stock_qty > 0);
        return `<div class="w-3 h-3 rounded-full border border-gray-200 ${hasStock ? '' : 'opacity-30 diagonal-strike'}" style="background-color:${v.color_hex};" title="${v.color_name}${hasStock ? '' : ' (OOS)'}"></div>`;
    }).join('');

    div.innerHTML = `
            <div class="relative w-full aspect-[4/5] bg-gray-100 overflow-hidden mb-4 rounded-sm">
                <img src="${formatImage(p.main_image_url)}" class="w-full h-full object-cover transition duration-700 group-hover:scale-110">
                ${p.discount_active ? '<span class="absolute top-2 left-2 bg-red-600 text-white text-[10px] uppercase font-bold px-2 py-1">Sale</span>' : ''}
                <div class="absolute bottom-4 left-4 right-4 translate-y-[120%] group-hover:translate-y-0 transition-transform duration-300 ease-out z-20">
                    <button class="w-full bg-white text-black py-3.5 font-bold text-sm uppercase tracking-wider shadow-lg hover:bg-black hover:text-white transition-all border border-black/10 rounded-sm">View Options</button>
                </div>
            </div>
            <div>
                 <h3 class="font-bold text-lg leading-tight">${p.product_name}</h3>
                 <span class="text-xs text-gray-500 mb-1 block">${p.category}</span>
                 <div class="flex items-center gap-2 text-sm text-gray-600 mb-2">
                     ${p.discount_active ? `<span class="font-bold text-red-600">${AppState.currency}${p.discount_price}</span> <span class="line-through text-xs">${AppState.currency}${p.base_price}</span>` : `<span class="font-bold">${AppState.currency}${p.base_price}</span>`}
                 </div>
                 <div class="flex gap-1 opacity-80">${dots}</div>
            </div>
        `;
    return div;
}

// --- SEARCH & SORTING ---
function toggleSearch() {
    const ol = document.getElementById('searchOverlay');
    const backdrop = document.getElementById('searchBackdrop');
    const drawer = document.getElementById('searchDrawer');
    const input = document.getElementById('searchInput');

    if (ol.classList.contains('hidden')) {
        ol.classList.remove('hidden');
        void ol.offsetWidth;
        backdrop.classList.remove('opacity-0');
        drawer.classList.remove('-translate-y-full');
        input.focus();
    } else {
        backdrop.classList.add('opacity-0');
        drawer.classList.add('-translate-y-full');
        setTimeout(() => ol.classList.add('hidden'), 300);
    }
}

function populateFilters() {
    const uniqueCats = [...new Set(AppState.products.map(p => p.category))];
    const sel = document.getElementById('filterCategory');
    sel.innerHTML = '<option value="all">All Categories</option>';
    uniqueCats.forEach(c => {
        if (c) {
            const opt = document.createElement('option');
            opt.value = c; opt.innerText = c;
            sel.appendChild(opt);
        }
    });
}

function runSearchOrFilter() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const cat = document.getElementById('filterCategory').value;
    const price = document.getElementById('filterPrice').value;
    const stockPos = document.getElementById('filterStock').checked;
    const sortMode = document.getElementById('sortOrder')?.value || 'newest';

    let results = AppState.products.filter(p => {
        const matchSearch = !q || p.product_name.toLowerCase().includes(q) || p.color_name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q));
        const matchCat = cat === 'all' || p.category === cat;

        const pVal = p.discount_active ? p.discount_price : p.base_price;
        let matchPrice = true;
        if (price === 'under100') matchPrice = pVal < 100;
        else if (price === '100to300') matchPrice = pVal >= 100 && pVal <= 300;
        else if (price === 'over300') matchPrice = pVal > 300;

        let matchStock = true;
        if (stockPos) {
            matchStock = AppState.inventory.some(i => i.sub_code === p.sub_code && i.stock_qty > 0);
        }
        return matchSearch && matchCat && matchPrice && matchStock;
    });

    // --- SORTING LOGIC ---
    results.sort((a, b) => {
        const priceA = a.discount_active ? a.discount_price : a.base_price;
        const priceB = b.discount_active ? b.discount_price : b.base_price;

        if (sortMode === 'priceLow') return priceA - priceB;
        if (sortMode === 'priceHigh') return priceB - priceA;
        return 0; // Default (Order from Sheets)
    });

    if (!document.getElementById('searchOverlay').classList.contains('hidden')) {
        toggleSearch();
    }

    const titleEl = document.querySelector('main h2');
    const subTitleEl = document.querySelector('main span.text-brand-accent');
    const resetBtn = document.getElementById('gridResetBtn');

    if (q || cat !== 'all' || price !== 'all' || stockPos || sortMode !== 'newest') {
        if (subTitleEl) subTitleEl.innerText = "Filtered Results";
        if (titleEl) titleEl.innerHTML = q ? `Search for "<span class='italic'>${q}</span>"` : "Filtered Selection";
        if (resetBtn) resetBtn.classList.remove('hidden');
    } else {
        if (subTitleEl) subTitleEl.innerText = "Collection";
        if (titleEl) titleEl.innerText = "All Products";
        if (resetBtn) resetBtn.classList.add('hidden');
    }

    renderProductGrid(results);
    scrollToGrid();
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('filterPrice').value = 'all';
    document.getElementById('sortOrder').value = 'newest';
    document.getElementById('filterStock').checked = false;
    runSearchOrFilter();
}

// --- MODAL ---
let currentGroup = [], currentVar = null, selSize = null;
let currentGallery = [], galleryIdx = 0;

async function initGallery(varData) {
    const mainImg = formatImage(varData.main_image_url);
    currentGallery = [mainImg];
    galleryIdx = 0;
    renderGalleryUI();

    if (varData.gallery_images) {
        const raw = varData.gallery_images;
        // Direct Comma-Separated Links (Cloudinary Preferred)
        const list = raw.split(',').map(s => formatImage(s.trim())).filter(s => s && s !== mainImg);
        currentGallery.push(...list);
    }
    renderGalleryUI();
}

function renderGalleryUI() {
    document.getElementById('modalImg').src = currentGallery[galleryIdx];
    const prevBtn = document.getElementById('galleryPrevBtn');
    const nextBtn = document.getElementById('galleryNextBtn');

    if (currentGallery.length > 1) {
        prevBtn.classList.remove('hidden');
        nextBtn.classList.remove('hidden');
    } else {
        prevBtn.classList.add('hidden');
        nextBtn.classList.add('hidden');
    }

    const tDiv = document.getElementById('galleryThumbnails');
    tDiv.innerHTML = '';
    if (currentGallery.length > 1) {
        currentGallery.forEach((img, i) => {
            const btn = document.createElement('button');
            btn.className = `w-12 h-16 flex-shrink-0 border-2 rounded overflow-hidden transition ${i === galleryIdx ? 'border-brand-accent scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`;
            btn.innerHTML = `<img src="${img}" class="w-full h-full object-cover">`;
            btn.onclick = (e) => { e.stopPropagation(); galleryIdx = i; renderGalleryUI(); };
            tDiv.appendChild(btn);
        });
    }
}

function changeGalleryImage(dir) {
    galleryIdx = (galleryIdx + dir + currentGallery.length) % currentGallery.length;
    renderGalleryUI();
}

function openProductModal(p) {
    currentGroup = AppState.products.filter(x => x.parent_code === p.parent_code);
    selectVariant(p.sub_code);
    document.getElementById('productModal').classList.remove('hidden');
    document.getElementById('productModal').classList.add('flex');
    document.getElementById('addSuccessMsg').classList.add('hidden');
}
function closeModal() {
    document.getElementById('productModal').classList.add('hidden');
    document.getElementById('productModal').classList.remove('flex');
    selSize = null;
}

function selectVariant(sub) {
    currentVar = currentGroup.find(x => x.sub_code === sub);
    document.getElementById('modalImg').src = formatImage(currentVar.main_image_url);
    document.getElementById('modalTitle').innerText = currentVar.product_name;
    document.getElementById('modalCategory').innerText = currentVar.category;

    const priceEl = document.getElementById('modalPrice');
    const oldPriceEl = document.getElementById('modalOldPrice');
    if (currentVar.discount_active) {
        priceEl.innerText = `${AppState.currency}${currentVar.discount_price}`;
        priceEl.className = 'text-xl font-bold text-red-600';
        oldPriceEl.innerText = `${AppState.currency}${currentVar.base_price}`;
        oldPriceEl.classList.remove('hidden');
    } else {
        priceEl.innerText = `${AppState.currency}${currentVar.base_price}`;
        priceEl.className = 'text-xl font-bold';
        oldPriceEl.classList.add('hidden');
    }
    document.getElementById('modalDesc').innerText = currentVar.description || '';

    initGallery(currentVar);

    const cDiv = document.getElementById('modalColors');
    cDiv.innerHTML = '';
    currentGroup.forEach(v => {
        const b = document.createElement('button');
        b.className = `w-10 h-10 rounded-full border-2 ${v.sub_code === sub ? 'border-black scale-110' : 'border-transparent'}`;
        b.style.backgroundColor = v.color_hex;
        b.onclick = () => { selectVariant(v.sub_code); document.getElementById('addSuccessMsg').classList.add('hidden'); };
        cDiv.appendChild(b);
    });
    document.getElementById('selectedColorName').innerText = currentVar.color_name;

    const heart = document.getElementById('modalLikeBtn').querySelector('i');
    if (AppState.favorites.includes(sub)) { heart.className = "bi bi-heart-fill"; heart.parentElement.classList.add('text-red-500'); }
    else { heart.className = "bi bi-heart"; heart.parentElement.classList.remove('text-red-500'); }

    renderSizes();
}

function renderSizes() {
    const sDiv = document.getElementById('modalSizes');
    sDiv.innerHTML = '';
    const order = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
    const stock = AppState.inventory.filter(i => i.sub_code === currentVar.sub_code);

    order.forEach(sz => {
        const item = stock.find(i => i.size === sz);
        const qty = item ? item.stock_qty : 0;
        const btn = document.createElement('button');
        btn.disabled = qty <= 0;

        if (qty > 0) {
            btn.className = "py-3 rounded border text-sm font-semibold hover:border-black hover:bg-black hover:text-white transition";

            // LOW STOCK ALERT
            if (qty < 5) {
                btn.innerHTML = `${sz} <span class="block text-[9px] text-red-500 font-normal leading-none mt-0.5">Left: ${qty}</span>`;
            } else {
                btn.innerText = sz;
            }

            btn.onclick = () => {
                Array.from(sDiv.children).forEach(c => { if (!c.disabled) c.className = "py-3 rounded border text-sm font-semibold hover:border-black hover:bg-black hover:text-white transition"; });
                btn.className = "py-3 rounded border text-sm font-semibold bg-black text-white border-black shadow-md";

                selSize = { size: sz, sku: item.sku_id, max: qty };
                const addBtn = document.getElementById('addToCartBtn');
                addBtn.disabled = false;
                addBtn.className = "w-full py-4 bg-black text-white font-bold rounded-lg transition-all text-sm uppercase hover:scale-[1.01] shadow-lg";
                addBtn.innerText = `Add - ${AppState.currency}${currentVar.discount_active ? currentVar.discount_price : currentVar.base_price}`;
            };
        } else {
            btn.innerText = sz;
            btn.className = "py-3 rounded border text-sm font-semibold bg-gray-50 text-gray-300 cursor-not-allowed diagonal-strike opacity-50";
        }
        sDiv.appendChild(btn);
    });

    const addBtn = document.getElementById('addToCartBtn');
    addBtn.disabled = true;
    addBtn.innerText = "Select Size";
    addBtn.className = "w-full py-4 bg-gray-200 text-gray-400 font-bold rounded-lg transition-all text-sm uppercase cursor-not-allowed";
    selSize = null;
}

function addToCartFromModal() {
    if (!selSize || !currentVar) return;
    const item = {
        sku: selSize.sku,
        parent_code: currentVar.parent_code,
        product_name: currentVar.product_name,
        image: currentVar.main_image_url,
        color: currentVar.color_name,
        size: selSize.size,
        price: currentVar.discount_active ? currentVar.discount_price : currentVar.base_price,
        maxQty: selSize.max,
        qty: 1
    };
    const exist = AppState.cart.find(c => c.sku === item.sku);
    if (exist) {
        if (exist.qty < exist.maxQty) exist.qty++; else alert("Max stock reached.");
    } else {
        AppState.cart.push(item);
    }
    saveCart();

    const drawer = document.getElementById('cartDrawer');
    if (drawer && drawer.classList.contains('translate-x-full')) {
        toggleCart();
    }

    document.getElementById('addSuccessMsg').classList.remove('hidden');
    setTimeout(() => document.getElementById('addSuccessMsg').classList.add('hidden'), 3000);
}

// --- LIKES ---
async function fetchLikes() {
    try {
        const res = await fetch(`${API_URL}`, { method: 'POST', body: JSON.stringify({ action: 'getLikes', payload: { email: AppState.user.email } }) }).then(r => r.json());
        if (res.success) AppState.favorites = res.likes;
    } catch (e) { }
}

async function toggleLikeFromModal() {
    if (!currentVar) return;
    if (!AppState.user) { openAuth(); return; }
    const sub = currentVar.sub_code;
    const heart = document.getElementById('modalLikeBtn').querySelector('i');

    if (AppState.favorites.includes(sub)) {
        AppState.favorites = AppState.favorites.filter(x => x !== sub);
        heart.className = "bi bi-heart"; heart.parentElement.classList.remove('text-red-500');
    } else {
        AppState.favorites.push(sub);
        heart.className = "bi bi-heart-fill"; heart.parentElement.classList.add('text-red-500');
    }
    await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'toggleLike', payload: { email: AppState.user.email, productSubCode: sub } }) });
}

// --- CART ---
function saveCart() { localStorage.setItem('faym_cart', JSON.stringify(AppState.cart)); renderCartCount(); renderCartDrawer(); }
function renderCartCount() { document.getElementById('cartCount').innerText = AppState.cart.reduce((a, b) => a + b.qty, 0); document.getElementById('cartCount').classList.toggle('opacity-0', AppState.cart.length === 0); }
function renderCartDrawer() {
    const div = document.getElementById('cartItems'); div.innerHTML = '';
    let tot = 0;
    if (AppState.cart.length === 0) div.innerHTML = "<div class='text-center text-gray-500 mt-10'>Cart is empty.</div>";
    else {
        AppState.cart.forEach((c, i) => {
            tot += c.price * c.qty;
            div.innerHTML += `
                    <div class="flex gap-4">
                        <img src="${formatImage(c.image)}" class="w-16 h-20 object-cover rounded bg-gray-100">
                        <div class="flex-1">
                            <h4 class="font-bold text-sm line-clamp-1">${c.product_name}</h4>
                            <span class="text-xs text-gray-500">${c.color} | ${c.size}</span>
                            <div class="flex justify-between mt-2">
                                <span class="font-bold text-sm">${AppState.currency}${c.price}</span>
                                <div class="border rounded flex items-center bg-white"><button onclick="updCart(${i},-1)" class="px-2 hover:bg-gray-100">-</button><span class="px-2 text-xs font-bold">${c.qty}</span><button onclick="updCart(${i},1)" class="px-2 hover:bg-gray-100">+</button></div>
                            </div>
                        </div>
                        <button onclick="rmCart(${i})" class="text-gray-400 hover:text-red-500"><i class="bi bi-trash"></i></button>
                    </div>`;
        });
    }
    document.getElementById('cartSubtotal').innerText = AppState.currency + tot;
}
function updCart(i, d) {
    const c = AppState.cart[i];
    if (c.qty + d > 0 && c.qty + d <= c.maxQty) { c.qty += d; saveCart(); }
}
function rmCart(i) {
    AppState.cart.splice(i, 1);
    saveCart();
}

// --- CHECKOUT LOGIC ---
let deliveryMethod = 'delivery';
let deliveryFee = 0;

function checkout() {
    if (AppState.cart.length === 0) {
        alert("Your cart is empty.");
        return;
    }
    if (AppState.user) {
        document.getElementById('chkName').value = AppState.user.fullName || '';
        document.getElementById('chkPhone').value = AppState.user.phone || '';
    }

    const cDiv = document.getElementById('chkItems');
    cDiv.innerHTML = AppState.cart.map(item => `
        <div class="flex gap-3 text-sm">
             <img src="${formatImage(item.image)}" class="w-12 h-16 object-cover rounded border">
             <div class="flex-1">
                 <div class="font-bold line-clamp-1">${item.product_name}</div>
                 <div class="text-xs text-gray-500">${item.size} | ${item.color}</div>
                 <div class="font-semibold mt-1">x${item.qty} ${AppState.currency}${item.price}</div>
             </div>
        </div>
    `).join('');

    const options = { month: 'short', day: 'numeric' };
    const dateStart = new Date(); dateStart.setDate(dateStart.getDate() + 5);
    const dateEnd = new Date(); dateEnd.setDate(dateEnd.getDate() + 14);
    document.getElementById('chkEstDate').innerText = `${dateStart.toLocaleDateString(undefined, options)} - ${dateEnd.toLocaleDateString(undefined, options)}`;

    if (deliveryMethod === 'delivery') initZoneDropdowns();

    updateCheckoutTotals();

    document.getElementById('checkoutModal').classList.remove('hidden');
    document.getElementById('checkoutModal').classList.add('flex');
}

function closeCheckout() {
    document.getElementById('checkoutModal').classList.add('hidden');
    document.getElementById('checkoutModal').classList.remove('flex');
}

function setDeliveryMethod(method) {
    deliveryMethod = method;

    const tabDel = document.getElementById('tabDelivery');
    const tabPick = document.getElementById('tabPickup');
    const paneDel = document.getElementById('paneDelivery');
    const panePick = document.getElementById('panePickup');

    if (method === 'delivery') {
        tabDel.className = "pb-2 text-lg font-bold border-b-2 border-black transition";
        tabDel.classList.remove('text-gray-400');
        tabPick.className = "pb-2 text-lg font-bold text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition";
        paneDel.classList.remove('hidden');
        panePick.classList.add('hidden');
        initZoneDropdowns();
    } else {
        tabPick.className = "pb-2 text-lg font-bold border-b-2 border-black transition";
        tabPick.classList.remove('text-gray-400');
        tabDel.className = "pb-2 text-lg font-bold text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition";
        panePick.classList.remove('hidden');
        paneDel.classList.add('hidden');
        deliveryFee = 0;
        updateCheckoutTotals();
    }
    updateCheckoutTotals();
}

// --- ZONE LOGIC ---
function initZoneDropdowns() {
    const locs = AppState.locations || [];
    if (locs.length === 0) { console.warn("No Location Data"); return; }
    const regSel = document.getElementById('chkRegion');

    const uniqueRegions = [...new Set(locs.map(l => l.Region))].filter(r => r && r !== "Region");
    regSel.innerHTML = '<option value="">Select Region</option>';
    uniqueRegions.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r; opt.innerText = r;
        regSel.appendChild(opt);
    });
    document.getElementById('chkTown').innerHTML = '<option value="">Select Town first</option>';
    document.getElementById('chkArea').innerHTML = '<option value="">Select Area first</option>';
}

function onRegionChange() {
    const reg = document.getElementById('chkRegion').value;
    const townSel = document.getElementById('chkTown');
    townSel.innerHTML = '<option value="">Select Town/City</option>';
    document.getElementById('chkArea').innerHTML = '<option value="">Select Area first</option>';
    if (!reg) return;
    const locs = AppState.locations.filter(l => l.Region === reg);
    const uniqueTowns = [...new Set(locs.map(l => l.Town_City))];
    uniqueTowns.forEach(t => {
        const opt = document.createElement('option');
        const optText = t;
        opt.value = t; opt.innerText = optText;
        townSel.appendChild(opt);
    });
}

function onTownChange() {
    const reg = document.getElementById('chkRegion').value;
    const town = document.getElementById('chkTown').value;
    const areaSel = document.getElementById('chkArea');
    areaSel.innerHTML = '<option value="">Select Area/Locality</option>';
    if (!town) return;
    const locs = AppState.locations.filter(l => l.Region === reg && l.Town_City === town);
    locs.forEach(l => {
        const opt = document.createElement('option');
        const price = l.Delivery_Price;
        const areaName = l.Area_Locality;
        opt.value = `${areaName}|${price}`;
        opt.innerText = `${areaName} (GH₵${price})`;
        areaSel.appendChild(opt);
    });
}

function onAreaChange() {
    const val = document.getElementById('chkArea').value;
    if (val) {
        const [area, price] = val.split('|');
        deliveryFee = Number(price);
    } else {
        deliveryFee = 0;
    }
    updateCheckoutTotals();
}

function updateCheckoutTotals() {
    const subtotal = AppState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const fee = deliveryMethod === 'delivery' ? deliveryFee : 0;
    const total = subtotal + fee;
    document.getElementById('chkSubtotal').innerText = `${AppState.currency}${subtotal}`;
    document.getElementById('chkDeliveryFee').innerText = fee > 0 ? `${AppState.currency}${fee}` : 'Free';
    document.getElementById('chkTotal').innerText = `${AppState.currency}${total}`;
    document.getElementById('payBtn').innerHTML = `<i class="bi bi-credit-card"></i> <span>Pay Now ${AppState.currency}${total}</span>`;

    if (deliveryMethod === 'delivery' && fee > 0) {
        const area = document.getElementById('chkArea');
        const areaName = area.options[area.selectedIndex]?.innerText?.split('(')[0] || '';
        document.getElementById('chkDistanceInfo').innerText = `Delivery to: ${areaName}`;
    } else {
        document.getElementById('chkDistanceInfo').innerText = '';
    }
}

// --- PAYSTACK PAYMENT ---
function processPayment() {
    // Note: Guest Checkout is allowed. We check fields, not "AppState.user".
    const name = document.getElementById('chkName').value;
    const phone = document.getElementById('chkPhone').value;
    const address = deliveryMethod === 'delivery' ? document.getElementById('chkAddress').value : "Store Pickup";

    if (!name || !phone || (deliveryMethod === 'delivery' && !address)) {
        showToast("Please complete all fields.", "error");
        return;
    }

    // Delivery Method Validation
    if (deliveryMethod === 'delivery' && deliveryFee === 0) {
        // Did they select an area?
        const areaVal = document.getElementById('chkArea').value;
        if (!areaVal) {
            showToast("Please select a delivery area.", "error");
            return;
        }
    }

    const subtotal = AppState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const fee = deliveryMethod === 'delivery' ? deliveryFee : 0;
    const total = subtotal + fee;

    const paystackKey = AppState.config['PAYSTACK_PUBLIC_KEY'];

    const userEmail = AppState.user ? AppState.user.email : "guest@faymstore.com";

    if (window.location.protocol === 'file:' || AppState.config['TEST_MODE']) {
        console.log("Test Mode: Bypassing Paystack");
        showToast("Test Mode: Payment Bypassed", "success");
        return;
    }

    if (!paystackKey) {
        showToast("System Error: Payment Config Missing", "error");
        return;
    }

    const handler = PaystackPop.setup({
        key: paystackKey,
        email: userEmail,
        amount: total * 100,
        currency: 'GHS',
        metadata: {
            custom_fields: [
                { display_name: "Customer Name", variable_name: "customer_name", value: name },
                { display_name: "Phone", variable_name: "phone", value: phone },
                { display_name: "Delivery Method", variable_name: "delivery_method", value: deliveryMethod }
            ]
        },
        callback: function (response) {
            const orderPayload = {
                storeName: "FAYM",
                customerName: name,
                phone: phone,
                location: address,
                deliveryMethod: deliveryMethod,
                paymentMethod: "Paystack",
                grandTotal: total,
                items: AppState.cart.map(c => ({
                    sku_id: c.sku,
                    item_name: c.product_name,
                    size: c.size,
                    qty: c.qty,
                    price: c.price // Sent for reference, but Backend will RE-VERIFY price
                })),
                paymentReference: response.reference
            };

            fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'processOrder', payload: orderPayload })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        showToast("Order Confirmed! ID: " + data.parentRef, "success");
                        closeCheckout();
                        AppState.cart = [];
                        saveCart();
                    } else {
                        showToast("Failed: " + data.message, "error");
                    }
                })
                .catch(err => showToast("Network Error: " + err, "error"));
        },
        onClose: function () {
            showToast('Transaction cancelled.', 'error');
        }
    });
    handler.openIframe();
}

function toggleCart() {
    const d = document.getElementById('cartDrawer');
    d.classList.toggle('translate-x-full');
    document.getElementById('cartBackdrop').classList.toggle('hidden');
    setTimeout(() => document.getElementById('cartBackdrop').classList.toggle('opacity-0'), 10);
}

// --- HERO SLIDER ---
let heroInterval;
function initHero() {
    const con = document.getElementById('sliderContainer');
    const titleEl = document.getElementById('heroTitle');
    const subTitleEl = document.getElementById('heroSubtext');
    const ctaBtn = document.getElementById('heroBtn');

    const slides = [];
    for (let i = 1; i <= 5; i++) {
        const url = AppState.config[`hero_slide_${i}_url`];
        if (url) {
            slides.push({
                url: formatImage(url),
                type: AppState.config[`hero_slide_${i}_type`] || 'image',
                text: AppState.config[`hero_slide_${i}_text`] || '',
                subtext: AppState.config[`hero_slide_${i}_subtext`] || ''
            });
        }
    }

    if (slides.length === 0) return;

    const slidesHtml = slides.map((s, i) => {
        const media = s.type === 'video'
            ? `<video src="${s.url}" class="w-full h-full object-cover" muted loop playsinline></video>`
            : `<img src="${s.url}" class="w-full h-full object-cover">`;

        const style = i === 0 ? 'transform: translateX(0); z-index: 10; opacity: 1;' : 'transform: translateX(100%); z-index: 0; opacity: 0;';

        return `<div class="absolute inset-0 transition-transform duration-500 ease-in-out bg-gray-100" style="${style}" data-index="${i}">
                    ${media}
                    <div class="absolute inset-0 bg-black/20"></div>
                </div>`;
    }).join('');

    const controlsHtml = `
        <button id="heroPrev" class="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-black/20 text-white backdrop-blur-md hover:bg-black/50 hover:scale-110 transition hidden md:block">
            <i class="bi bi-chevron-left text-2xl"></i>
        </button>
        <button id="heroNext" class="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-black/20 text-white backdrop-blur-md hover:bg-black/50 hover:scale-110 transition hidden md:block">
            <i class="bi bi-chevron-right text-2xl"></i>
        </button>
        <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2 items-center" id="heroDots">
            ${slides.map((_, i) => `<button onclick="jumpToSlide(${i})" class="h-1.5 rounded-full transition-all duration-300 ${i === 0 ? 'w-8 bg-white' : 'w-1.5 bg-white/50 hover:bg-white'}"></button>`).join('')}
        </div>
    `;

    con.innerHTML = slidesHtml + controlsHtml;

    let curIdx = 0;
    let isAnimating = false;

    const updateText = (idx) => {
        const txt = slides[idx].text;
        const sub = slides[idx].subtext;

        titleEl.style.opacity = '0';
        if (subTitleEl) subTitleEl.style.opacity = '0';

        setTimeout(() => {
            titleEl.innerText = txt;
            if (subTitleEl) {
                subTitleEl.innerText = sub;
                subTitleEl.style.display = sub ? 'block' : 'none';
            }
            titleEl.style.opacity = '1';
            if (subTitleEl && sub) subTitleEl.style.opacity = '1';
        }, 500);

        const dots = document.getElementById('heroDots').children;
        Array.from(dots).forEach((dot, i) => {
            dot.className = i === idx
                ? "h-1.5 rounded-full transition-all duration-300 w-8 bg-white"
                : "h-1.5 rounded-full transition-all duration-300 w-1.5 bg-white/50 hover:bg-white";
        });
    };

    updateText(0);
    ctaBtn.classList.remove('opacity-0');

    const transitionSlide = (nextIdx, direction) => {
        if (isAnimating || nextIdx === curIdx) return;
        isAnimating = true;

        const slideEls = Array.from(con.children).filter(el => el.hasAttribute('data-index'));
        const currEl = slideEls[curIdx];
        const nextEl = slideEls[nextIdx];

        const nextVid = nextEl.querySelector('video');
        if (nextVid) nextVid.play().catch(() => { });

        const startPos = direction === 'next' ? '100%' : '-100%';
        const endPos = direction === 'next' ? '-100%' : '100%';

        nextEl.style.transition = 'none';
        nextEl.style.transform = `translateX(${startPos})`;
        nextEl.style.zIndex = '20';
        nextEl.style.opacity = '1';

        void nextEl.offsetWidth;

        const transitionStyle = 'transform 0.5s ease-in-out';
        currEl.style.transition = transitionStyle;
        nextEl.style.transition = transitionStyle;

        requestAnimationFrame(() => {
            currEl.style.transform = `translateX(${endPos})`;
            nextEl.style.transform = `translateX(0)`;
        });

        setTimeout(() => {
            currEl.style.zIndex = '0';
            currEl.style.opacity = '0';
            const currVid = currEl.querySelector('video');
            if (currVid) { currVid.pause(); currVid.currentTime = 0; }

            isAnimating = false;
        }, 500);

        curIdx = nextIdx;
        updateText(curIdx);
    };

    window.jumpToSlide = (idx) => {
        if (idx === curIdx) return;
        const dir = idx > curIdx ? 'next' : 'prev';
        transitionSlide(idx, dir);
        resetTimer();
    };

    const nextSlide = () => {
        const next = (curIdx + 1) % slides.length;
        transitionSlide(next, 'next');
    };

    const prevSlide = () => {
        const prev = (curIdx - 1 + slides.length) % slides.length;
        transitionSlide(prev, 'prev');
    };

    const nextBtn = document.getElementById('heroNext');
    const prevBtn = document.getElementById('heroPrev');
    if (nextBtn) nextBtn.onclick = () => { nextSlide(); resetTimer(); };
    if (prevBtn) prevBtn.onclick = () => { prevSlide(); resetTimer(); };

    const startCycle = () => {
        if (slides.length > 1) {
            clearInterval(heroInterval);
            heroInterval = setInterval(nextSlide, 5000);
        }
    };
    const resetTimer = () => {
        clearInterval(heroInterval);
        startCycle();
    };
    startCycle();

    // SWIPE SUPPORT -> (Existing logic remains same, just shortened for snippet context)
    // ... (Use existing swipe logic)
    let touchStartX = 0;
    // ... (Keep existing touch handlers intact)
    let touchStartY = 0;
    let currentDragX = 0;
    let isDragging = false;
    const heroSec = document.getElementById('heroSection');

    heroSec.ontouchstart = (e) => {
        if (isAnimating) return;
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
        isDragging = true;
        clearInterval(heroInterval);

        const slideEls = Array.from(con.children).filter(el => el.hasAttribute('data-index'));
        const prevIdx = (curIdx - 1 + slides.length) % slides.length;
        const nextIdx = (curIdx + 1) % slides.length;
        const currEl = slideEls[curIdx];
        const prevEl = slideEls[prevIdx];
        const nextEl = slideEls[nextIdx];

        [currEl, prevEl, nextEl].forEach(el => el.style.transition = 'none');

        prevEl.style.transform = 'translateX(-100%)';
        prevEl.style.opacity = '1';
        prevEl.style.zIndex = '5';

        nextEl.style.transform = 'translateX(100%)';
        nextEl.style.opacity = '1';
        nextEl.style.zIndex = '5';

        currEl.style.zIndex = '10';
    };

    heroSec.ontouchmove = (e) => {
        if (!isDragging) return;
        const cx = e.changedTouches[0].clientX;
        const cy = e.changedTouches[0].clientY;
        const diffX = cx - touchStartX;
        const diffY = cy - touchStartY;

        if (Math.abs(diffX) > Math.abs(diffY)) e.preventDefault();

        currentDragX = cx;
        const slideEls = Array.from(con.children).filter(el => el.hasAttribute('data-index'));
        const nextIdx = (curIdx + 1) % slides.length;
        const prevIdx = (curIdx - 1 + slides.length) % slides.length;

        const currEl = slideEls[curIdx];
        const prevEl = slideEls[prevIdx];
        const nextEl = slideEls[nextIdx];

        currEl.style.transform = `translateX(${diffX}px)`;

        if (diffX < 0) nextEl.style.transform = `translateX(calc(100% + ${diffX}px))`;
        else prevEl.style.transform = `translateX(calc(-100% + ${diffX}px))`;
    };

    heroSec.ontouchend = (e) => {
        if (!isDragging) return;
        isDragging = false;
        const diff = currentDragX - touchStartX;
        const threshold = 50;

        const slideEls = Array.from(con.children).filter(el => el.hasAttribute('data-index'));
        const prevIdx = (curIdx - 1 + slides.length) % slides.length;
        const nextIdx = (curIdx + 1) % slides.length;
        const currEl = slideEls[curIdx];
        const prevEl = slideEls[prevIdx];
        const nextEl = slideEls[nextIdx];

        const trans = 'transform 0.5s ease-in-out';
        [currEl, prevEl, nextEl].forEach(el => el.style.transition = trans);

        if (Math.abs(diff) > threshold) {
            isAnimating = true;
            if (diff < 0) {
                requestAnimationFrame(() => {
                    currEl.style.transform = 'translateX(-100%)';
                    nextEl.style.transform = 'translateX(0)';
                });
                finishSwipe(nextIdx);
            } else {
                requestAnimationFrame(() => {
                    currEl.style.transform = 'translateX(100%)';
                    prevEl.style.transform = 'translateX(0)';
                });
                finishSwipe(prevIdx);
            }
        } else {
            requestAnimationFrame(() => {
                currEl.style.transform = 'translateX(0)';
                prevEl.style.transform = 'translateX(-100%)';
                nextEl.style.transform = 'translateX(100%)';
            });
            setTimeout(() => {
                prevEl.style.opacity = '0';
                nextEl.style.opacity = '0';
            }, 500);
        }
        startCycle();
    };

    const finishSwipe = (targetIdx) => {
        setTimeout(() => {
            const slideEls = Array.from(con.children).filter(el => el.hasAttribute('data-index'));
            slideEls.forEach((el, i) => {
                if (i !== targetIdx) {
                    el.style.zIndex = '0';
                    el.style.opacity = '0';
                } else {
                    el.style.zIndex = '10';
                    el.style.opacity = '1';
                }
            });
            const oldVid = slideEls[curIdx].querySelector('video');
            if (oldVid) { oldVid.pause(); oldVid.currentTime = 0; }

            const newVid = slideEls[targetIdx].querySelector('video');
            if (newVid) newVid.play().catch(() => { });

            isAnimating = false;
            curIdx = targetIdx;
            updateText(curIdx);
        }, 500);
    };

    heroSec.onmouseenter = () => clearInterval(heroInterval);
    heroSec.onmouseleave = startCycle;
}
function scrollToGrid() { document.getElementById('productGrid').scrollIntoView({ behavior: 'smooth' }); }

function openSizeGuideModal() {
    document.getElementById('sizeGuideModal').classList.remove('hidden');
    document.getElementById('sizeGuideModal').classList.add('flex');
    const cat = currentVar ? currentVar.category : "General";
    const c = document.getElementById('sizeGuideContent');
    if (cat === 'T-Shirt') c.innerHTML = "<b>T-Shirt</b><br>S: 36 | M: 38 | L: 40";
    else if (cat === 'Hoodie') c.innerHTML = "<b>Hoodie</b><br>S: 38 | M: 40 | L: 42";
    else c.innerHTML = "Standard Sizing";
}
function closeSizeGuide() {
    document.getElementById('sizeGuideModal').classList.add('hidden');
    document.getElementById('sizeGuideModal').classList.remove('flex');
}

// --- TOAST NOTIFICATIONS ---
function showToast(msg, type = 'info') {
    const con = document.getElementById('toastContainer');
    const el = document.createElement('div');

    // Aesthetic Styling
    let colors = "bg-white border-gray-200 text-gray-800";
    let icon = "bi-info-circle";

    if (type === 'success') { colors = "bg-green-50 border-green-200 text-green-800"; icon = "bi-check-circle-fill"; }
    else if (type === 'error') { colors = "bg-red-50 border-red-200 text-red-800"; icon = "bi-exclamation-circle-fill"; }

    el.className = `flex items-center gap-3 px-6 py-4 rounded-lg shadow-xl border ${colors} transform translate-x-full transition-all duration-300 min-w-[300px]`;
    el.innerHTML = `<i class="bi ${icon} text-lg"></i> <span class="font-bold text-sm">${msg}</span>`;

    con.appendChild(el);

    // Animate In
    requestAnimationFrame(() => el.classList.remove('translate-x-full'));

    // Remove after 4s
    setTimeout(() => {
        el.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => el.remove(), 300);
    }, 4000);
}
