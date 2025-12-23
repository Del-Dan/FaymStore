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

// --- TOAST NOTIFICATIONS ---
function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const div = document.createElement('div');
    const color = type === 'error' ? 'bg-red-500' : 'bg-brand-dark';
    
    div.className = `${color} text-white px-6 py-4 rounded shadow-2xl flex items-center gap-3 min-w-[300px] toast-enter`;
    div.innerHTML = `<i class="bi ${type === 'error' ? 'bi-exclamation-circle' : 'bi-check-circle-fill'} text-xl"></i><span class="font-bold text-sm">${msg}</span>`;
    
    container.appendChild(div);
    requestAnimationFrame(() => { div.classList.remove('toast-enter'); div.classList.add('toast-enter-active'); });
    setTimeout(() => {
        div.classList.remove('toast-enter-active'); div.classList.add('toast-exit-active');
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

const formatImage = (url) => {
    if (!url) return 'https://via.placeholder.com/400x500?text=No+Image';
    if (url.includes('cloudinary.com')) {
        if (url.includes('f_auto') || url.includes('q_auto')) return url;
        return url.replace('/upload/', '/upload/f_auto,q_auto/');
    }
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
        const match = url.match(/(?:\/d\/|id=)([-\w]{25,})/);
        if (match && match[1]) return `https://lh3.googleusercontent.com/d/$${match[1]}=s1000`;
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
        AppState.locations = res.locations;
        finalizeInit();
    } catch (e) {
        document.getElementById('productGrid').innerHTML = `<div class="col-span-full py-20 text-center"><h2 class="text-xl font-bold">Connection Failed</h2><button onclick="location.reload()" class="underline mt-2">Retry</button></div>`;
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
    const rawPhone = AppState.user.phone || "";
    document.getElementById('profPhone').value = rawPhone.replace("'", ""); 
    
    document.getElementById('profileModal').classList.remove('hidden');
    document.getElementById('profileModal').classList.add('flex');
    switchProfileTab('details');
}

function switchProfileTab(tab) {
    const tabs = { details: 'tabDetails', orders: 'tabOrders', saved: 'tabSaved' };
    const panes = { details: 'paneDetails', orders: 'paneOrders', saved: 'paneSaved' };

    Object.keys(tabs).forEach(k => {
        const btn = document.getElementById(tabs[k]);
        const pane = document.getElementById(panes[k]);
        if (k === tab) {
            btn.className = "pb-2 text-sm font-bold border-b-2 border-black transition";
            btn.classList.remove('text-gray-400');
            pane.classList.remove('hidden');
        } else {
            btn.className = "pb-2 text-sm font-bold text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition";
            pane.classList.add('hidden');
        }
    });

    if (tab === 'orders') loadOrderHistory();
    if (tab === 'saved') renderFavorites();
}

function renderFavorites() {
    const div = document.getElementById('savedList');
    div.innerHTML = '';
    
    if (AppState.favorites.length === 0) {
        div.innerHTML = `<div class="text-center py-8 text-gray-500"><i class="bi bi-heart text-4xl mb-2 block"></i><p>No saved items.</p></div>`;
        return;
    }

    const favItems = AppState.products.filter(p => AppState.favorites.includes(p.sub_code));
    
    favItems.forEach(item => {
        div.innerHTML += `
            <div class="flex gap-4 border p-2 rounded cursor-pointer hover:bg-gray-50" onclick="openProductModalFromCode('${item.parent_code}', '${item.sub_code}')">
                <img src="${formatImage(item.main_image_url)}" class="w-16 h-20 object-cover rounded">
                <div>
                    <h4 class="font-bold text-sm">${item.product_name}</h4>
                    <p class="text-xs text-gray-500">${item.category} | ${item.color_name}</p>
                    <p class="font-bold text-sm mt-1">${AppState.currency}${item.discount_active ? item.discount_price : item.base_price}</p>
                </div>
            </div>
        `;
    });
}

function openProductModalFromCode(parentCode, subCode) {
    const p = AppState.products.find(x => x.sub_code === subCode);
    if(p) { openProductModal(p); closeProfile(); }
}

// --- FORGOT PASSWORD ---
function openForgotPass() { switchAuth('forgot'); document.getElementById('forgotStep1').classList.remove('hidden'); document.getElementById('forgotStep2').classList.add('hidden'); }

async function handleForgotPassStep1(e) {
    e.preventDefault();
    const email = document.getElementById('fpEmail').value.trim();
    if(!email) return showToast("Enter email", "error");
    
    const btn = e.target.querySelector('button');
    btn.innerText = "Sending..."; btn.disabled = true;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'sendForgotOtp', payload: { email } })
        }).then(r => r.json());

        if (res.success) {
            document.getElementById('forgotStep1').classList.add('hidden');
            document.getElementById('forgotStep2').classList.remove('hidden');
            showToast("Code Sent to Email");
        } else {
            showToast(res.message, "error");
        }
    } catch(e) { showToast("Connection Error", "error"); }
    btn.innerText = "Send OTP"; btn.disabled = false;
}

async function handleForgotPassStep2(e) {
    e.preventDefault();
    const email = document.getElementById('fpEmail').value.trim();
    const otp = document.getElementById('fpOtp').value.trim();
    const newPassword = document.getElementById('fpNewPass').value.trim();

    const btn = e.target.querySelector('button');
    btn.innerText = "Resetting..."; btn.disabled = true;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'verifyOtpAndReset', payload: { email, otp, newPassword } })
        }).then(r => r.json());

        if (res.success) {
            showToast("Password Reset! Please Login.");
            switchAuth('login');
        } else {
            showToast(res.message, "error");
        }
    } catch(e) { showToast("Error resetting", "error"); }
    btn.innerText = "Reset Password"; btn.disabled = false;
}

