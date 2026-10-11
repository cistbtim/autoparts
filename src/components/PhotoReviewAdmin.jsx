import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Overlay, MHead } from "./shared.jsx";
import { api } from "../lib/api.js";
import { detectSensitiveBoxes, mosaic } from "../lib/photoGuard.js";

// Admin Photo Review: every scrapyard photo not yet reviewed is listed; "Scan" finds phone numbers / web
// addresses / company names with OCR; the editor lets the admin mosaic those areas (auto-detected or drawn by
// hand), remove the photo, or mark it fine. A fixed photo is uploaded as a NEW file and the database points to
// it. (The original file stays in Google Drive, unreferenced — it can be deleted there by hand.)

const VEH_FIELDS = ["photo_front", "photo_rear", "photo_left", "photo_right", "photo_interior", "photo_engine", "photo_url"];
const PART_FIELDS = ["photo_url", "photo_url_2", "photo_url_3"];
const keyOf = (src, id, field, url) => `${src}|${id}|${field}|${url}`;
const getScriptUrl = () => (window._VEHICLE_SCRIPT_URL?.trim()) || (window._APPS_SCRIPT_URL?.trim()) || "";

// Photos live on Google Drive / Supabase, which can't be read pixel-by-pixel from the browser directly:
// go through our own same-origin proxy (worker/index.js). Drive thumbnails are asked for at a larger size.
const proxied = (url, big = false) => {
  let u = url;
  if (big) u = u.replace(/([?&]sz=)w\d+/, "$1w1600");
  return `/api/photo-proxy?u=${encodeURIComponent(u)}`;
};
const loadImg = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("Could not load the photo")); i.src = src; });

