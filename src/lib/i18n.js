// English is the hardcoded fallback — all other languages load from app_translations DB table.
export const T = {
  en: {
    appSub: "Parts Management System", dashboard: "Dashboard", inventory: "Inventory",
    systemOverview: "System overview", recentOrders: "Recent Orders", viewAll: "View all",
    lowStockAlert: "Low Stock", manage: "Manage", orderStatus: "Order Status",
    connected: "Connected", s_processing: "Processing", s_shipped: "Ready to Ship",
    s_done: "Completed", s_cancelled: "Cancelled",
    shop: "Shop", orders: "Orders", myOrders: "My Orders", customers: "Customers",
    users: "Users", suppliers: "Suppliers", inquiries: "Inquiries", logs: "Stock Logs",
    loginLogs: "Login Logs", logout: "Sign Out", cart: "Cart", login: "Sign In",
    settings: "Settings", purchaseInvoices: "Purchase Invoices", supplierReturns: "Supplier Returns",
    salesInvoices: "Sales Invoices", customerReturns: "Customer Returns",
    username: "Username", password: "Password", connecting: "Loading...",
    wrongPass: "Invalid username or password", addPart: "Add Part",
    adjustStock: "Adjust", save: "Save", cancel: "Cancel", delete: "Delete",
    edit: "Edit", close: "Close", confirm: "Confirm", sku: "SKU", name: "Name",
    category: "Category", brand: "Brand", price: "Price", stock: "Stock",
    minStock: "Min Stock", status: "Status", normal: "OK", low: "Low", outOfStock: "Out of Stock",
    placeOrder: "Place Order", addToCart: "Add to Cart", checkout: "Checkout",
    orderHistory: "Order History", totalSpent: "Total Spent", addSupplier: "Add Supplier",
    supplierName: "Supplier Name", email: "Email", phone: "Phone", country: "Country",
    contactPerson: "Contact", pending: "Pending", replied: "Replied", closed: "Closed",
    paid: "Paid", unpaid: "Unpaid", partial: "Partial", approved: "Approved",
    role: "Role", admin: "Admin", manager: "Manager", shipper: "Shipper", stockman: "Stockman", customer: "Customer",
    revenue: "Revenue", pendingOrders: "Pending", lowStock: "Low Stock", parts: "Parts",
    all: "All", total: "Total", subtotal: "Subtotal", tax: "Tax", orders_count: "Orders",
    image_url: "Photo URL (Google Drive)", gdrive_hint: "Paste share link — auto converted",
    chineseDesc: "Chinese Description", make: "Make", model: "Model", yearRange: "Year Range", oeNumber: "OE Number",
    lead_time: "Lead Time", min_order: "Min Order", supplier_price: "Supplier Price",
    notes: "Notes", message: "Message", send: "Send Inquiry",
    invoice: "Invoice", invoiceNo: "Invoice No", invoiceDate: "Invoice Date", dueDate: "Due Date",
    unitCost: "Unit Cost", unitPrice: "Unit Price", qty: "Qty", amount: "Amount",
    supplierPartId: "Supplier Part ID", addLine: "Add Line",
    returnNote: "Return / Credit Note", returnDate: "Return Date", reason: "Reason",
    stockIn: "Stock In", stockOut: "Stock Out", createInvoice: "Create Invoice",
    picking: "Picking", pickOrder: "Pick Order", startPicking: "Start Picking",
    findByVehicle: "Find Parts by Vehicle",
    workshop: "Workshop", jobCards: "Job Cards", newJob: "New Job Card",
    jobCard: "Job Card", mechanic: "Mechanic", complaint: "Complaint",
    diagnosis: "Diagnosis", vehicleReg: "Vehicle Reg", mileage: "Mileage",
    dateIn: "Date In", dateOut: "Date Out", labour: "Labour",
    addLabour: "Add Labour", jobItems: "Job Items",
    workshopInvoice: "Workshop Invoice", createWorkshopInv: "Create Invoice",
    inProgress: "In Progress", done: "Done", delivered: "Delivered",
    vehicleColor: "Color", selectMake: "Select Make", selectModel: "Select Model",
    vehicles: "Vehicles", addVehicle: "Add Vehicle", editVehicle: "Edit Vehicle", vehicleMgmt: "Vehicle Management",
    yearFrom: "Year From", yearTo: "Year To", engine: "Engine", variant: "Variant",
    selectYear: "Select Year", fitsMycar: "Parts for my car", vehicleFitment: "Vehicle Fitment",
    linkedVehicles: "Linked Vehicles", noFitment: "No vehicles linked yet",
    scanBarcode: "Scan Barcode", pickItem: "Pick Item", pickedAll: "All Picked",
    confirmShip: "Confirm & Ship", scanOrConfirm: "Scan or tap to confirm",
    createReturn: "Create Return", shopName: "Shop Name", currency: "Currency",
    taxRate: "Tax Rate (%)", invoicePrefix: "Invoice Prefix", whatsappNo: "WhatsApp Number",
    shopEmail: "Shop Email", shopPhone: "Shop Phone", shopAddress: "Shop Address",
    saveSettings: "Save Settings", demoAccounts: "Demo Accounts",
    selectSuppliers: "Select Suppliers", sendToSelected: "Send to Selected",
    rfqSession: "RFQ Session", newRfq: "New RFQ", rfqItems: "Items", rfqQuotes: "Quotes",
    sendRfq: "Send RFQ", compareQuotes: "Compare Quotes", createPO: "Create PO",
    qtyNeeded: "Qty Needed", leadDays: "Lead Days",
    selectParts: "Select Parts", selectSupps: "Select Suppliers", deadline: "Deadline",
    reports: "Reports", salesReport: "Sales Report", inventoryReport: "Inventory Report",
    stockTake: "Stock Take", stockMove: "Stock Move", stockSheet: "Stock Sheet",
    binLocation: "Bin Location", systemQty: "System Qty", countedQty: "Counted Qty",
    variance: "Variance", startTake: "Start Stock Take", completeTake: "Complete",
    moveStock: "Move Stock", fromBin: "From Bin", toBin: "To Bin",
    customerReport: "Customer Report", supplierReport: "Supplier Report",
    payments: "Payments", addPayment: "Add Payment", paymentMethod: "Method",
    cash: "Cash", bankTransfer: "Bank Transfer", card: "Card", outstanding: "Outstanding",
    reconcile: "Reconcile", printInvoice: "Print / PDF", download: "Download PDF",
    sendWa: "Send via WhatsApp", sendEmail: "Send via Email",
    daily: "Daily", monthly: "Monthly", yearly: "Yearly",
    queryPriceQty: "Query Price & Qty", submitQuery: "Submit Query",
    myQueries: "My Queries", customerQueries: "Customer Queries",
    queryReply: "Reply to Query", depositRequest: "Request Deposit",
    depositAmount: "Deposit Amount", depositNote: "Payment Instructions",
    confirmedPrice: "Confirmed Price (per unit)", confirmedQty: "Available Qty",
    sendReply: "Send Reply", depositPaid: "Mark Deposit Paid",
    depositRequested: "Awaiting Deposit", noQueries: "No queries yet",
    queryNotes: "Notes / Query Details", partQuery: "Part Query",
    // Reports page
    rptBusinessAnalytics: "Business analytics",
    rptTotalRevenue: "Total Revenue", rptTotalOrders: "Total Orders",
    rptInventoryValue: "Inventory Value", rptCashReceived: "Cash Received",
    rptPeriod: "Period", rptAvgOrder: "Avg Order", rptNoOrders: "No completed orders yet",
    rptTotalParts: "Total Parts", rptTotalInventoryValue: "Total Inventory Value",
    rptCurrentStock: "Current Stock", rptValue: "Value", rptPart: "Part",
    rptTopCustomers: "Top Customers by Spend", rptRank: "Rank", rptTotalSpend: "Total Spend",
    rptNoCustomers: "No customer data yet",
    rptSupplierSummary: "Supplier Purchase Summary", rptInvoices: "Invoices",
    rptTotalPurchased: "Total Purchased", rptAvgInvoice: "Avg Invoice",
    rptNoSuppliers: "No purchase invoice data yet",
    // Login page tabs & buttons
    loginShop: "Parts Shop", loginWorkshop: "Workshop", loginStaff: "Staff",
    signIn: "Sign In", registerNew: "Register", registerWorkshop: "Register Workshop",
    noAccount: "No account?", createAccount: "Create Account",
    startFreeTrial: "Start Free Trial", alreadyAccount: "Already have an account?",
    freeTrial30: "30-day free trial — no credit card needed. After trial, a monthly fee applies.",
    confirmPwd: "Confirm Password", workshopNameField: "Workshop Name",
    cityCountryField: "City & Country", autoDetect: "Auto-detect", detectingLoc: "Detecting...",
    activeOrders: "Active",
    // Sidebar group headings
    grpDashboard: "Dashboard", grpInventory: "Inventory", grpPurchase: "Purchasing",
    grpWorkshop: "Workshop Module", grpSales: "Sales & Customers", grpReports: "Reports", grpSystem: "System",
    // Workshop sidebar nav items
    wsJobs: "Jobs", wsCustomers: "Workshop Customers", wsQuotations: "WS Quotations",
    wsInvoices: "WS Invoices", wsPayments: "WS Payments", wsStock: "WS Stock",
    wsServices: "WS Services", wsSuppliers: "WS Suppliers", wsPurchaseOrders: "WS Purchase Orders",
    wsSupInvoices: "WS Supplier Invoice",
    wsTransfer: "WS Transfer", wsStatement: "WS Statement", wsReport: "WS Report",
    wsSettings: "WS Settings", wsSubscriptions: "WS Subscriptions",
    wsProcurement: "Procurement", wsStockGroup: "Stock", wsAdmin: "Admin",
    // Workshop page strings
    wsCountCustomers: "customers", wsCountVehicles: "vehicles",
    wsSearchCustomer: "Search name, phone...", wsNoCustomers: "No customers yet",
    wsNoVehicles: "No vehicles yet", wsNoJobs: "No jobs yet", wsNoJobsFound: "No jobs found",
    wsAddVehicle: "Add Vehicle", wsNewCustomer: "New Customer", wsEditCustomer: "Edit Customer",
    wsNewJob: "New Job Card", wsEditJob: "Edit Job Card",
    // PartModal tabs & title
    pmEditPart: "Edit Part", pmNewPart: "New Part",
    pmTabInfo: "Info", pmTabPhoto: "Photo", pmTabVehicle: "Vehicle", pmTabFits: "Fits", pmTabRfq: "RFQ",
    costPrice: "Cost Price",
    // Login Logs page
    time: "Time", user: "User", city: "City", llEvents: "events",
    // Stock Logs / Stock Move columns
    action: "Action", before: "Before", after: "After", change: "Change", by: "By", records: "records",
    date: "Date", smMoves: "moves", smNewMove: "New Move", smNoMoves: "No stock moves recorded",
    // RFQ page
    rfqSesCount: "sessions", rfqCreated: "Created", rfqView: "View →",
    rfqNoSessions: "No RFQ sessions yet — click \"+\" to start",
    supplier: "Supplier", srReturns: "returns", srNewReturn: "New Return",
    srReturnNo: "Return No", srOrigInvoice: "Original Invoice",
    srNoSupRet: "No supplier returns", srNoCusRet: "No customer returns",
    // Stock Take page
    createdBy: "Created By", actions: "Actions", stTakes: "stock takes",
    stOpen: "Open", stCounted: "Counted", stCompleted: "Completed",
    stContinue: "Continue", stView: "View", stReview: "Review",
    // PartPhotoUploader strings
    phuUploading: "Uploading to Google Drive...",
    phuUploaded: "Photo uploaded", phuClickEnlarge: "Click photo to enlarge · drop here to replace",
    phuDrop: "Click or drag & drop photo", phuAutoUpload: "Auto-uploads to Google Drive · PNG, JPG",
    phuPasteClipboard: "Paste Image from Clipboard", phuBrowse: "Browse", phuPaste: "Paste",
    phuAutoSave: "Photo saves automatically when uploaded",
    phuUrlPlaceholder: "Or paste Google Drive URL manually...",
    // WorkshopJobDetail strings
    wsBack: "← Back", wsLabel: "Label", wsCollect: "Collect", wsInfoBtn: "Info", wsMove: "Move",
    wsTabCar: "Car", wsTabInspect: "Inspect", wsTabPhotos: "Photos", wsTabDocs: "Docs", wsTabQuote: "Quote",
    wsPlate: "Plate", wsMakeModel: "Make / Model", year: "Year",
    wsLicenceExpiry: "Licence Disc Expiry", wsExpired: "EXPIRED",
    wsRequestRenewal: "Request Renewal", wsVinSearch: "VIN Search", wsCopy: "Copy",
    wsOeSearch: "OE Number Search",
    wsMarkupPct: "Markup %", wsMarkupDefault: "Default Markup %",
  },
};

// Lang metadata: lang code → { name, flag }
const _meta = { en: { name: "English", flag: "🇬🇧" } };

// Status string maps per language (for tSt)
const _statusMaps = {};

// Register a language pack from the DB. Merges over English so missing keys fall back.
export function registerLang(lang, name, flag, translations, statusMap) {
  T[lang] = { ...T.en, ...translations };
  _meta[lang] = { name: name || lang, flag: flag || "" };
  if (statusMap && Object.keys(statusMap).length) _statusMaps[lang] = statusMap;
}

// Returns sorted list of available language options.
export function getLangs() {
  return Object.entries(_meta).map(([lang, m]) => ({ lang, name: m.name, flag: m.flag }));
}

let _currentLang = "en";
export const setCurrentLang = (lang) => { _currentLang = lang; };
export const tSt = (s) => {
  const map = _statusMaps[_currentLang];
  return map ? (map[s] || s) : s;
};
