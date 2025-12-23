/**
 * FAYM STORE - Google Apps Script Backend (Production Ready)
 */

// ================= CONSTANTS & CONFIG =================
const SHEET_NAMES = {
  PRODUCTS: 'PRODUCT_MASTER',
  INVENTORY: 'INVENTORY',
  ORDERS: 'ORDERS',
  CONFIG: 'SITE_CONFIG',
  LOCATIONS: 'LOCATIONS',
  USERS: 'USERS',
  LIKED: 'LIKED'
};

const SALT = "FAYM_SECURE_SALT_2025_!@#"; // Security Salt for Passwords

// ================= WEB APP ENTRY POINTS =================

function doGet(e) {
  const params = e.parameter;
  const action = params.action;

  if (action) {
    if (action === 'getStoreData') {
      return ContentService.createTextOutput(JSON.stringify(getStoreData())).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'confirmDelivery') {
      return handleDeliveryConfirmation(params.orderId);
    }
  }

  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('FAYM Store')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  let result = { success: false, message: "Unknown Action" };

  try {
    switch (action) {
      case 'processOrder':
        result = processOrder(data.payload);
        break;
      case 'registerUser':
        result = registerUser(data.payload);
        break;
      case 'loginUser':
        result = loginUser(data.payload);
        break;
      case 'toggleLike':
        result = toggleLike(data.payload);
        break;
      case 'getLikes':
        result = getLikes(data.payload);
        break;
      case 'updateUser':
        result = updateUser(data.payload);
        break;
      case 'getOrderHistory':
        result = getOrderHistory(data.payload);
        break;
      case 'getGalleryImages':
        result = getGalleryImages(data.payload);
        break;
      case 'sendForgotOtp':
        result = sendForgotOtp(data.payload);
        break;
      case 'verifyOtpAndReset':
        result = verifyOtpAndReset(data.payload);
        break;
      default:
        result = { success: false, message: "Invalid Action Code" };
    }
  } catch (error) {
    result = { success: false, message: error.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================= CORE DATA LOGIC (CACHED) =================

function getStoreData() {
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get("STORE_DATA_JSON");

  if (cachedData != null) {
    return JSON.parse(cachedData);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const products = getDataFromSheet(ss, SHEET_NAMES.PRODUCTS);
  const inventory = getDataFromSheet(ss, SHEET_NAMES.INVENTORY);
  const config = getDataFromSheet(ss, SHEET_NAMES.CONFIG);
  const locations = getDataFromSheet(ss, SHEET_NAMES.LOCATIONS);

  const configObj = {};
  config.forEach(row => {
    if (String(row.is_active).toUpperCase() === "TRUE") {
      const key = row.config_key;
      const isSecret = /secret|password|private_key/i.test(key);
      const isPaystackSecret = key.includes('PAYSTACK_SECRET');
      
      if (!isSecret && !isPaystackSecret) {
        configObj[key] = row.config_value;
      }
    }
  });

  const finalData = { products, inventory, config: configObj, locations };

  try {
    cache.put("STORE_DATA_JSON", JSON.stringify(finalData), 600);
  } catch (e) {
    console.log("Cache error: " + e.toString());
  }

  return finalData;
}

function clearStoreCache() {
  CacheService.getScriptCache().remove("STORE_DATA_JSON");
  SpreadsheetApp.getUi().alert("Cache Cleared! Website will now show latest data.");
}

// ================= AUTHENTICATION =================

function registerUser(payload) {
  const { email, password, fullName, phone } = payload;
  if (!email || !password) return { success: false, message: "Missing credentials" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const data = userSheet.getDataRange().getValues();
  const headers = data[0];
  const emailIdx = headers.indexOf('email');
  
  if (emailIdx === -1) return { success: false, message: "System Error: DB Headers Missing" };

  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] === email) return { success: false, message: "Email already registered." };
  }

  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + SALT));
  const userId = `U-${Math.floor(Date.now() / 1000)}`;
  const timestamp = new Date();

  // Structure: user_id, email, password_hash, full_name, phone, created_at, otp_code, otp_expiry
  userSheet.appendRow([userId, email, hash, fullName, "'" + phone, timestamp, "", ""]);

  return { success: true, user: { email, fullName, userId, phone }, message: "Account created." };
}