export function PhotoReviewPanel({ user, showToast = () => {} }) {
  const [vehs, setVehs] = useState([]);
  const [parts, setParts] = useState([]);
  const [yards, setYards] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [flags, setFlags] = useState({});      // key -> number of sensitive areas found by the scan
  const [scan, setScan] = useState(null);      // {done,total} while scanning
  const [editing, setEditing] = useState(null);
  // Photos the scan finds NO text in are approved automatically and leave the list — only photos with something
  // to cover need a person. (Switch off to approve every photo by hand.)
  const [autoClean, setAutoClean] = useState(() => { try { return localStorage.getItem("ms_autoclean") !== "0"; } catch { return true; } });
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [v, p, y, r] = await Promise.all([
      api.fresh("scrapyard_vehicles", `select=id,scrapyard_id,vin,make,model,${VEH_FIELDS.join(",")}`),
      api.fresh("scrapyard_parts", `select=id,scrapyard_id,vehicle_id,name,${PART_FIELDS.join(",")}`),
      api.fresh("scrapyard_profiles", "select=id,name"),
      api.fresh("ms_photo_review", "select=source,row_id,field,url,status"),
    ]).catch(() => [null]);
    if (![v, p, y, r].every(Array.isArray)) { setErr("Run docs/marketplace.sql in the Supabase SQL Editor first (it adds the photo review table)."); setLoading(false); return; }
    setErr(""); setVehs(v); setParts(p); setYards(y); setReviews(r); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const yardName = useMemo(() => { const m = new Map(yards.map(y => [String(y.id), y.name])); return (id) => m.get(String(id)) || `#${id}`; }, [yards]);
  const reviewed = useMemo(() => new Map(reviews.map(r => [keyOf(r.source, r.row_id, r.field, r.url), r.status])), [reviews]);

  const items = useMemo(() => {
    const out = [];
    vehs.forEach(v => VEH_FIELDS.forEach(f => { if (v[f]) out.push({ src: "vehicle", id: v.id, field: f, url: v[f], vin: v.vin, yard: yardName(v.scrapyard_id), label: `${v.make || ""} ${v.model || ""}`.trim() || "Vehicle", sub: f.replace("photo_", "") }); }));
    parts.forEach(p => PART_FIELDS.forEach(f => { if (p[f]) { const veh = vehs.find(x => x.id === p.vehicle_id); out.push({ src: "part", id: p.id, field: f, url: p[f], vin: veh?.vin, yard: yardName(p.scrapyard_id), label: p.name || "Part", sub: f.replace("photo_", "") }); } }));
    return out.map(i => ({ ...i, key: keyOf(i.src, i.id, i.field, i.url), status: reviewed.get(keyOf(i.src, i.id, i.field, i.url)) || "new" }));
  }, [vehs, parts, yardName, reviewed]);

  const pending = items.filter(i => i.status === "new");
  const shown = (showAll ? items : pending).slice().sort((a, b) => (flags[b.key] || 0) - (flags[a.key] || 0));

  const record = async (item, status, urlOverride, by) => {
    const row = { source: item.src, row_id: item.id, field: item.field, url: urlOverride || item.url, status, reviewed_by: by || user?.username || "admin" };
    const res = await api.insert("ms_photo_review", row).catch(() => null);
    if (Array.isArray(res)) setReviews(prev => [...prev, res[0]]);
  };
  const setField = async (item, value) => {
    const table = item.src === "vehicle" ? "scrapyard_vehicles" : "scrapyard_parts";
    const res = await api.patch(table, "id", item.id, { [item.field]: value });
    if (res && !Array.isArray(res) && (res.code || res.message)) throw new Error(res.message || res.code);
    if (item.src === "vehicle") setVehs(prev => prev.map(v => v.id === item.id ? { ...v, [item.field]: value } : v));
    else setParts(prev => prev.map(p => p.id === item.id ? { ...p, [item.field]: value } : p));
  };

  const scanAll = async () => {
    stopRef.current = false;
    const todo = pending.filter(i => flags[i.key] === undefined);
    setScan({ done: 0, total: todo.length });
    let auto = 0, needs = 0;
    for (let n = 0; n < todo.length; n++) {
      if (stopRef.current) break;
      const it = todo[n];
      try {
        const img = await loadImg(proxied(it.url, true));
        const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        const boxes = await detectSensitiveBoxes(c);
        setFlags(prev => ({ ...prev, [it.key]: boxes.length }));
        if (boxes.length === 0 && autoClean) { await record(it, "clean", undefined, "auto-scan"); auto++; }
        else if (boxes.length > 0) needs++;
      } catch { setFlags(prev => ({ ...prev, [it.key]: -1 })); needs++; }
      setScan({ done: n + 1, total: todo.length });
    }
    setScan(null);
    showToast(`Scan done — ${auto} clean (approved automatically), ${needs} need a look`);
  };

  return (
    <div>
      {err && <div className="card" style={{ padding: 14, color: "var(--yellow)", fontSize: 13, marginBottom: 14 }}>{err}</div>}
      {!err && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{pending.length} new photo{pending.length !== 1 ? "s" : ""} to review</span>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>of {items.length}</span>
            {scan
              ? <button className="btn btn-ghost btn-sm" onClick={() => { stopRef.current = true; }}>⏹ Stop ({scan.done}/{scan.total})</button>
              : <button className="btn btn-primary btn-sm" disabled={!pending.length || loading} onClick={scanAll}>🔎 Scan new photos for text</button>}
            <label style={{ marginLeft: "auto", fontSize: 12, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }} title="Photos with no text found are approved by the scan and hidden from this list">
              <input type="checkbox" checked={autoClean} onChange={e => { setAutoClean(e.target.checked); try { localStorage.setItem("ms_autoclean", e.target.checked ? "1" : "0"); } catch { /* storage unavailable */ } }} /> Auto-approve clean photos
            </label>
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show reviewed too
            </label>
            <button className="btn btn-ghost btn-sm" disabled={loading} onClick={load}>{loading ? "⏳" : "🔄"}</button>
          </div>
          {!shown.length && <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>{loading ? "Loading photos…" : "Nothing to review."}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10 }}>
            {shown.map(it => (
              <div key={it.key} className="card" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, borderColor: flags[it.key] > 0 ? "var(--red)" : "var(--border)" }}>
                <div style={{ position: "relative", aspectRatio: "4/3", background: "var(--surface2)", borderRadius: 8, overflow: "hidden", cursor: "pointer" }} onClick={() => setEditing(it)}>
                  <img src={proxied(it.url)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.opacity = .2; }} />
                  {flags[it.key] > 0 && <span style={{ position: "absolute", top: 4, left: 4, background: "var(--red)", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 6, padding: "1px 6px" }}>⚠ {flags[it.key]} text</span>}
                  {flags[it.key] === 0 && <span style={{ position: "absolute", top: 4, left: 4, background: "var(--green)", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 6, padding: "1px 6px" }}>✓ clean</span>}
                  {flags[it.key] === -1 && <span style={{ position: "absolute", top: 4, left: 4, background: "var(--yellow)", color: "#000", fontSize: 10, fontWeight: 800, borderRadius: 6, padding: "1px 6px" }}>scan failed</span>}
                  {it.status !== "new" && <span style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 10, borderRadius: 6, padding: "1px 6px" }}>{it.status}</span>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</div>
                <div style={{ fontSize: 10, color: "var(--text3)" }}>{it.yard} · {it.src} · {it.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {editing && (
        <PhotoEditor item={editing} onClose={() => setEditing(null)}
          onOk={async () => { await record(editing, "clean"); setFlags(p => ({ ...p, [editing.key]: 0 })); showToast("✓ Marked reviewed"); setEditing(null); }}
          onRemove={async () => {
            if (!window.confirm("Remove this photo from the listing?")) return;
            try { await setField(editing, null); await record(editing, "removed"); showToast("Photo removed"); setEditing(null); }
            catch (e) { showToast("❌ " + (e.message || e), "err"); }
          }}
          onSaved={async (newUrl) => {
            try { await setField(editing, newUrl); await record(editing, "fixed", newUrl); showToast("✅ Cleaned photo saved"); setEditing(null); }
            catch (e) { showToast("❌ " + (e.message || e), "err"); }
          }} />
      )}
    </div>
  );
}

