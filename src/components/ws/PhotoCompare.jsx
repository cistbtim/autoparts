import { useState, useEffect, useRef } from "react";
import { Overlay, MHead } from "../shared.jsx";
import { angleOf } from "../../lib/marketplace.js";

// Side-by-side photo comparison: YOUR CAR (left) vs the scrapyard vehicle (right). Each side has its own
// photo choice and its own pan / zoom (drag to move, wheel or pinch to zoom, double-click to reset), so one
// detail — a bumper edge, a headlight — can be lined up on both. "Link" makes both sides move together.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const START = { x: 0, y: 0, s: 1 };

function Pane({ title, sub, photos, idx, setIdx, view, setView, empty, accent }) {
  const boxRef = useRef(null);
  const ptrs = useRef(new Map());     // active pointers (for drag + pinch)
  const last = useRef(null);          // {x,y} of the single dragging pointer / {d} pinch distance
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const photo = photos[idx] || null;

  // wheel zoom needs a non-passive listener to stop the page scrolling
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const v = viewRef.current, s2 = clamp(v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 10), k = s2 / v.s;
      setView({ s: s2, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const down = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); last.current = ptrs.current.size === 2 ? { d: null } : { x: e.clientX, y: e.clientY }; };
  const move = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = viewRef.current;
    if (ptrs.current.size === 2) {                                   // pinch
      const [a, b] = [...ptrs.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (last.current?.d) {
        const r = boxRef.current.getBoundingClientRect(), cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
        const s2 = clamp(v.s * d / last.current.d, 1, 10), k = s2 / v.s;
        setView({ s: s2, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
      }
      last.current = { d };
    } else if (last.current && last.current.x !== undefined) {       // drag
      const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      setView({ ...v, x: v.x + dx, y: v.y + dy });
    }
  };
  const up = (e) => { ptrs.current.delete(e.pointerId); last.current = ptrs.current.size === 1 ? { x: [...ptrs.current.values()][0].x, y: [...ptrs.current.values()][0].y } : null; };
  const zoomBy = (f) => { const el = boxRef.current, r = el.getBoundingClientRect(), v = view, s2 = clamp(v.s * f, 1, 10), k = s2 / v.s, cx = r.width / 2, cy = r.height / 2; setView({ s: s2, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }); };

  return (
    <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 12, color: accent }}>{title}</span>
        <span style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button className="btn btn-ghost btn-xs" onClick={() => zoomBy(1 / 1.3)} disabled={!photo}>−</button>
          <button className="btn btn-ghost btn-xs" onClick={() => zoomBy(1.3)} disabled={!photo}>＋</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setView(START)} disabled={!photo}>Reset</button>
        </span>
      </div>
      <div ref={boxRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => setView(START)}
        style={{ position: "relative", height: "min(52vh, 460px)", background: "#111", borderRadius: 10, overflow: "hidden", touchAction: "none", cursor: photo ? "grab" : "default", border: `2px solid ${accent}` }}>
        {photo
          ? <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, willChange: "transform" }}>
              <img src={photo.url} alt={photo.label} draggable={false} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "contain", userSelect: "none", pointerEvents: "none" }} />
            </div>
          : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12, textAlign: "center", padding: 16 }}>{empty}</div>}
        {photo && <span style={{ position: "absolute", left: 8, bottom: 6, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "1px 8px" }}>{photo.label}{view.s > 1 ? ` · ${view.s.toFixed(1)}×` : ""}</span>}
      </div>
      <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
        {photos.map((p, i) => (
          <div key={i} onClick={() => setIdx(i)} title={p.label}
            style={{ position: "relative", flex: "0 0 auto", width: 74, height: 56, borderRadius: 6, overflow: "hidden", cursor: "pointer", border: `2px solid ${i === idx ? accent : "transparent"}`, opacity: i === idx ? 1 : .7 }}>
            <img src={p.thumb || p.url} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.opacity = .2; }} />
            <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 8, fontWeight: 700, textAlign: "center" }}>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** left / right: { title, sub, photos: [{label, url, thumb?}] } */
export function WsPhotoCompare({ left, right, onClose, startL = 0, startR = 0 }) {
  const [li, setLi] = useState(startL), [ri, setRi] = useState(startR);
  const [lv, setLv] = useState(START), [rv, setRv] = useState(START);
  const [link, setLink] = useState(false);

  const setL = (v) => { setLv(v); if (link) setRv(v); };
  const setR = (v) => { setRv(v); if (link) setLv(v); };
  // choosing a photo on one side jumps the other side to the same angle (front ↔ front …) and resets the zoom
  const pick = (side, i) => {
    const a = angleOf((side === "l" ? left : right).photos[i]?.label);
    const other = side === "l" ? right.photos : left.photos;
    const j = a ? other.findIndex(p => angleOf(p.label) === a) : -1;
    if (side === "l") { setLi(i); if (j >= 0) setRi(j); } else { setRi(i); if (j >= 0) setLi(j); }
    setLv(START); setRv(START);
  };

  return (
    <Overlay onClose={onClose} wide maxWidth={1180}>
      <MHead title="🔍 Compare photos" sub="Drag to move · wheel / pinch to zoom · double-click to reset" onClose={onClose}
        actions={<label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={link} onChange={e => { setLink(e.target.checked); if (e.target.checked) setRv(lv); }} /> Move both together</label>} />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Pane title="YOUR CAR" sub={left.sub} photos={left.photos} idx={li} setIdx={i => pick("l", i)} view={lv} setView={setL} accent="#14b8a6"
          empty="No photos of this car on the job yet — add them on the job card." />
        <Pane title="SCRAPYARD" sub={right.sub} photos={right.photos} idx={ri} setIdx={i => pick("r", i)} view={rv} setView={setR} accent="#ff7a2e"
          empty="No photos for this vehicle." />
      </div>
    </Overlay>
  );
}