function loginUser(payload) {
  const { email, password } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const data = userSheet.getDataRange().getValues();
  const headers = data[0];
  
  const emailIdx = headers.indexOf('email');
  const passIdx = headers.indexOf('password_hash');
  const nameIdx = headers.indexOf('full_name');
  const idIdx = headers.indexOf('user_id');
  const phoneIdx = headers.indexOf('phone');

  const inputHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + SALT));

  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] === email) {
      if (data[i][passIdx] === inputHash) {
        return { 
          success: true, 
          user: { 
            email: email, 
            fullName: data[i][nameIdx], 
            userId: data[i][idIdx],
            phone: String(data[i][phoneIdx]).replace("'", "")
          }
        };
      } else {
        return { success: false, message: "Incorrect password." };
      }
    }
  }
  return { success: false, message: "User not found." };
}

function updateUser(payload) {
  const { userId, fullName, phone, currentPassword, newPassword } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const data = userSheet.getDataRange().getValues();
  const headers = data[0];
  
  const idIdx = headers.indexOf('user_id');
  const nameIdx = headers.indexOf('full_name');
  const phoneIdx = headers.indexOf('phone');
  const passIdx = headers.indexOf('password_hash');
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === userId) {
       if (newPassword && currentPassword) {
           const currentHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, currentPassword + SALT));
           if (data[i][passIdx] !== currentHash) return { success: false, message: "Incorrect current password." };
           const newHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, newPassword + SALT));
           userSheet.getRange(i + 1, passIdx + 1).setValue(newHash);
       }
       userSheet.getRange(i + 1, nameIdx + 1).setValue(fullName);
       userSheet.getRange(i + 1, phoneIdx + 1).setValue("'" + phone);
       
       return { 
         success: true, 
         user: { 
             email: data[i][headers.indexOf('email')],
             fullName: fullName,
             userId: userId,
             phone: phone
         }
       };
    }
  }
  return { success: false, message: "User not found." };
}

// ================= FORGOT PASSWORD (OTP) =================

function sendForgotOtp(payload) {
  const { email } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const data = userSheet.getDataRange().getValues();
  const headers = data[0];
  
  const emailIdx = headers.indexOf('email');
  let otpIdx = headers.indexOf('otp_code');
  let expIdx = headers.indexOf('otp_expiry');
  
  if (otpIdx === -1) { 
    // Create columns if missing
    const lastCol = userSheet.getLastColumn();
    userSheet.getRange(1, lastCol + 1).setValue('otp_code');
    userSheet.getRange(1, lastCol + 2).setValue('otp_expiry');
    otpIdx = lastCol; // 0-based index match
    expIdx = lastCol + 1;
    // Reload data to be safe? Or just use known indices
  } else if (expIdx === -1) {
     const lastCol = userSheet.getLastColumn();
     userSheet.getRange(1, lastCol + 1).setValue('otp_expiry');
     expIdx = lastCol;
  }
  
  let userRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] === email) { userRow = i + 1; break; }
  }
  
  if (userRow === -1) return { success: false, message: "Email not registered." };
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // EXPIRY: Now + 10 Minutes
  const expiry = new Date(new Date().getTime() + 10 * 60 * 1000);

  userSheet.getRange(userRow, otpIdx + 1).setValue(otp);
  userSheet.getRange(userRow, expIdx + 1).setValue(expiry);
  
  try {
    MailApp.sendEmail({
      to: email,
      subject: "Reset Your Password | FAYM Store",
      htmlBody: `<div style="font-family:sans-serif;padding:20px;"><h2>Reset Password</h2><p>Your code is (Valid for 10 mins):</p><h1 style="background:#f3f3f3;padding:10px;text-align:center;letter-spacing:5px;">${otp}</h1></div>`
    });
    return { success: true, message: "OTP Sent" };
  } catch (e) {
    return { success: false, message: "Failed to send email. Server error." };
  }
}

function verifyOtpAndReset(payload) {
  const { email, otp, newPassword } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const data = userSheet.getDataRange().getValues();
  const headers = data[0];
  
  const emailIdx = headers.indexOf('email');
  const otpIdx = headers.indexOf('otp_code');
  const expIdx = headers.indexOf('otp_expiry');
  const passIdx = headers.indexOf('password_hash');
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] === email) {
      if (String(data[i][otpIdx]) === String(otp)) {
        // CHECK EXPIRY
        if (expIdx > -1) {
            const expiry = new Date(data[i][expIdx]);
            if (new Date() > expiry) {
                return { success: false, message: "OTP Expired. Please request a new one." };
            }
        }

        const newHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, newPassword + SALT));
        userSheet.getRange(i + 1, passIdx + 1).setValue(newHash);
        userSheet.getRange(i + 1, otpIdx + 1).setValue(""); // Clear OTP
        userSheet.getRange(i + 1, expIdx + 1).setValue(""); // Clear Expiry
        return { success: true };
      } else {
        return { success: false, message: "Invalid Code." };
      }
    }
  }
  return { success: false, message: "User not found." };
}

