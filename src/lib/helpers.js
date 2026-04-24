import { C } from "./settings.js";

// Convert Google Drive share link → direct thumbnail URL
const toImgUrl = (url) => {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`;
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w200`;
  if (url.match(/^https?:\/\//)) return url;
  return null;
};
export { toImgUrl };

// Convert Google Drive share link → thumbnail URL for saving to DB
export const toSaveUrl = (url) => {
  if (!url) return url;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`;
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w200`;
  return url;
};

// Convert Google Drive link → direct view URL (no white border — for logos)
export const toLogoUrl = (url) => {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
  if (url.match(/^https?:\/\//)) return url;
  return null;
};

// Extract Google Drive file ID from any Drive URL format
export const extractDriveId = (url) => {
  if (!url) return null;
  const m = url.match(/thumbnail[?]id=([^&]+)/) ||
            url.match(/\/file\/d\/([^/?]+)/)     ||
            url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
};

// Strip cache-buster &t=... from Drive URLs before saving to DB
export const stripCacheBuster = (url) => url ? url.replace(/&t=\d+/, "") : url;

// Convert any URL → large thumbnail for lightbox
export const toFullUrl = (url) => {
  if (!url) return null;
  const mThumb = url.match(/thumbnail[?]id=([^&]+)/);
  if (mThumb) return `https://drive.google.com/thumbnail?id=${mThumb[1]}&sz=w800`;
  const mFile = url.match(/file\/d\/([^/?]+)/);
  if (mFile) return `https://drive.google.com/thumbnail?id=${mFile[1]}&sz=w800`;
  const mId = url.match(/[?&]id=([^&]+)/);
  if (mId) return `https://drive.google.com/thumbnail?id=${mId[1]}&sz=w800`;
  return url;
};

export const today = () => new Date().toISOString().slice(0, 10);
export const fmtAmt = (n) => `${C()}${(n || 0).toLocaleString()}`;

let _idCounter = 0;
export const makeId = (prefix) => { _idCounter++; return `${prefix}-${Date.now()}-${_idCounter}`; };
export const makeToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
export const detectGeoLocation = async () => {
  const g = await (await fetch("https://ipapi.co/json/")).json();
  return { city: g.city || "", country: g.country_name || "" };
};

export const waLink = (phone, msg) => `https://wa.me/${(phone || "").replace(/[^0-9+]/g, "")}?text=${encodeURIComponent(msg)}`;
export const mailLink = (to, subj, body) => `mailto:${to || ""}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
