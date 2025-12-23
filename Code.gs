/**
 * FAYM STORE - Google Apps Script Backend (Phase 2 Update)
 * 
 * SERVES:
 * 1. Store Data (Products, Inventory, Config, Locations)
 * 2. Auth System (Register, Login, Password Reset)
 * 3. User Actions (Likes/Favorites)
 * 4. Order Processing (Inventory Locking)
 * 5. Delivery Confirmation
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

// ================= WEB APP ENTRY POINTS =================

function doGet(e) {
  const params = e.parameter;
  const action = params.action;

  // 1. If Action exists, serve API JSON
  if (action) {
    if (action === 'getStoreData') {
      return ContentService.createTextOutput(JSON.stringify(getStoreData())).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'confirmDelivery') {
      return handleDeliveryConfirmation(params.orderId);
    }
  }

  // 2. Default: Serve HTML (Web App UI)
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('FAYM Store')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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
      case 'submitPaymentDetails':
        result = submitPaymentDetails(data.payload);
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
        result = getLikes(data.payload); // payload = { email }
        break;
      case 'updateUser':
        result = updateUser(data.payload);
        break;
      case 'getOrderHistory':
        result = getOrderHistory(data.payload); // payload = { phone }
        break;
      case 'getGalleryImages':
        result = getGalleryImages(data.payload); // payload = { type: 'folder', url: '...' }
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


// ================= AUTHENTICATION LOGIC =================

function registerUser(payload) {
  const { email, password, fullName, phone } = payload;
  if (!email || !password) return { success: false, message: "Missing credentials" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const data = userSheet.getDataRange().getValues();
  
  // Check if email exists
  // Wait, let's use headers to be safe or standard index. Setup has: user_id, email, password_hash...
  // Use header finding for robustness
  const headers = data[0];
  const emailIdx = headers.indexOf('email');
  
  if (emailIdx === -1) return { success: false, message: "System Error: DB Headers Missing" };

  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] === email) return { success: false, message: "Email already registered." };
  }

  // Hash Password
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password));
  const userId = `U-${Math.floor(Date.now() / 1000)}`;
  const timestamp = new Date();

  // [user_id, email, password_hash, full_name, phone, created_at]
  userSheet.appendRow([userId, email, hash, fullName, "'" + phone, timestamp]);

  return { success: true, user: { email, fullName, userId }, message: "Account created." };
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

  const inputHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password));

  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] === email) {
      if (data[i][passIdx] === inputHash) {
        return { 
          success: true, 
          user: { 
            email: email, 
            fullName: data[i][nameIdx], 
            userId: data[i][idIdx] 
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
       
       // Handle Password Change if requested
       if (newPassword && currentPassword) {
           const currentHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, currentPassword));
           if (data[i][passIdx] !== currentHash) {
               return { success: false, message: "Incorrect current password." };
           }
           // Set New Hash
           const newHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, newPassword));
           userSheet.getRange(i + 1, passIdx + 1).setValue(newHash);
       } else if (newPassword && !currentPassword) {
           return { success: false, message: "Please provide current password to changes." };
       }

       // Update Info
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
  return { success: false, message: "User not found for update." };
}

// ================= FAVORITES / LIKES LOGIC =================

function toggleLike(payload) {
  // payload: { email, productSubCode }
  const { email, productSubCode } = payload;
  if (!email || !productSubCode) return { success: false };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const likeSheet = ss.getSheetByName(SHEET_NAMES.LIKED);
  const data = likeSheet.getDataRange().getValues(); 
  const headers = data[0];

  const emailIdx = headers.indexOf('user_email');
  const subCodeIdx = headers.indexOf('product_sub_code');

  if (emailIdx === -1 || subCodeIdx === -1) return { success: false, message: "System Error: Liked Headers Missing" };

  let rowIndex = -1;

  // Search if exists
  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] === email && data[i][subCodeIdx] === productSubCode) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > -1) {
    // Found -> Remove it
    likeSheet.deleteRow(rowIndex);
    return { success: true, status: 'removed' };
  } else {
    // Not found -> Add it
    likeSheet.appendRow([email, productSubCode, new Date()]);
    return { success: true, status: 'added' };
  }
}

function getLikes(payload) {
  const { email } = payload;
  if (!email) return { success: false, likes: [] };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const likeSheet = ss.getSheetByName(SHEET_NAMES.LIKED);
  const data = likeSheet.getDataRange().getValues();
  const headers = data[0];
  
  if (data.length <= 1) return { success: true, likes: [] };

  const emailIdx = headers.indexOf('user_email');
  const subCodeIdx = headers.indexOf('product_sub_code');

  if (emailIdx === -1 || subCodeIdx === -1) return { success: true, likes: [] }; // Fail safe

  const likes = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] === email) {
      likes.push(data[i][subCodeIdx]);
    }
  }
  return { success: true, likes: likes };
}


// ================= GALLERY LOGIC =================

function getGalleryImages(payload) {
  const { url } = payload;
  if (!url) return { success: false, images: [] };

  try {
    // Check if it's a folder URL
    if (url.includes('drive.google.com') && (url.includes('/folders/') || url.includes('id='))) {
      return { success: true, images: fetchImagesFromDriveFolder(url) };
    } 
    // Otherwise assume comma-separated string
    else {
       const images = url.split(',').map(s => s.trim()).filter(s => s);
       return { success: true, images: images };
    }
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function fetchImagesFromDriveFolder(folderUrl) {
  // Extract ID
  let folderId = "";
  const folderRegex = /\/folders\/([-\w]{25,})/;
  const idRegex = /id=([-\w]{25,})/;
  
  const match1 = folderUrl.match(folderRegex);
  const match2 = folderUrl.match(idRegex);
  
  if (match1) folderId = match1[1];
  else if (match2) folderId = match2[1];
  
  if (!folderId) return [];

  const images = [];
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  
  while (files.hasNext()) {
    const file = files.next();
    const mime = file.getMimeType();
    if (mime.includes('image')) {
       // Construct a viewable link (using the /d/ trick for direct access mostly works)
       images.push(`https://lh3.googleusercontent.com/d/${file.getId()}`);
    }
  }
  return images;
}


// ================= CORE DATA LOGIC =================

// ================= CORE DATA LOGIC =================

function getStoreData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const products = getDataFromSheet(ss, SHEET_NAMES.PRODUCTS);
  const inventory = getDataFromSheet(ss, SHEET_NAMES.INVENTORY);
  const config = getDataFromSheet(ss, SHEET_NAMES.CONFIG);
  const locations = getDataFromSheet(ss, SHEET_NAMES.LOCATIONS);

  // Transform Config into a key-value object
  const configObj = {};
  config.forEach(row => {
    if (String(row.is_active).toUpperCase() === "TRUE") {
      const key = row.config_key;
      // SECURITY: Filter out secret keys
      const isSecret = /secret|password|private_key/i.test(key);
      // specific check for Paystack Public Key (allow) vs Secret Key (block)
      const isPaystackSecret = key.includes('PAYSTACK_SECRET');
      
      if (!isSecret && !isPaystackSecret) {
        configObj[key] = row.config_value;
      }
    }
  });

  return { products, inventory, config: configObj, locations };
}

// ... (Rest of processOrder, submitPaymentDetails, handleDeliveryConfirmation, getDataFromSheet remains same)

// ================= ADMIN HELPERS =================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('FAYM Admin')
    .addItem('1. Update Sheet Headers', 'setupInformation')
    .addItem('2. Setup Dropdowns (Validation)', 'setupDataValidation')
    .addToUi();
}

function setupInformation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const headerMap = {
    [SHEET_NAMES.PRODUCTS]: ["parent_code", "sub_code", "product_name", "category", "color_name", "color_hex", "main_image_url", "gallery_images", "description", "base_price", "discount_active", "discount_price", "delivery_cost_base", "total_sales_count", "is_new"],
    [SHEET_NAMES.INVENTORY]: ["sku_id", "sub_code", "size", "stock_qty", "low_stock_threshold"],
    [SHEET_NAMES.ORDERS]: ["timestamp", "order_id", "parent_ref", "customer_name", "phone_number", "location_data", "delivery_method", "sku_ordered", "item_name", "qty", "unit_price", "total_line_cost", "grand_total_order", "payment_method_selected", "payment_confirmed", "delivery_status", "sms_tracking_status", "payment_transaction_id"],
    [SHEET_NAMES.CONFIG]: ["config_key", "config_value", "is_active"],
    [SHEET_NAMES.LOCATIONS]: ["zone_name", "delivery_price"],
    [SHEET_NAMES.USERS]: ["user_id", "email", "password_hash", "full_name", "phone", "created_at"],
    [SHEET_NAMES.LIKED]: ["user_email", "product_sub_code", "timestamp"]
  };
  
  Object.keys(headerMap).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headerMap[sheetName]);
      sheet.getRange(1, 1, 1, headerMap[sheetName].length).setFontWeight("bold").setBackground("#E0E0E0");
    }
  });
}

function setupDataValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // Helper
  const setRule = (sheetName, colIndex, values) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(values).setAllowInvalid(false).build();
    // Apply to row 2 down to 1000
    sheet.getRange(2, colIndex, 999, 1).setDataValidation(rule);
  };

  try {
    // 1. PRODUCTS
    // Col 4 (D): Category
    setRule(SHEET_NAMES.PRODUCTS, 4, ["T-Shirt", "Hoodie", "Shorts", "Trousers", "Accessories", "Hat", "Other"]); 
    // Col 11 (K): Discount Active
    setRule(SHEET_NAMES.PRODUCTS, 11, ["TRUE", "FALSE"]);
    // Col 15 (O): Is New
    setRule(SHEET_NAMES.PRODUCTS, 15, ["TRUE", "FALSE"]);

    // 2. INVENTORY
    // Col 3 (C): Size
    setRule(SHEET_NAMES.INVENTORY, 3, ["S", "M", "L", "XL", "XXL", "3XL", "One Size", "Standard"]);

    // 3. CONFIG
    // Col 3 (C): Is Active
    setRule(SHEET_NAMES.CONFIG, 3, ["TRUE", "FALSE"]);

    // 4. ORDERS
    // Col 7 (G): Delivery Method
    setRule(SHEET_NAMES.ORDERS, 7, ["Delivery", "Store Pickup"]);
    // Col 14 (N): Payment Method
    setRule(SHEET_NAMES.ORDERS, 14, ["Paystack", "Cash on Delivery", "Mobile Money"]);
    // Col 15 (O): Payment Confirmed
    setRule(SHEET_NAMES.ORDERS, 15, ["Pending", "Paid", "Failed"]);
    // Col 16 (P): Delivery Status
    setRule(SHEET_NAMES.ORDERS, 16, ["Pending", "Processing", "Ready for Pickup", "Out for Delivery", "Delivered", "Cancelled"]);

    ui.alert("Success: Comprehensive Dropdowns setup on ALL sheets.");
  } catch (e) {
    ui.alert("Error setting validation: " + e.toString());
  }
}

// --- PAYSTACK VERIFICATION HELPER ---
function verifyPaystackTransaction(reference) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configParams = getDataFromSheet(ss, SHEET_NAMES.CONFIG);
  
  // Find Secret Key
  const secretRow = configParams.find(r => r.config_key === 'PAYSTACK_SECRET_KEY');
  if (!secretRow || !secretRow.config_value) return { success: false, message: "Server Config Error" };
  
  const secretKey = secretRow.config_value;
  
  try {
    const url = `https://api.paystack.co/transaction/verify/${reference}`;
    const options = {
      method: "get",
      headers: { "Authorization": "Bearer " + secretKey }
    };
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.status && result.data.status === 'success') {
       return { success: true, amount: result.data.amount, currency: result.data.currency };
    }
    return { success: false, message: "Payment Not Success" };
  } catch (e) {
    return { success: false, message: "Verification Failed: " + e.message };
  }
}

function processOrder(orderData) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: "Server busy. Try again." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invSheet = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  const orderSheet = ss.getSheetByName(SHEET_NAMES.ORDERS);
  
  try {
    // 0. VERIFY PAYMENT (If Reference Provided)
    let paymentStatus = "Pending";
    let transactionId = "";
    
    if (orderData.paymentReference) {
       const verify = verifyPaystackTransaction(orderData.paymentReference);
       if (!verify.success) {
          // If payment was attempted but failed verification, REJECT ORDER
          return { success: false, message: "Payment Verification Failed. " + verify.message };
       }
       // Optional: Standardize Amount Check (Paystack is in Kobo/Pesewas)
       // if (verify.amount !== orderData.grandTotal * 100) ... 
       
       paymentStatus = "Paid";
       transactionId = orderData.paymentReference;
    }

    const invData = invSheet.getDataRange().getValues();
    const invHeaders = invData[0];
    const skuColIdx = invHeaders.indexOf('sku_id');
    const stockColIdx = invHeaders.indexOf('stock_qty');

    // SKU Mapping
    const skuMap = {}; 
    for (let i = 1; i < invData.length; i++) {
      skuMap[invData[i][skuColIdx]] = i + 1;
    }

    // 1. Check Availability
    for (let item of orderData.items) {
      if (!skuMap[item.sku_id]) return { success: false, message: `Stock Error: ${item.sku_id} not found.` };
      
      const rowIndex = skuMap[item.sku_id];
      const currentStock = invData[rowIndex - 1][stockColIdx]; 
      
      if (currentStock < item.qty) {
        return { success: false, message: `Only ${currentStock} left for ${item.item_name} (${item.size}).` };
      }
    }

    // 2. Deduct Stock
    for (let item of orderData.items) {
      const rowIndex = skuMap[item.sku_id];
      const currentStock = invData[rowIndex - 1][stockColIdx];
      invSheet.getRange(rowIndex, stockColIdx + 1).setValue(currentStock - item.qty);
    }

    // 3. Log Order
    const orderId = `ORD-${Math.floor(Date.now() / 1000).toString().substr(-6)}-${Math.floor(Math.random()*99)}`;
    const storeName = orderData.storeName || "FAYM";
    const parentRef = `${storeName}-${orderId}`;
    const timestamp = new Date();

    const newRows = orderData.items.map((item, index) => {
      const grandTotal = index === 0 ? orderData.grandTotal : "";
      return [
        timestamp, orderId, parentRef, orderData.customerName, "'" + orderData.phone,
        orderData.location, orderData.deliveryMethod, item.sku_id, item.item_name,
        item.qty, item.price, item.qty * item.price, grandTotal,
        orderData.paymentMethod, paymentStatus, "Processing", "Not Sent", transactionId
      ];
    });

    orderSheet.getRange(orderSheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);

    return { success: true, orderId, parentRef, message: "Order Placed Successfully" };
  } catch (e) {
    return { success: false, message: "System Error: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

function getOrderHistory(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName(SHEET_NAMES.ORDERS);
  const data = orderSheet.getDataRange().getValues();
  const headers = data[0];
  
  // Find indices for filtering
  // Indices based on HEADER MAP: 
  // [timestamp, order_id, parent_ref, customer_name, phone_number, location_data, delivery_method, sku_ordered, item_name, qty, unit_price, total_line_cost, grand_total_order, payment_method_selected, payment_confirmed, delivery_status, sms_tracking_status, payment_transaction_id]
  // In sheet, Name is typically Col 4 (Index 3), Phone Col 5 (Index 4). 
  // But reliable way is using headers array, assuming header row is row 1
  
  // Actually, we should rely on "phone_number" OR "customer_name" matching payload.email? 
  // Wait, payload is { email }. Users sheet has Phone.
  // Best is to filter by Phone since User has Phone, and Order has Phone.
  
  const userPhone = payload.phone; 
  if (!userPhone) return { success: true, orders: [] }; // Cannot match without phone

  const orders = [];
  const phoneIdx = 4; // Check setInformation: phone_number is 5th item -> index 4
  const timestampIdx = 0;
  const deliveryStatusIdx = 15;
  const parentRefIdx = 2;
  const itemIdx = 8;
  const totalIdx = 12;

  // Group by Parent Ref
  const grouped = {};
  
  for (let i = 1; i < data.length; i++) {
     const row = data[i];
     // Clean phone: Remove ' and spaces
     const rowPhone = String(row[phoneIdx]).replace(/['\s]/g, '');
     const targetPhone = String(userPhone).replace(/['\s]/g, '');
     
     if (rowPhone === targetPhone) {
        const ref = row[parentRefIdx];
        if (!grouped[ref]) {
           grouped[ref] = {
              date: row[timestampIdx],
              id: ref,
              status: row[deliveryStatusIdx],
              total: row[totalIdx],
              items: []
           };
        }
        if (row[itemIdx]) grouped[ref].items.push(row[itemIdx]);
     }
  }

  // Convert to array
  const history = Object.values(grouped).sort((a,b) => new Date(b.date) - new Date(a.date));
  return { success: true, orders: history };
}

function submitPaymentDetails(payload) {
  const { orderId, transactionId } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName(SHEET_NAMES.ORDERS);
  const data = orderSheet.getDataRange().getValues();
  const headers = data[0];
  const orderIdColIdx = headers.indexOf('order_id');
  const transIdColIdx = headers.indexOf('payment_transaction_id');

  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][orderIdColIdx] === orderId) {
      orderSheet.getRange(i + 1, transIdColIdx + 1).setValue(transactionId);
      found = true;
    }
  }
  return found ? { success: true } : { success: false, message: "Order ID Not Found" };
}

function handleDeliveryConfirmation(orderId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName(SHEET_NAMES.ORDERS);
  const data = orderSheet.getDataRange().getValues();
  
  const headers = data[0];
  const orderIdColIdx = headers.indexOf('order_id');
  const deliveryStatColIdx = headers.indexOf('delivery_status');

  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][orderIdColIdx] === orderId) {
      orderSheet.getRange(i + 1, deliveryStatColIdx + 1).setValue("Client Confirmed Receipt");
      found = true;
    }
  }
  if (found) {
     return HtmlService.createHtmlOutput("<h1 style='color:green;text-align:center;padding:50px;'>Only Good Vibes! Delivery Confirmed.</h1>");
  }
  return HtmlService.createHtmlOutput("<h2>Error: Order Not Found</h2>");
}

// ================= UTILS & ADMIN =================

function getDataFromSheet(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    let obj = {};
    headers.forEach((header, index) => { if(header) obj[header] = row[index]; });
    return obj;
  });
}

function sendSms(phone, msg) { Logger.log("SMS to " + phone + ": " + msg); }

function onOpen() {
  SpreadsheetApp.getUi().createMenu('FAYM Admin')
    .addItem('1. Update Sheet Headers', 'setupInformation')
    .addItem('2. Setup Dropdowns (Validation)', 'setupDataValidation')
    .addItem('3. Setup Config Keys', 'setupDefaultConfig')
    .addItem('4. Generate Ghana Locations (Deep)', 'setupGhanaLocations')
    .addItem('5. Send Delivery SMS', 'promptWithDeliverySms')
    .addToUi();
}

function setupInformation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const headerMap = {
    [SHEET_NAMES.PRODUCTS]: ["parent_code", "sub_code", "product_name", "category", "color_name", "color_hex", "main_image_url", "gallery_images", "description", "base_price", "discount_active", "discount_price", "delivery_cost_base", "total_sales_count", "is_new"],
    [SHEET_NAMES.INVENTORY]: ["sku_id", "sub_code", "size", "stock_qty", "low_stock_threshold"],
    [SHEET_NAMES.ORDERS]: ["timestamp", "order_id", "parent_ref", "customer_name", "phone_number", "location_data", "delivery_method", "sku_ordered", "item_name", "qty", "unit_price", "total_line_cost", "grand_total_order", "payment_method_selected", "payment_confirmed", "delivery_status", "sms_tracking_status", "payment_transaction_id"],
    [SHEET_NAMES.CONFIG]: ["config_key", "config_value", "is_active"],
    [SHEET_NAMES.LOCATIONS]: ["zone_name", "delivery_price"],
    [SHEET_NAMES.USERS]: ["user_id", "email", "password_hash", "full_name", "phone", "created_at"],
    [SHEET_NAMES.LIKED]: ["user_email", "product_sub_code", "timestamp"]
  };
  
  Object.keys(headerMap).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headerMap[sheetName]);
      sheet.getRange(1, 1, 1, headerMap[sheetName].length).setFontWeight("bold").setBackground("#E0E0E0");
    } else {
       // Optional: Check if headers match, if not, maybe alert? For now, we trust the user to delete old sheets if breaking changes.
    }
  });
}

function setupDefaultConfig() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
    if (!configSheet) {
        setupInformation(); // Ensure sheet exists
        configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
    }
    
    // Key | Value | Active
    const defaults = [
        ["PAYSTACK_PUBLIC_KEY", "pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx (REPLACE ME)", "TRUE"],
        ["PAYSTACK_SECRET_KEY", "sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx (REPLACE ME)", "TRUE"],
        ["GOOGLE_MAPS_API_KEY", "AIzaSy... (REPLACE ME)", "TRUE"],
        ["DELIVERY_BASE_FEE", "20", "TRUE"],
        ["DELIVERY_PER_KM", "5", "TRUE"],
        ["STORE_LATLNG", "5.6037,-0.1870", "TRUE"], // Accra defaults
        
        // Hero Slides Default (Optional)
        ["hero_slide_1_url", "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=2070", "TRUE"],
        ["hero_slide_1_text", "New Arrivals", "TRUE"],
        ["hero_slide_1_subtext", "Shop the latest trends now.", "TRUE"]
    ];

    const existingData = configSheet.getDataRange().getValues();
    // Start from row 2 (skip header)
    const existingKeys = existingData.slice(1).map(r => r[0]); 

    let addedCount = 0;
    defaults.forEach(row => {
        if (!existingKeys.includes(row[0])) {
            configSheet.appendRow(row);
            addedCount++;
        }
    });

    const ui = SpreadsheetApp.getUi();
    if (addedCount > 0) {
        ui.alert(`Success! Added ${addedCount} missing keys to CONFIG sheet. Please go edit the values.`);
    } else {
        ui.alert("All keys already exist.");
    }
}

function promptWithDeliverySms() {
   const ui = SpreadsheetApp.getUi();
   ui.alert('SMS Feature requires active integration.');
}