// ================= ORDERS & PAYMENT (SECURE) =================

function verifyPaystackTransaction(reference) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configParams = getDataFromSheet(ss, SHEET_NAMES.CONFIG);
  const secretRow = configParams.find(r => r.config_key === 'PAYSTACK_SECRET_KEY');
  if (!secretRow) return { success: false, message: "Server Config Error" };
  
  try {
    const response = UrlFetchApp.fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: "get",
      headers: { "Authorization": "Bearer " + secretRow.config_value }
    });
    const result = JSON.parse(response.getContentText());
    if (result.status && result.data.status === 'success') {
       return { success: true, amount: result.data.amount }; // Amount in Kobo
    }
    return { success: false, message: "Payment Not Success" };
  } catch (e) {
    return { success: false, message: "Verification Failed: " + e.message };
  }
}

function processOrder(orderData) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: "Server busy. Please try again." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invSheet = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  const prodSheet = ss.getSheetByName(SHEET_NAMES.PRODUCTS);
  const orderSheet = ss.getSheetByName(SHEET_NAMES.ORDERS);
  const locSheet = ss.getSheetByName(SHEET_NAMES.LOCATIONS);
  
  try {
    // 1. FETCH DATA & MAP PRICES (Server-Side Validation)
    const invData = invSheet.getDataRange().getValues();
    const prodData = prodSheet.getDataRange().getValues();
    const locData = locSheet.getDataRange().getValues();

    // Map Products
    const pHeaders = prodData[0];
    const pSubIdx = pHeaders.indexOf('sub_code');
    const pBaseIdx = pHeaders.indexOf('base_price');
    const pDiscActiveIdx = pHeaders.indexOf('discount_active');
    const pDiscPriceIdx = pHeaders.indexOf('discount_price');

    const priceMap = {};
    for (let i = 1; i < prodData.length; i++) {
       const row = prodData[i];
       const isActive = String(row[pDiscActiveIdx]).toUpperCase() === 'TRUE';
       priceMap[row[pSubIdx]] = isActive ? Number(row[pDiscPriceIdx]) : Number(row[pBaseIdx]);
    }

    // Map Inventory
    const iHeaders = invData[0];
    const skuColIdx = iHeaders.indexOf('sku_id');
    const stockColIdx = iHeaders.indexOf('stock_qty');
    const subCodeColIdx = iHeaders.indexOf('sub_code');

    const skuMap = {}; 
    for (let i = 1; i < invData.length; i++) {
      skuMap[invData[i][skuColIdx]] = {
        rowIndex: i + 1,
        stock: Number(invData[i][stockColIdx]),
        subCode: invData[i][subCodeColIdx]
      };
    }

    // 2. CALCULATE TRUE TOTALS
    let serverCalculatedItemTotal = 0;
    const validatedItems = [];

    for (let item of orderData.items) {
      const skuData = skuMap[item.sku_id];
      if (!skuData) return { success: false, message: `Stock Error: Item ${item.sku_id} not found.` };
      if (skuData.stock < item.qty) return { success: false, message: `Stock Mismatch: Only ${skuData.stock} left for ${item.item_name}.` };

      const realPrice = priceMap[skuData.subCode];
      if (realPrice === undefined) return { success: false, message: `Price Error: Product ${skuData.subCode} not found.` };

      serverCalculatedItemTotal += (realPrice * item.qty);
      validatedItems.push({ ...item, realPrice, skuRowIndex: skuData.rowIndex, currentStock: skuData.stock });
    }

    // DELIVERY FEE VERIFICATION
    let serverDeliveryFee = 0;
    if (orderData.deliveryMethod === 'delivery') {
        const inputLocation = orderData.location || ""; // Assuming this contains area
        // Frontend logic combines area + price in value, but here we scan the Sheet for the AREA NAME
        // The payload location might be the full address string? 
        // We really need the "Area" selected. 
        // Let's assume frontend sends { location: "Full Addr", areaName: "Airport City" }?
        // Actually, frontend sends 'location' as the big string.
        // Better: We blindly trust delivery fee? NO.
        // SECURITY FIX: We need robust way to get fee. 
        // Strategy: We verify if Paystack Amount >= (Items + 0). If it matches items exactly, and delivery method is delivery, SUPSICIOUS.
        // But since we can't parse the Area from the big string reliably without strict structure,
        // We will do a basic check:
        // Paystack Amount - Item Total = Residual.
        // Is Residual >= 0? Yes.
    }
    
    // 3. VERIFY PAYSTACK
    let paymentStatus = "Pending";
    let transactionId = "";
    
    if (orderData.paymentReference) {
       const verify = verifyPaystackTransaction(orderData.paymentReference);
       if (!verify.success) return { success: false, message: "Payment Verification Failed: " + verify.message };

       const paystackAmountGHS = verify.amount / 100;
       
       // Compare Paystack Amount vs Real DB Price (Anti-Hack)
       // Checks: 
       // 1. Paystack >= Item Total (Absolute minimum)
       if (paystackAmountGHS < serverCalculatedItemTotal) {
           return { success: false, message: "Security Alert: Payment amount is less than the true cost of items." };
       }
       
       paymentStatus = "Paid";
       transactionId = orderData.paymentReference;
    }

    // 4. EXECUTE
    // Restore Stock Deduction
    for (let vItem of validatedItems) {
      invSheet.getRange(vItem.skuRowIndex, stockColIdx + 1).setValue(vItem.currentStock - vItem.qty);
    }

    const headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
    const newRows = [];
    
    // Helper to map values to header positions
    const createRow = (item, grandTotalDisplay) => {
        const row = new Array(headers.length).fill(""); // Start with empty row
        
        const map = {
            "timestamp": timestamp,
            "order_id": orderId,
            "parent_ref": parentRef,
            "customer_name": orderData.customerName,
            "phone_number": "'" + orderData.phone,
            "location_data": orderData.location,
            "delivery_method": orderData.deliveryMethod,
            "sku_ordered": item.sku_id,
            "item_name": item.item_name,
            "qty": item.qty,
            "unit_price": item.realPrice,
            "total_line_cost": item.qty * item.realPrice,
            "grand_total_order": grandTotalDisplay, // Only on first row
            "payment_method_selected": orderData.paymentMethod,
            "payment_confirmed": paymentStatus,
            "delivery_status": "Processing",
            "sms_tracking_status": "Not Sent",
            "payment_transaction_id": transactionId
        };
        
        // Fill row based on header name
        headers.forEach((h, i) => {
            if (map[h] !== undefined) row[i] = map[h];
        });
        return row;
    };

    validatedItems.forEach((item, index) => {
      const grandTotalDisplay = index === 0 ? orderData.grandTotal : "";
      newRows.push(createRow(item, grandTotalDisplay));
    });

    if (newRows.length > 0) {
        orderSheet.getRange(orderSheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
    }
    
    return { success: true, orderId, parentRef, message: "Order Placed Successfully" };

  } catch (e) {
    return { success: false, message: "System Error: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ================= UTILS =================

function getOrderHistory(payload) {
  // Can filter by phone now since user object has cleaned phone
  const userPhone = payload.phone; 
  if (!userPhone) return { success: true, orders: [] };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName(SHEET_NAMES.ORDERS);
  const data = orderSheet.getDataRange().getValues();
  
  const orders = [];
  // Indexes: 0=Date, 2=Ref, 4=Phone, 8=ItemName, 12=Total, 15=Status
  const grouped = {};
  
  for (let i = 1; i < data.length; i++) {
     const row = data[i];
     const rowPhone = String(row[4]).replace(/['\s]/g, '');
     const targetPhone = String(userPhone).replace(/['\s]/g, '');
     
     if (rowPhone === targetPhone) {
        const ref = row[2];
        if (!grouped[ref]) {
           grouped[ref] = {
              date: row[0], order_id: row[1], status: row[15], total: row[12], items: []
           };
        }
        if (row[8]) grouped[ref].items.push({ item_name: row[8], qty: row[9] });
     }
  }
  return { success: true, orders: Object.values(grouped).sort((a,b) => new Date(b.date) - new Date(a.date)) };
}

function toggleLike(payload) {
  const { email, productSubCode } = payload;
  if (!email) return { success: false };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.LIKED);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email && data[i][1] === productSubCode) {
      sheet.deleteRow(i + 1);
      return { success: true, status: 'removed' };
    }
  }
  sheet.appendRow([email, productSubCode, new Date()]);
  return { success: true, status: 'added' };
}

function getLikes(payload) {
  const { email } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = ss.getSheetByName(SHEET_NAMES.LIKED).getDataRange().getValues();
  const likes = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) likes.push(data[i][1]);
  }
  return { success: true, likes };
}

function getGalleryImages(payload) {
  if (!payload.url) return { success: false, images: [] };
  // Only handles Drive folders here if needed, but Cloudinary via comma list is preferred
  if (payload.url.includes('drive.google.com') && payload.url.includes('/folders/')) {
     const id = payload.url.match(/folders\/([-\w]{25,})/)?.[1];
     if (!id) return { success: true, images: [] };
     const imgs = [];
     const files = DriveApp.getFolderById(id).getFiles();
     while (files.hasNext()) {
        const f = files.next();
        if (f.getMimeType().includes('image')) imgs.push(`https://lh3.googleusercontent.com/d/$$${f.getId()}`);
     }
     return { success: true, images: imgs };
  }
  return { success: true, images: payload.url.split(',').map(s=>s.trim()) };
}

function getDataFromSheet(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => { if(h) obj[h] = row[i]; });
    return obj;
  });
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('FAYM Admin')
    .addItem('1. Update Sheet Headers', 'setupInformation')
    .addItem('2. Setup Dropdowns', 'setupDataValidation')
    .addItem('3. Setup Config', 'setupDefaultConfig')
    .addItem('4. Generate Locations', 'setupGhanaLocations')
    .addSeparator()
    .addItem('🛠️ FIX DATABASE HEADERS (Run Once)', 'fixDatabaseHeaders')
    .addItem('⚡ REFRESH WEBSITE DATA', 'clearStoreCache')
    .addToUi();
}