// --- CHECKOUT ---
function checkout() {
    if (AppState.cart.length === 0) return showToast("Your cart is empty.", "error");
    
    if (AppState.user) {
        document.getElementById('chkName').value = AppState.user.fullName || '';
        document.getElementById('chkEmail').value = AppState.user.email || '';
        document.getElementById('chkPhone').value = (AppState.user.phone || '').replace("'", "");
        document.getElementById('chkEmail').disabled = true;
    } else {
        document.getElementById('chkName').value = '';
        document.getElementById('chkEmail').value = '';
        document.getElementById('chkPhone').value = '';
        document.getElementById('chkEmail').disabled = false;
    }

    renderCheckoutItems();
    if (deliveryMethod === 'delivery') initZoneDropdowns();
    updateCheckoutTotals();
    document.getElementById('checkoutModal').classList.remove('hidden');
    document.getElementById('checkoutModal').classList.add('flex');
}

function renderCheckoutItems() {
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
}

function processPayment() {
    const name = document.getElementById('chkName').value.trim();
    const email = document.getElementById('chkEmail').value.trim();
    const phone = document.getElementById('chkPhone').value.trim();
    const address = deliveryMethod === 'delivery' ? document.getElementById('chkAddress').value : "Store Pickup";

    if (!name || !email || !phone || (deliveryMethod === 'delivery' && !address)) {
        return showToast("Please fill all contact fields.", "error");
    }

    const subtotal = AppState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const fee = deliveryMethod === 'delivery' ? deliveryFee : 0;
    const total = subtotal + fee;
    const paystackKey = AppState.config['PAYSTACK_PUBLIC_KEY'];

    if (!paystackKey) return showToast("Config Error: Missing Payment Key", "error");

    const handler = PaystackPop.setup({
        key: paystackKey,
        email: email,
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
                email: email,
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
                    price: c.price 
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
                    showToast("Order Confirmed!");
                    closeCheckout();
                    AppState.cart = [];
                    saveCart();
                } else {
                    showToast(data.message, "error");
                }
            })
            .catch(err => showToast("Network Error", "error"));
        },
        onClose: function () {
            showToast("Payment Cancelled", "error");
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
            if (qty < 5) btn.innerHTML = `${sz} <span class="block text-[9px] text-red-500 font-normal leading-none mt-0.5">Left: ${qty}</span>`;
            else btn.innerText = sz;

            btn.onclick = () => {
                Array.from(sDiv.children).forEach(c => { if (!c.disabled) c.className = "py-3 rounded border text-sm font-semibold hover:border-black hover:bg-black hover:text-white transition"; });
                btn.className = "py-3 rounded border text-sm font-semibold bg-black text-white border-black shadow-md";
                selSize = { size: sz, sku: item.sku_id, max: qty };
                document.getElementById('addToCartBtn').disabled = false;
                document.getElementById('addToCartBtn').className = "w-full py-4 bg-black text-white font-bold rounded-lg transition-all text-sm uppercase hover:scale-[1.01] shadow-lg";
                document.getElementById('addToCartBtn').innerText = `Add - ${AppState.currency}${currentVar.discount_active ? currentVar.discount_price : currentVar.base_price}`;
            };
        } else {
            btn.innerText = sz;
            btn.className = "py-3 rounded border text-sm font-semibold bg-gray-50 text-gray-300 cursor-not-allowed diagonal-strike opacity-50";
        }
        sDiv.appendChild(btn);
    });
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
        if (exist.qty < exist.maxQty) exist.qty++; else showToast("Max stock reached.", "error");
    } else {
        AppState.cart.push(item);
    }
    saveCart();
    const drawer = document.getElementById('cartDrawer');
    if (drawer && drawer.classList.contains('translate-x-full')) toggleCart();
    
    showToast("Added to Cart!");
}

async function handleLogin(e) {
    e.preventDefault();
    const f = e.target;
    if (!f.email.value.trim() || !f.password.value.trim()) return showToast("Fields required", "error");
    
    const btn = f.querySelector('button[type="submit"]');
    const txt = btn.innerText; btn.innerText = "Verifying..."; btn.disabled = true;

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
            showToast(res.message || "Invalid credentials", "error");
        }
    } catch (e) { showToast("Connection Error", "error"); }
    btn.innerText = txt; btn.disabled = false;
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

    // SWIPE SUPPORT
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

function logoutUser() {
    localStorage.removeItem('faym_user');
    location.reload();
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
            showToast('Account Created! Please Login.');
            switchAuth('login');
        } else {
            if (res.message.toLowerCase().includes('email')) showError(f.email, res.message);
            else showError(f.fullName, res.message);
        }
    } catch (e) { showError(f.fullName, "Connection Error"); }
    btn.innerText = txt; btn.disabled = false;
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

async function handleUpdateProfile(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const txt = btn.innerText;

    const currPass = document.getElementById('profCurrPass').value;
    const newPass = document.getElementById('profNewPass').value;
    const repPass = document.getElementById('profRepPass').value;

    if (newPass || repPass) {
        if (!currPass) return showToast("Please enter current password.", "error");
        if (newPass !== repPass) return showToast("New passwords do not match.", "error");
        if (newPass.length < 6) return showToast("Min 6 characters required.", "error");
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
            showToast("Profile Updated!");
            document.getElementById('profCurrPass').value = '';
            document.getElementById('profNewPass').value = '';
            document.getElementById('profRepPass').value = '';
            closeProfile();
        } else {
            showToast(res.message, "error");
        }
    } catch (e) { showToast("Connection Error", "error"); }
    btn.innerText = txt; btn.disabled = false;
}

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
        opt.value = t; opt.innerText = t;
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
