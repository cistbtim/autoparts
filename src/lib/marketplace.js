// Scrapyard Match ("marketplace") — shared helpers.
//
// Workshops search scrapyard stock by VIN for FREE; the result hides who holds the vehicle. To get the
// scrapyard's contact the workshop sends a "reveal request" costing REVEAL_COST points; the admin
// (VelGenius) approves it, the points are deducted, and the admin introduces the two parties.
//
// NOTE: points are stored in ordinary tables read/written with the app's public key, so for the
// pilot they are a tracking/management tool among trusted testers — not tamper-proof money.
// Scrapyard contact details are deliberately NOT shown anywhere in the workshop UI.

import { SUPABASE_URL, SUPABASE_KEY } from "./api.js";

export const REVEAL_COST = 1;   // points per approved reveal
export const TRIAL_POINTS = 3;  // free points a workshop gets the first time it opens Scrapyard Match

// VINs never contain I, O or Q.
export const cleanVin = (v) => (v || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");

// 10th VIN character = model year (30-year cycle; ambiguous between 1980s and 2010s — pick the plausible one).
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";
export function yearFromVin(vin) {
  const v = cleanVin(vin);
  if (v.length < 10) return null;
  const i = YEAR_CODES.indexOf(v[9]);
  if (i < 0) return null;
  const max = new Date().getFullYear() + 1;
  return 2010 + i <= max ? 2010 + i : 1980 + i;
}

const normTxt = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const tokens = (s) => (s || "").toUpperCase().split(/[^A-Z0-9]+/).filter(t => t.length >= 2);

// How well does a scrapyard vehicle match the workshop's vehicle?
//   0  same VIN                       (strongest)
//   1  same make/model/engine family  (first 8 VIN characters equal: maker + model/body/engine)
//   2  same make + a model-name match (when VINs differ but the names agree)
// Returns null when it isn't a match worth showing.
export function matchTier(wsVin, wsMake, wsModel, yard) {
  const a = cleanVin(wsVin), b = cleanVin(yard.vin);
  if (a.length === 17 && a === b) return 0;
  if (a.length >= 8 && b.length >= 8 && a.slice(0, 8) === b.slice(0, 8)) return 1;
  if (wsMake && wsModel && normTxt(wsMake) && normTxt(yard.make).includes(normTxt(wsMake).slice(0, 4))) {
    const yardText = normTxt(`${yard.model} ${yard.make}`);
    const hit = tokens(wsModel).filter(t => t.length >= 2 && yardText.includes(t)).length;
    if (hit >= 1) return 2;
  }
  return null;
}

export const TIER_LABEL = {
  0: { en: "Same VIN", color: "var(--green)" },
  1: { en: "Same model & engine family", color: "var(--green)" },
  2: { en: "Same make & model name", color: "var(--yellow)" },
};

// Show enough of the scrapyard's VIN to be credible, never the whole thing.
export function maskVin(vin) {
  const v = cleanVin(vin);
  if (v.length < 10) return v ? `${v.slice(0, 3)}•••••` : "";
  return `${v.slice(0, 8)}•${v[9]}${"•".repeat(Math.max(0, v.length - 10))}`;
}

// True once docs/marketplace.sql has been run (the tables exist). api.fresh() turns a missing table into an
// empty list, so ask the REST endpoint directly.
export async function marketplaceReady() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ms_credit_ledger?select=id&limit=1`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    return r.ok;
  } catch { return false; }
}

export const pointsBalance = (ledger) => (ledger || []).reduce((s, r) => s + (+r.delta || 0), 0);

// Statuses that mean the vehicle is no longer a donor candidate.
const GONE = /sold|crushed|scrapped|gone|removed/i;
export const isListable = (v) => !GONE.test(v.status || "");

// Photo "angle" keywords, to jump to the matching view on the other side (front ↔ front …).
export const angleOf = (label) => {
  const l = (label || "").toLowerCase();
  if (/rear|back/.test(l)) return "rear";
  if (/front/.test(l)) return "front";
  if (/left/.test(l)) return "left";
  if (/right/.test(l)) return "right";
  if (/interior|inside|cabin/.test(l)) return "interior";
  if (/engine|bay|bonnet|hood/.test(l)) return "engine";
  return "";
};