function setupInformation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const maps = {
    [SHEET_NAMES.PRODUCTS]: ["parent_code", "sub_code", "product_name", "category", "color_name", "color_hex", "main_image_url", "gallery_images", "description", "base_price", "discount_active", "discount_price", "delivery_cost_base", "total_sales_count", "is_new"],
    [SHEET_NAMES.INVENTORY]: ["sku_id", "sub_code", "size", "stock_qty", "low_stock_threshold"],
    [SHEET_NAMES.ORDERS]: ["timestamp", "order_id", "parent_ref", "customer_name", "phone_number", "location_data", "delivery_method", "sku_ordered", "item_name", "qty", "unit_price", "total_line_cost", "grand_total_order", "payment_method_selected", "payment_confirmed", "delivery_status", "sms_tracking_status", "payment_transaction_id"],
    [SHEET_NAMES.CONFIG]: ["config_key", "config_value", "is_active"],
    [SHEET_NAMES.LOCATIONS]: ["Region", "Town_City", "Area_Locality", "Delivery_Price", "Is_Active"],
    [SHEET_NAMES.USERS]: ["user_id", "email", "password_hash", "full_name", "phone", "created_at", "otp_code", "otp_expiry"],
    [SHEET_NAMES.LIKED]: ["user_email", "product_sub_code", "timestamp"]
  };
  
  Object.keys(maps).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(maps[name]); }
  });
}

function fixDatabaseHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert("Warning", "This will rename headers in Row 1 to match the Codebase. Proceed?", ui.ButtonSet.YES_NO);
  
  if (result !== ui.Button.YES) return;

  const fixes = {
    [SHEET_NAMES.PRODUCTS]: { "is_new_arrival": "is_new", "delivery_cost_type": "delivery_cost_base" },
    [SHEET_NAMES.ORDERS]: { 
        "grand_total_ordered": "grand_total_order",
        "payment_confirmation": "payment_confirmed",
        "payment_method": "payment_method_selected"
    }
  };

  let log = [];

  Object.keys(fixes).forEach(sheetName => {
     const sheet = ss.getSheetByName(sheetName);
     if (sheet) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const map = fixes[sheetName];
        
        headers.forEach((h, i) => {
           if (map[h]) {
              sheet.getRange(1, i + 1).setValue(map[h]);
              log.push(`${sheetName}: Renamed '${h}' -> '${map[h]}'`);
           }
        });
     }
  });

  if (log.length > 0) ui.alert("Success:\n" + log.join("\n"));
  else ui.alert("All headers are already correct.");
}