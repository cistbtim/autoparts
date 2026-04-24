import { getSettings } from "./settings.js";

export const ROLES = {
  admin:    { color: "#f97316", bg: "rgba(249,115,22,0.12)",  icon: "👑" },
  manager:  { color: "#8b5cf6", bg: "rgba(139,92,246,0.12)",  icon: "👔" },
  shipper:  { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: "🚚" },
  stockman: { color: "#10b981", bg: "rgba(16,185,129,0.12)",  icon: "📦" },
  customer: { color: "#34d399", bg: "rgba(52,211,153,0.12)",  icon: "👤" },
};

export const OC = { "Completed": "#34d399", "Ready to Ship": "#fbbf24", "Processing": "#60a5fa", "Cancelled": "#f87171", "已完成": "#34d399", "待出貨": "#fbbf24", "處理中": "#60a5fa", "已取消": "#f87171" };

export const CATS_EN = ["All", "Engine", "Brake", "Filter", "Electrical", "Suspension"];
export const CATS_ZH = ["全部", "引擎", "煞車系統", "濾清系統", "電氣系統", "懸吊系統"];

export const CAR_MAKES = {
  "BMW": ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "6 Series", "7 Series", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "M3", "M5"],
  "Mercedes-Benz": ["A-Class", "B-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLC", "GLE", "GLS", "CLA", "CLS", "AMG GT"],
  "Toyota": ["Corolla", "Camry", "RAV4", "Hilux", "Land Cruiser", "Prius", "Fortuner", "Yaris", "HiAce", "Prado"],
  "Ford": ["Fiesta", "Focus", "Mondeo", "Ranger", "F-150", "Mustang", "Explorer", "Kuga", "EcoSport", "Transit"],
  "Volkswagen": ["Golf", "Polo", "Passat", "Tiguan", "Touareg", "Amarok", "Caddy", "T-Roc", "Arteon"],
  "Honda": ["Civic", "Accord", "CR-V", "HR-V", "Jazz", "Pilot", "Odyssey", "Fit", "City"],
  "Hyundai": ["i10", "i20", "i30", "Tucson", "Santa Fe", "Creta", "Sonata", "Elantra", "Kona"],
  "Kia": ["Picanto", "Rio", "Cerato", "Sportage", "Sorento", "Carnival", "Stinger", "EV6"],
  "Nissan": ["Micra", "Almera", "Sentra", "X-Trail", "Qashqai", "Navara", "Patrol", "Juke", "Note"],
  "Mazda": ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-5", "CX-9", "BT-50", "MX-5"],
  "Audi": ["A1", "A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q5", "Q7", "Q8", "TT", "R8"],
  "Peugeot": ["108", "208", "308", "408", "508", "2008", "3008", "5008", "Partner", "Expert"],
  "Renault": ["Kwid", "Sandero", "Logan", "Duster", "Captur", "Megane", "Kadjar", "Koleos"],
  "Chevrolet": ["Spark", "Aveo", "Cruze", "Malibu", "Trax", "Equinox", "Traverse", "Silverado", "Colorado"],
  "Mitsubishi": ["Mirage", "Lancer", "Galant", "Outlander", "ASX", "Pajero", "L200", "Eclipse Cross"],
  "Suzuki": ["Alto", "Swift", "Baleno", "Vitara", "Jimny", "Ertiga", "S-Cross", "Celerio"],
  "Isuzu": ["D-Max", "MU-X", "Forward", "NPR", "NQR", "FRR"],
  "GWM": ["Steed", "P-Series", "Cannon", "Haval H1", "Haval H2", "Haval H6", "Haval Jolion", "Tank 300"],
  "Haval": ["H1", "H2", "H4", "H6", "H7", "H9", "Jolion", "F7", "Big Dog"],
  "Chery": ["QQ", "Tiggo 4", "Tiggo 7", "Tiggo 8", "Arrizo 5", "Arrizo 6"],
  "JAC": ["S1", "S2", "S3", "S4", "S5", "T6", "T8", "Sieve", "Sei"],
  "BAIC": ["X25", "X35", "X55", "BJ40", "BJ60", "D20", "M20"],
  "Geely": ["GS", "GL", "Emgrand", "Coolray", "Azkarra", "Okavango"],
  "Other": ["Other / Unknown"],
};

export const DEFAULT_CATS = ["Engine", "Brake", "Filter", "Electrical", "Suspension", "Body", "Transmission", "Cooling", "Fuel", "Steering"];

export const getCategories = () => {
  try {
    const c = getSettings().categories;
    if (c && typeof c === "string" && c.trim()) return JSON.parse(c);
    if (Array.isArray(c) && c.length) return c;
  } catch {}
  return DEFAULT_CATS;
};

export const TRIAL_DAYS = 30;

export const getSubInfo = (u) => {
  if (!u || u.role === "admin") return { status: "admin", label: "Admin", color: "#f97316" };
  const s = u.subscription_status || "trial";
  if (s === "active") return { status: "active", label: "✅ Active", color: "#34d399" };
  if (s === "blocked" || s === "expired") return { status: s, label: s === "blocked" ? "🚫 Blocked" : "⏰ Expired", color: "#f87171" };
  const days = Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - new Date(u.trial_start || Date.now())) / 86400000));
  if (days <= 0) return { status: "expired", label: "⏰ Expired", color: "#f87171", days: 0 };
  return { status: "trial", label: `Trial: ${days}d`, color: days <= 5 ? "#fbbf24" : "#60a5fa", days };
};

export const canAccess = (u) => {
  if (!u) return false;
  if (u.role === "admin") return true;
  if (u.role === "demo") return true;
  if (u.role === "workshop") return true;
  if (u._isCustomer) return true;
  const s = getSubInfo(u);
  return s.status === "active" || s.status === "trial";
};