// ── Editor: mosaic detected areas, draw extra boxes, save / remove / mark fine ──
function PhotoEditor({ item, onClose, onOk, onRemove, onSaved }) {
  const viewRef = useRef(null);
  const baseRef = useRef(null);            // pristine copy of the photo
  const [ready, setReady] = useState(false);
  const [boxes, setBoxes] = useState([]);  // {x0,y0,x1,y1,why}
  const [msg, setMsg] = useState("Loading photo…");
  const [busy, setBusy] = useState(false);
  const dragRef = useRef(null);

  const render = useCallback((bx, outline = true) => {
    const base = baseRef.current, view = viewRef.current;
    if (!base || !view) return;
    view.width = base.width; view.height = base.height;
    const ctx = view.getContext("2d");
    ctx.drawImage(base, 0, 0);
    mosaic(ctx, bx, view.width, view.height);
    if (outline) {
      ctx.lineWidth = Math.max(2, view.width / 400); ctx.strokeStyle = "#ef4444";
      bx.forEach(b => ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0));
    }
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const img = await loadImg(proxied(item.url, true));
        const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        if (dead) return;
        baseRef.current = c; setReady(true); setMsg("Finding phone numbers / company names…");
        render([]);
        const found = await detectSensitiveBoxes(c);
        if (dead) return;
        setBoxes(found); render(found);
        setMsg(found.length ? `${found.length} area(s) found and covered. Check, adjust, then save.` : "No text found. You can still draw boxes to cover anything.");
      } catch (e) { if (!dead) setMsg("❌ " + (e.message || e)); }
    })();
    return () => { dead = true; };
  }, [item.url, render]);

  const toImgXY = (e) => {
    const v = viewRef.current, r = v.getBoundingClientRect();
    return [(e.clientX - r.left) * v.width / r.width, (e.clientY - r.top) * v.height / r.height];
  };
  const down = (e) => { if (!ready) return; e.currentTarget.setPointerCapture?.(e.pointerId); const [x, y] = toImgXY(e); dragRef.current = { x, y }; };
  const move = (e) => {
    if (!dragRef.current) return;
    const [x, y] = toImgXY(e), d = dragRef.current;
    const tmp = [...boxes, { x0: Math.min(d.x, x), y0: Math.min(d.y, y), x1: Math.max(d.x, x), y1: Math.max(d.y, y), why: "manual" }];
    render(tmp);
  };
  const up = (e) => {
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    const [x, y] = toImgXY(e);
    const w = Math.abs(x - d.x), h = Math.abs(y - d.y);
    if (w < 8 || h < 8) { // a click, not a drag: remove the box under the pointer
      const hit = [...boxes].reverse().findIndex(b => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
      if (hit >= 0) { const idx = boxes.length - 1 - hit; const nb = boxes.filter((_, i) => i !== idx); setBoxes(nb); render(nb); }
      else render(boxes);
      return;
    }
    const nb = [...boxes, { x0: Math.min(d.x, x), y0: Math.min(d.y, y), x1: Math.max(d.x, x), y1: Math.max(d.y, y), why: "manual" }];
    setBoxes(nb); render(nb);
  };

  const save = async () => {
    const SCRIPT = getScriptUrl();
    if (!SCRIPT) { setMsg("⚙️ Set the Vehicle Script URL in Settings first (photos are uploaded through it)."); return; }
    setBusy(true); setMsg("Uploading cleaned photo…");
    try {
      render(boxes, false);                                   // no outlines in the saved picture
      const dataUrl = viewRef.current.toDataURL("image/jpeg", 0.88);
      const pad = (n) => String(n).padStart(2, "0"), now = new Date();
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const folderPath = `Scrapyard/${item.vin || "NO-VIN"}/${item.src === "vehicle" ? "Car Photos" : "Parts Photos"}`;
      const resp = await fetch(SCRIPT, { method: "POST", body: JSON.stringify({ image: dataUrl, filename: `${ts}_reviewed_${item.field}.jpg`, mimeType: "image/jpeg", folderPath }) });
      const result = await resp.json();
      if (!result.success) throw new Error(result.error || "Upload failed");
      await onSaved(result.url);
    } catch (e) { setMsg("❌ " + (e.message || e)); render(boxes); }
    setBusy(false);
  };

  return (
    <Overlay onClose={() => !busy && onClose()} wide>
      <MHead title="📷 Review photo" sub={`${item.label} · ${item.yard}`} onClose={() => !busy && onClose()} />
      <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>{msg}</div>
      <div style={{ background: "var(--surface2)", borderRadius: 8, overflow: "hidden", touchAction: "none" }}>
        <canvas ref={viewRef} style={{ width: "100%", display: "block", cursor: "crosshair", maxHeight: "60vh", objectFit: "contain" }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} />
      </div>
      <div style={{ fontSize: 11, color: "var(--text3)", margin: "6px 0 10px" }}>Drag on the photo to cover another area · click a red box to uncover it.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={busy || !ready || !boxes.length} onClick={save}>💾 Save with mosaic ({boxes.length})</button>
        <button className="btn btn-ghost" disabled={busy || !ready} onClick={onOk}>✓ Looks fine</button>
        <button className="btn btn-ghost" style={{ color: "var(--red)", marginLeft: "auto" }} disabled={busy} onClick={onRemove}>🗑 Remove photo</button>
      </div>
    </Overlay>
  );
}
