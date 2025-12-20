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

    // Check for Google Drive Links
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
        // Regex to catch /d/ID or id=ID
        const driveRegex = /(?:\/d\/|id=)([-\w]{25,})/;
        const match = url.match(driveRegex);
        if (match && match[1]) {
            return `https://lh3.googleusercontent.com/d/${match[1]}`;
        } else {
            console.warn("Could not parse Drive ID from:", url);
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
        AppState.products = res.products.map(p => ({
            ...p,
            base_price: Number(p.base_price),
            discount_price: Number(p.discount_price),
            is_new: String(p.is_new).toUpperCase() === 'TRUE'
        }));
        AppState.inventory = res.inventory;
        AppState.config = res.config;
        finalizeInit();
    } catch (e) {
        console.warn("API Init failed, using mock data for testing", e);
        // Mock Data for Testing
        AppState.products = [
            {
                parent_code: "P001",
                sub_code: "P001-BLK",
                product_name: "Essential Tee",
                category: "T-Shirt",
                base_price: 150,
                discount_price: 120,
                discount_active: true,
                main_image_url: "https://drive.google.com/file/d/1yZkwb3_jfqXfq_t1f_9ggA-w2y2_x3_3/view?usp=sharing", // Example Drive Link
                color_name: "Black",
                color_hex: "#000000",
                variants: []
            },
            {
                parent_code: "P002",
                sub_code: "P002-WHT",
                product_name: "Classic Hoodie",
                category: "Hoodie",
                base_price: 300,
                discount_price: 0,
                discount_active: false,
                main_image_url: "https://drive.google.com/open?id=1yZkwb3_jfqXfq_t1f_9ggA-w2y2_x3_3", // Alternate Drive Link Format
                color_name: "White",
                color_hex: "#ffffff",
                variants: []
            }
        ];
        AppState.inventory = [
            { sub_code: "P001-BLK", size: "M", stock_qty: 10, sku_id: "SKU1" },
            { sub_code: "P002-WHT", size: "L", stock_qty: 5, sku_id: "SKU2" }
        ];
        AppState.config = {
            hero_slide_1_url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2070&auto=format&fit=crop',
            hero_slide_1_type: 'image',
            hero_slide_1_text: 'Elevate Your Style',
            hero_slide_1_subtext: 'Premium collection for the modern individual.',
            hero_slide_2_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
            hero_slide_2_type: 'video',
            hero_slide_2_text: 'Experience Freedom',
            hero_slide_2_subtext: '',
            hero_slide_3_url: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=2070&auto=format&fit=crop',
            hero_slide_3_type: 'image',
            hero_slide_3_text: 'Latest Drops',
            hero_slide_3_subtext: 'Shop the new season favorites.'
        };
        finalizeInit();
    }
}

function finalizeInit() {
    populateFilters();
    renderProductGrid();
    initHero();
    renderLatestDrops();
    if (AppState.user) fetchLikes();
}

// --- AUTH ---
function checkSession() {
    if (AppState.user) {
        document.getElementById('authIcon').className = "bi bi-person-fill";
        document.getElementById('authStatusDot').classList.remove('hidden');
    }
}
function handleAuthClick() { AppState.user ? openProfile() : openAuth(); }

// Profile Modal Logic
function openProfile() {
    if (!AppState.user) return;
    document.getElementById('profName').value = AppState.user.fullName;
    document.getElementById('profEmail').value = AppState.user.email;
    document.getElementById('profPhone').value = AppState.user.phone || "";
    document.getElementById('profileModal').classList.remove('hidden');
    document.getElementById('profileModal').classList.add('flex');
}
function closeProfile() {
    document.getElementById('profileModal').classList.add('hidden');
    document.getElementById('profileModal').classList.remove('flex');
}

async function handleUpdateProfile(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const txt = btn.innerText;

    // Password Validation
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
            // Clear passwords
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

function openAuth() { document.getElementById('authModal').classList.remove('hidden'); document.getElementById('authModal').classList.add('flex'); }
function closeAuth() { document.getElementById('authModal').classList.add('hidden'); document.getElementById('authModal').classList.remove('flex'); }
function switchAuth(mode) {
    ['loginForm', 'registerForm'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(`${mode}Form`).classList.remove('hidden');
}
function logoutUser() { localStorage.removeItem('faym_user'); location.reload(); }

async function handleRegister(e) {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById('regError');
    errEl.classList.add('hidden');

    // Validation: Min 6 chars
    const pw = f.password.value.trim();
    if (pw.length < 6) {
        errEl.innerText = "Password must be at least 6 characters.";
        errEl.classList.remove('hidden');
        return;
    }

    const btn = f.querySelector('button');
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
                    password: pw
                }
            })
        }).then(r => r.json());

        if (res.success) {
            alert('Account Created! Please Login.');
            switchAuth('login');
        } else {
            errEl.innerText = res.message;
            errEl.classList.remove('hidden');
        }
    } catch (e) { errEl.innerText = "Connection Error"; errEl.classList.remove('hidden'); }
    btn.innerText = txt; btn.disabled = false;
}

