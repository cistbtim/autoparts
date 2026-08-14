import { getSettings } from "./settings.js";

export const ROLES = {
  admin:             { color: "#f97316", bg: "rgba(249,115,22,0.12)",   icon: "👑" },
  branch_admin:      { color: "#0ea5e9", bg: "rgba(14,165,233,0.12)",   icon: "🏢" },
  branch_manager:    { color: "#06b6d4", bg: "rgba(6,182,212,0.12)",    icon: "👔" },
  branch_warehouse:  { color: "#84cc16", bg: "rgba(132,204,22,0.12)",   icon: "📦" },
  branch_picker:     { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",   icon: "🔍" },
  branch_salesman:   { color: "#ec4899", bg: "rgba(236,72,153,0.12)",   icon: "🛒" },
  manager:           { color: "#8b5cf6", bg: "rgba(139,92,246,0.12)",   icon: "👔" },
  shipper:           { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",   icon: "🚚" },
  stockman:          { color: "#10b981", bg: "rgba(16,185,129,0.12)",   icon: "📦" },
  customer:          { color: "#34d399", bg: "rgba(52,211,153,0.12)",   icon: "👤" },
  workshop:          { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",   icon: "🔧" },
  scrapyard:         { color: "#6b7280", bg: "rgba(107,114,128,0.12)",  icon: "🚗" },
  scrapyard_admin:   { color: "#a78bfa", bg: "rgba(167,139,250,0.12)",  icon: "♻️" },
  supplier:          { color: "#c084fc", bg: "rgba(192,132,252,0.12)",  icon: "🏭" },
};

export const BRANCH_ROLES = ["branch_admin","branch_manager","branch_warehouse","branch_picker","branch_salesman"];

// Display-only fallback: fills in a province/state when the geo lookup at login time
// returned a city but no region (common with free-tier IP geolocation outside SA).
export const CITY_PROVINCE = {
  "Pattaya City": "Chonburi", "Pattaya": "Chonburi", "Bangkok": "Bangkok",
  "Chiang Mai": "Chiang Mai", "Phuket": "Phuket", "Nonthaburi": "Nonthaburi",
  "Udon Thani": "Udon Thani", "Hat Yai": "Songkhla", "Nakhon Ratchasima": "Nakhon Ratchasima",
  "Khon Kaen": "Khon Kaen", "Rayong": "Rayong", "Chonburi": "Chonburi",
  "Luanda": "Luanda", "Huambo": "Huambo", "Lobito": "Benguela", "Benguela": "Benguela",
  "Kaohsiung": "Kaohsiung", "Kaohsiung City": "Kaohsiung", "Taipei": "Taipei", "Taipei City": "Taipei",
  "New Taipei": "New Taipei", "New Taipei City": "New Taipei", "Taichung": "Taichung", "Taichung City": "Taichung",
  "Tainan": "Tainan", "Tainan City": "Tainan", "Taoyuan": "Taoyuan", "Taoyuan City": "Taoyuan",
};

export const OC = { "Completed": "#34d399", "Ready to Ship": "#fbbf24", "Processing": "#60a5fa", "Cancelled": "#f87171", "Quoted": "#a855f7", "Invoiced": "#f97316", "Paid": "#10b981", "已完成": "#34d399", "待出貨": "#fbbf24", "處理中": "#60a5fa", "已取消": "#f87171" };

export const CATS_EN = ["All", "Engine", "Brake", "Filter", "Electrical", "Suspension"];
export const CATS_ZH = ["全部", "引擎", "煞車系統", "濾清系統", "電氣系統", "懸吊系統"];

export const CAR_MAKES = {
  "Alfa Romeo": ["147", "156", "159", "Giulia", "Giulietta", "Stelvio", "MiTo", "4C"],
  "Audi": ["A1", "A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q5", "Q7", "Q8", "TT", "R8", "e-tron"],
  "BAIC": ["X25", "X35", "X55", "BJ40", "BJ60", "D20", "M20"],
  "BMW": ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "6 Series", "7 Series", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "M3", "M5", "iX"],
  "BYD": ["Atto 3", "Seal", "Dolphin", "Han", "Tang", "Song", "Yuan"],
  "Changan": ["CS15", "CS35", "CS55", "CS75", "CS85", "Alsvin", "Uni-T", "Uni-K"],
  "Chery": ["QQ", "Tiggo 4", "Tiggo 7", "Tiggo 8", "Arrizo 5", "Arrizo 6"],
  "Chevrolet": ["Spark", "Aveo", "Cruze", "Malibu", "Trax", "Equinox", "Traverse", "Silverado", "Colorado"],
  "Chrysler": ["300", "300C", "Grand Voyager", "Pacifica", "PT Cruiser"],
  "Citroën": ["C1", "C3", "C3 Aircross", "C4", "C5", "Berlingo", "Dispatch", "Jumpy"],
  "Dacia": ["Sandero", "Duster", "Logan", "Jogger", "Spring"],
  "Daihatsu": ["Charade", "Terios", "Sirion", "Grand Move", "YRV"],
  "DFSK": ["C37", "C56", "Glory 330", "Glory 500", "Glory 580"],
  "Dodge": ["Charger", "Challenger", "Durango", "Journey", "RAM 1500"],
  "Ferrari": ["488", "F8", "Roma", "SF90", "Portofino", "California"],
  "Fiat": ["Punto", "Panda", "500", "Tipo", "Bravo", "Doblo", "Ducato", "Fullback"],
  "Ford": ["Fiesta", "Focus", "Mondeo", "Ranger", "F-150", "Mustang", "Explorer", "Kuga", "EcoSport", "Transit", "Everest", "Territory"],
  "Foton": ["Tunland", "View", "Sauvana", "Toano"],
  "Geely": ["GS", "GL", "Emgrand", "Coolray", "Azkarra", "Okavango"],
  "GMC": ["Sierra", "Canyon", "Yukon", "Acadia", "Terrain", "Savana"],
  "GWM": ["Steed", "P-Series", "Cannon", "Haval H1", "Haval H2", "Haval H6", "Haval Jolion", "Tank 300"],
  "Haval": ["H1", "H2", "H4", "H6", "H7", "H9", "Jolion", "F7", "Big Dog"],
  "Hino": ["300", "500", "700", "300 Series", "500 Series"],
  "Honda": ["Civic", "Accord", "CR-V", "HR-V", "Jazz", "Pilot", "Odyssey", "Fit", "City", "Brio", "WR-V"],
  "Hyundai": ["i10", "i20", "i30", "Tucson", "Santa Fe", "Creta", "Sonata", "Elantra", "Kona", "H1", "H100", "Staria"],
  "Infiniti": ["Q30", "Q50", "Q60", "Q70", "QX30", "QX50", "QX70", "QX80"],
  "Isuzu": ["D-Max", "MU-X", "Forward", "NPR", "NQR", "FRR", "FSR", "FTR"],
  "JAC": ["S1", "S2", "S3", "S4", "S5", "T6", "T8"],
  "Jaguar": ["XE", "XF", "XJ", "F-Type", "E-Pace", "F-Pace", "I-Pace"],
  "Jeep": ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Gladiator"],
  "Kia": ["Picanto", "Rio", "Cerato", "Sportage", "Sorento", "Carnival", "Stinger", "EV6", "Seltos"],
  "Lamborghini": ["Huracan", "Urus", "Revuelto"],
  "Land Rover": ["Defender", "Discovery", "Discovery Sport", "Freelander", "Range Rover", "Range Rover Evoque", "Range Rover Sport", "Range Rover Velar"],
  "Lexus": ["CT", "IS", "ES", "GS", "LS", "UX", "NX", "RX", "GX", "LX", "LC"],
  "Mahindra": ["Pik Up", "Scorpio", "XUV300", "XUV500", "Thar", "Bolero"],
  "MAN": ["TGS", "TGX", "TGL", "TGM", "TGE"],
  "Maserati": ["Ghibli", "Quattroporte", "Levante", "GranTurismo", "MC20"],
  "Mazda": ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-5", "CX-9", "BT-50", "MX-5"],
  "Mercedes-Benz": ["A-Class", "B-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLB", "GLC", "GLE", "GLS", "CLA", "CLS", "AMG GT", "EQC", "Sprinter", "Vito", "Actros"],
  "MINI": ["Cooper", "Cooper S", "Countryman", "Clubman", "Paceman", "Roadster"],
  "Mitsubishi": ["Mirage", "Lancer", "Galant", "Outlander", "ASX", "Pajero", "L200", "Eclipse Cross", "Triton", "Xpander"],
  "Nissan": ["Micra", "Almera", "Sentra", "X-Trail", "Qashqai", "Navara", "Patrol", "Juke", "Note", "NP200", "NP300", "Leaf"],
  "Opel": ["Corsa", "Astra", "Insignia", "Mokka", "Crossland", "Grandland", "Combo", "Vivaro"],
  "Peugeot": ["108", "208", "308", "408", "508", "2008", "3008", "5008", "Partner", "Expert", "Boxer"],
  "Porsche": ["911", "Cayenne", "Macan", "Panamera", "Taycan", "718"],
  "Renault": ["Kwid", "Sandero", "Logan", "Duster", "Captur", "Megane", "Kadjar", "Koleos", "Triber", "Kiger"],
  "Rolls-Royce": ["Ghost", "Phantom", "Wraith", "Dawn", "Cullinan", "Spectre"],
  "SEAT": ["Ibiza", "Leon", "Arona", "Ateca", "Tarraco"],
  "Skoda": ["Fabia", "Octavia", "Superb", "Rapid", "Scala", "Kamiq", "Karoq", "Kodiaq"],
  "Ssangyong": ["Tivoli", "Korando", "Rexton", "Musso", "Actyon"],
  "Subaru": ["Impreza", "Legacy", "Outback", "Forester", "XV", "BRZ", "WRX"],
  "Suzuki": ["Alto", "Swift", "Baleno", "Vitara", "Jimny", "Ertiga", "S-Cross", "Celerio", "Ignis", "Fronx"],
  "Tata": ["Xenon", "Safari", "Indica", "Bolt", "Hexa", "Nexon"],
  "Tesla": ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck"],
  "Toyota": ["Corolla", "Camry", "RAV4", "Hilux", "Land Cruiser", "Prius", "Fortuner", "Yaris", "Vitz", "HiAce", "Prado", "Avanza", "Rumion", "Urban Cruiser", "Quantum"],
  "Volkswagen": ["Golf", "Polo", "Passat", "Tiguan", "Touareg", "Amarok", "Caddy", "T-Roc", "Arteon", "T-Cross", "Taigo"],
  "Volvo": ["S60", "S90", "V40", "V60", "V90", "XC40", "XC60", "XC90"],
  "Other": ["Other / Unknown"],
};

export const DEFAULT_CATS = ["Engine", "Brake", "Filter", "Electrical", "Suspension", "Body", "Transmission", "Cooling", "Fuel", "Steering"];

export const getCategories = () => {
  try {
    const c = getSettings().categories;
    if (c && typeof c === "string" && c.trim()) return JSON.parse(c);
    if (Array.isArray(c) && c.length) return c;
  } catch (e) { /* ignore malformed categories */ }
  return DEFAULT_CATS;
};

export const DEFAULT_BRANDS = ["Original", "OEM", "Aftermarket", "Bosch"];

export const getBrands = () => {
  try {
    const b = getSettings().part_brands;
    if (b && typeof b === "string" && b.trim()) return JSON.parse(b);
    if (Array.isArray(b) && b.length) return b;
  } catch (e) { /* ignore malformed part_brands */ }
  return DEFAULT_BRANDS;
};

// Recently-used bin/shelf locations, most-recent-first — shared across all
// users via settings so the whole shop converges on the same location codes.
export const getRecentLocations = () => {
  try {
    const l = getSettings().part_locations;
    if (l && typeof l === "string" && l.trim()) return JSON.parse(l);
    if (Array.isArray(l)) return l;
  } catch (e) { /* ignore malformed part_locations */ }
  return [];
};

export const TRIAL_DAYS = 30;

export const getSubInfo = (u) => {
  if (!u || u.role === "admin") return { status: "admin", label: "Admin", color: "#f97316" };
  if (u.role === "branch_admin")      return { status: "admin", label: "Branch Admin",     color: "#0ea5e9" };
  if (u.role === "scrapyard_admin")   return { status: "admin", label: "Scrapyard Admin",  color: "#a78bfa" };
  if (u.role === "branch_manager")    return { status: "admin", label: "Branch Manager",   color: "#06b6d4" };
  if (u.role === "branch_warehouse")  return { status: "admin", label: "Branch Warehouse", color: "#84cc16" };
  if (u.role === "branch_picker")     return { status: "admin", label: "Branch Picker",    color: "#f59e0b" };
  if (u.role === "branch_salesman")   return { status: "admin", label: "Branch Salesman",  color: "#ec4899" };
  const s = u.subscription_status || "trial";
  if (s === "active") {
    if (u.subscription_expires_at) {
      const exp = new Date(u.subscription_expires_at); exp.setHours(23,59,59,999);
      const now = new Date();
      if (now > exp) return { status: "expired", label: "⏰ Expired", color: "#f87171", expiresAt: u.subscription_expires_at };
      const daysLeft = Math.ceil((exp - now) / 86400000);
      const color = daysLeft <= 7 ? "#fbbf24" : "#34d399";
      return { status: "active", label: `✅ Active · ${daysLeft}d left`, color, daysLeft, expiresAt: u.subscription_expires_at };
    }
    return { status: "active", label: "✅ Active", color: "#34d399" };
  }
  if (s === "blocked" || s === "expired") return { status: s, label: s === "blocked" ? "🚫 Blocked" : "⏰ Expired", color: "#f87171" };
  const days = Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - new Date(u.trial_start || Date.now())) / 86400000));
  if (days <= 0) return { status: "expired", label: "⏰ Expired", color: "#f87171", days: 0 };
  return { status: "trial", label: `Trial: ${days}d`, color: days <= 5 ? "#fbbf24" : "#60a5fa", days };
};

export const canAccess = (u) => {
  if (!u) return false;
  if (u.role === "admin") return true;
  if (u.role === "branch_admin")     return true;
  if (u.role === "branch_manager")   return true;
  if (u.role === "branch_warehouse") return true;
  if (u.role === "branch_picker")    return true;
  if (u.role === "branch_salesman")  return true;
  if (u.role === "demo") return true;
  if (u.role === "workshop") return true;
  if (u.role === "scrapyard") return true;
  if (u.role === "scrapyard_admin") return true;
  if (u.role === "supplier") return true;
  if (u._isCustomer) return true;
  const s = getSubInfo(u);
  return s.status === "active" || s.status === "trial";
};