async function handleLogin(e) {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
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
            alert(res.message);
        }
    } catch (e) { alert("Login Error"); }
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
        // Check stock for this variant (all sizes)
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

// --- SEARCH ---
function toggleSearch() {
    const ol = document.getElementById('searchOverlay');
    const backdrop = document.getElementById('searchBackdrop');
    const drawer = document.getElementById('searchDrawer');
    const input = document.getElementById('searchInput');

    if (ol.classList.contains('hidden')) {
        // Open
        ol.classList.remove('hidden');
        // Force Reflow
        void ol.offsetWidth;

        backdrop.classList.remove('opacity-0');
        drawer.classList.remove('-translate-y-full');
        input.focus();
    } else {
        // Close
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

    const results = AppState.products.filter(p => {
        // Include safer checks
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

    // Close Overlay to show results on main grid
    if (!document.getElementById('searchOverlay').classList.contains('hidden')) {
        toggleSearch();
    }

    // Update Grid Title
    const titleEl = document.querySelector('main h2');
    const subTitleEl = document.querySelector('main span.text-brand-accent');
    const resetBtn = document.getElementById('gridResetBtn');

    if (q || cat !== 'all' || price !== 'all' || stockPos) {
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

    // Clear & Show Loading
    renderGalleryUI();

    if (varData.gallery_images) {
        const raw = varData.gallery_images;
        // Check if Folder URL or Comma List
        if (raw.includes('drive.google.com') && (raw.includes('/folders/') || raw.includes('id='))) {
            // Fetch
            try {
                const res = await fetch(`${API_URL}`, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'getGalleryImages', payload: { url: raw } })
                }).then(r => r.json());

                if (res.success && res.images.length > 0) {
                    // Add fetched images to gallery, filtering duplicates
                    res.images.forEach(img => {
                        if (formatImage(img) !== mainImg) currentGallery.push(formatImage(img));
                    });
                }
            } catch (e) { console.warn("Gallery Fetch Fail", e); }
        } else {
            // Comma List
            const list = raw.split(',').map(s => formatImage(s.trim())).filter(s => s && s !== mainImg);
            currentGallery.push(...list);
        }
    }
    renderGalleryUI();
}

function renderGalleryUI() {
    // 1. Update Main Image
    document.getElementById('modalImg').src = currentGallery[galleryIdx];

    // 2. Nav Buttons
    const prevBtn = document.getElementById('galleryPrevBtn');
    const nextBtn = document.getElementById('galleryNextBtn');
    if (currentGallery.length > 1) {
        prevBtn.classList.remove('hidden');
        nextBtn.classList.remove('hidden');
    } else {
        prevBtn.classList.add('hidden');
        nextBtn.classList.add('hidden');
    }

    // 3. Thumbnails
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

    // Init Gallery
    initGallery(currentVar);

    // Colors
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

    // Likes (Heart)
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
        btn.innerText = sz;
        btn.disabled = qty <= 0;
        // Style logic
        if (qty > 0) {
            btn.className = "py-3 rounded border text-sm font-semibold hover:border-black hover:bg-black hover:text-white transition";
            btn.onclick = () => {
                // Clear selection
                Array.from(sDiv.children).forEach(c => { if (!c.disabled) c.className = "py-3 rounded border text-sm font-semibold hover:border-black hover:bg-black hover:text-white transition"; });
                btn.className = "py-3 rounded border text-sm font-semibold bg-black text-white border-black shadow-md";

                selSize = { size: sz, sku: item.sku_id, max: qty };
                const addBtn = document.getElementById('addToCartBtn');
                addBtn.disabled = false;
                addBtn.className = "w-full py-4 bg-black text-white font-bold rounded-lg transition-all text-sm uppercase hover:scale-[1.01] shadow-lg";
                addBtn.innerText = `Add - ${AppState.currency}${currentVar.discount_active ? currentVar.discount_price : currentVar.base_price}`;
            };
        } else {
            btn.className = "py-3 rounded border text-sm font-semibold bg-gray-50 text-gray-300 cursor-not-allowed";
        }
        sDiv.appendChild(btn);
    });

    // Reset Add
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
    // Async update
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
function rmCart(i) { if (confirm('Remove item?')) { AppState.cart.splice(i, 1); saveCart(); } }
function checkout() { if (AppState.cart.length > 0) alert("Proceeding to Checkout..."); }
function toggleCart() {
    const d = document.getElementById('cartDrawer');
    d.classList.toggle('translate-x-full');
    document.getElementById('cartBackdrop').classList.toggle('hidden');
    setTimeout(() => document.getElementById('cartBackdrop').classList.toggle('opacity-0'), 10);
}
// --- OTHER UI ---
let heroInterval;
function initHero() {
    const con = document.getElementById('sliderContainer');
    const titleEl = document.getElementById('heroTitle');
    const subTitleEl = document.getElementById('heroSubtext');
    const ctaBtn = document.getElementById('heroBtn');

    // 1. Gather Slides
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

    // 2. Render Slides DOM
    // Uses translateX for sliding. Initial state: Index 0 is visible (0%), others hidden (100%).
    const slidesHtml = slides.map((s, i) => {
        const media = s.type === 'video'
            ? `<video src="${s.url}" class="w-full h-full object-cover" muted loop playsinline></video>`
            : `<img src="${s.url}" class="w-full h-full object-cover">`;

        // Initial Styles
        const style = i === 0 ? 'transform: translateX(0); z-index: 10; opacity: 1;' : 'transform: translateX(100%); z-index: 0; opacity: 0;';

        return `<div class="absolute inset-0 transition-transform duration-500 ease-in-out bg-gray-100" style="${style}" data-index="${i}">
                    ${media}
                    <div class="absolute inset-0 bg-black/20"></div>
                </div>`;
    }).join('');

    // 3. Render Controls (Arrows & Dots)
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

    // 4. Setup State & Logic
    let curIdx = 0;
    let isAnimating = false;

    // Helper to update text
    const updateText = (idx) => {
        const txt = slides[idx].text;
        const sub = slides[idx].subtext;

        // Fade Out
        titleEl.style.opacity = '0';
        if (subTitleEl) subTitleEl.style.opacity = '0';

        setTimeout(() => {
            // Update Content
            titleEl.innerText = txt;
            if (subTitleEl) {
                subTitleEl.innerText = sub;
                if (!sub) subTitleEl.style.display = 'none';
                else subTitleEl.style.display = 'block';
            }

            // Fade In
            titleEl.style.opacity = '1';
            if (subTitleEl && sub) subTitleEl.style.opacity = '1';
        }, 500);

        // Update Dots
        const dots = document.getElementById('heroDots').children;
        Array.from(dots).forEach((dot, i) => {
            dot.className = i === idx
                ? "h-1.5 rounded-full transition-all duration-300 w-8 bg-white"
                : "h-1.5 rounded-full transition-all duration-300 w-1.5 bg-white/50 hover:bg-white";
        });
    };

    // Initialize Text
    updateText(0);
    ctaBtn.classList.remove('opacity-0');

    // Slide Transition Logic
    const transitionSlide = (nextIdx, direction) => {
        if (isAnimating || nextIdx === curIdx) return;
        isAnimating = true;

        const slideEls = Array.from(con.children).filter(el => el.hasAttribute('data-index'));
        const currEl = slideEls[curIdx];
        const nextEl = slideEls[nextIdx];

        // Videos
        const nextVid = nextEl.querySelector('video');
        if (nextVid) nextVid.play().catch(() => { });

        // Determine positions
        // Next: Curr (-100%), Next starts (100%) -> (0%)
        // Prev: Curr (100%), Next starts (-100%) -> (0%)
        const startPos = direction === 'next' ? '100%' : '-100%';
        const endPos = direction === 'next' ? '-100%' : '100%';

        // Prepare Next Slide (Instant)
        nextEl.style.transition = 'none';
        nextEl.style.transform = `translateX(${startPos})`;
        nextEl.style.zIndex = '20';
        nextEl.style.opacity = '1';

        // Force Reflow
        void nextEl.offsetWidth;

        // Animate (Restore Transition)
        const transitionStyle = 'transform 0.5s ease-in-out';
        currEl.style.transition = transitionStyle;
        nextEl.style.transition = transitionStyle;

        // Execute Move
        requestAnimationFrame(() => {
            currEl.style.transform = `translateX(${endPos})`;
            nextEl.style.transform = `translateX(0)`;
        });

        // Cleanup
        setTimeout(() => {
            currEl.style.zIndex = '0';
            currEl.style.opacity = '0'; // Hide
            const currVid = currEl.querySelector('video');
            if (currVid) { currVid.pause(); currVid.currentTime = 0; }

            isAnimating = false;
        }, 500); // Match duration

        curIdx = nextIdx;
        updateText(curIdx);
    };

    // Globalize jump
    window.jumpToSlide = (idx) => {
        if (idx === curIdx) return;
        // Logic: if target > current, assume next, else prev
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

    // Bind Buttons
    const nextBtn = document.getElementById('heroNext');
    const prevBtn = document.getElementById('heroPrev');
    if (nextBtn) nextBtn.onclick = () => { nextSlide(); resetTimer(); };
    if (prevBtn) prevBtn.onclick = () => { prevSlide(); resetTimer(); };

    // Auto Play
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

    // 5. Touch / Swipe Support
    // 5. Touch / Swipe Support (Active Tracking)
    let touchStartX = 0;
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

        // Prepare neighbors
        const slideEls = Array.from(con.children).filter(el => el.hasAttribute('data-index'));
        const prevIdx = (curIdx - 1 + slides.length) % slides.length;
        const nextIdx = (curIdx + 1) % slides.length;
        const currEl = slideEls[curIdx];
        const prevEl = slideEls[prevIdx];
        const nextEl = slideEls[nextIdx];

        // Disable transitions for instant tracking
        [currEl, prevEl, nextEl].forEach(el => el.style.transition = 'none');

        // Position neighbors invisible but ready
        prevEl.style.transform = 'translateX(-100%)';
        prevEl.style.opacity = '1';
        prevEl.style.zIndex = '5';

        nextEl.style.transform = 'translateX(100%)';
        nextEl.style.opacity = '1';
        nextEl.style.zIndex = '5';

        // Current stays on top
        currEl.style.zIndex = '10';
    };

    heroSec.ontouchmove = (e) => {
        if (!isDragging) return;
        const cx = e.changedTouches[0].clientX;
        const cy = e.changedTouches[0].clientY;
        const diffX = cx - touchStartX;
        const diffY = cy - touchStartY;

        // Lock scroll if mostly horizontal
        if (Math.abs(diffX) > Math.abs(diffY)) e.preventDefault();

        currentDragX = cx;

        const slideEls = Array.from(con.children).filter(el => el.hasAttribute('data-index'));
        const prevIdx = (curIdx - 1 + slides.length) % slides.length;
        const nextIdx = (curIdx + 1) % slides.length;

        const currEl = slideEls[curIdx];
        const prevEl = slideEls[prevIdx];
        const nextEl = slideEls[nextIdx];

        // Move Current
        currEl.style.transform = `translateX(${diffX}px)`;

        // Move Neighbors
        if (diffX < 0) {
            // Dragging Left -> showing Next
            nextEl.style.transform = `translateX(calc(100% + ${diffX}px))`;
        } else {
            // Dragging Right -> showing Prev
            prevEl.style.transform = `translateX(calc(-100% + ${diffX}px))`;
        }
    };

    heroSec.ontouchend = (e) => {
        if (!isDragging) return;
        isDragging = false;
        const diff = currentDragX - touchStartX;
        const threshold = 50;

        // Restore Transitions
        const slideEls = Array.from(con.children).filter(el => el.hasAttribute('data-index'));
        const prevIdx = (curIdx - 1 + slides.length) % slides.length;
        const nextIdx = (curIdx + 1) % slides.length;
        const currEl = slideEls[curIdx];
        const prevEl = slideEls[prevIdx];
        const nextEl = slideEls[nextIdx];

        const trans = 'transform 0.5s ease-in-out';
        [currEl, prevEl, nextEl].forEach(el => el.style.transition = trans);

        if (Math.abs(diff) > threshold) {
            // Complete the Move
            isAnimating = true;
            if (diff < 0) {
                // Next
                requestAnimationFrame(() => {
                    currEl.style.transform = 'translateX(-100%)';
                    nextEl.style.transform = 'translateX(0)';
                });
                finishSwipe(nextIdx);
            } else {
                // Prev
                requestAnimationFrame(() => {
                    currEl.style.transform = 'translateX(100%)';
                    prevEl.style.transform = 'translateX(0)';
                });
                finishSwipe(prevIdx);
            }
        } else {
            // Revert / Snap Back
            requestAnimationFrame(() => {
                currEl.style.transform = 'translateX(0)';
                prevEl.style.transform = 'translateX(-100%)';
                nextEl.style.transform = 'translateX(100%)';
            });
            // Cleanup Neighbor Opacity after snap
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
                    el.style.opacity = '0'; // Hide others
                } else {
                    el.style.zIndex = '10'; // Active
                    el.style.opacity = '1';
                }
            });
            // Pause/Reset Videos of OLD slide
            const oldVid = slideEls[curIdx].querySelector('video');
            if (oldVid) { oldVid.pause(); oldVid.currentTime = 0; }

            // Play Video of NEW slide
            const newVid = slideEls[targetIdx].querySelector('video');
            if (newVid) newVid.play().catch(() => { });

            isAnimating = false;
            curIdx = targetIdx;
            updateText(curIdx);
        }, 500);
    };

    // Pause on Hover
    heroSec.onmouseenter = () => clearInterval(heroInterval);
    heroSec.onmouseleave = startCycle;
}
function scrollToGrid() { document.getElementById('productGrid').scrollIntoView({ behavior: 'smooth' }); }

// Size Guide
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
