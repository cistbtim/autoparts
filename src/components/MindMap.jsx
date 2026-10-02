import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api.js";
import { makeId } from "../lib/helpers.js";

const NODE_W = 160, NODE_H = 46;
const COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#f472b6", "#94a3b8"];
const CANVAS_W = 3000, CANVAS_H = 2000;

function newNode(x, y) {
  return { id: makeId("MMN"), x, y, text: "New idea", color: COLORS[0] };
}

// ═══════════════════════════════════════════════════════════════
// EDITOR — one mind map's canvas
// ═══════════════════════════════════════════════════════════════
function MindMapEditor({ map, onBack, showToast }) {
  const [name, setName] = useState(map.name);
  const [nodes, setNodes] = useState(map.data?.nodes || []);
  const [edges, setEdges] = useState(map.data?.edges || []);
  const [selected, setSelected] = useState(null);
  const [editingText, setEditingText] = useState(null); // node id mid-edit
  const [connectFrom, setConnectFrom] = useState(null);
  const [tool, setTool] = useState("select"); // select | connect | unlink
  const [linkSource, setLinkSource] = useState(null); // first node picked in connect tool
  const [tempLine, setTempLine] = useState(null); // {x1,y1,x2,y2}
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef(null);

  const markDirty = () => setDirty(true);

  const updateNode = (id, patch) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
    markDirty();
  };

  const addNode = () => {
    const canvas = canvasRef.current;
    const cx = canvas ? canvas.scrollLeft + canvas.clientWidth / 2 - NODE_W / 2 : 400;
    const cy = canvas ? canvas.scrollTop + canvas.clientHeight / 2 - NODE_H / 2 : 300;
    const n = newNode(cx + (Math.random() * 60 - 30), cy + (Math.random() * 60 - 30));
    setNodes(prev => [...prev, n]);
    setSelected(n.id);
    setEditingText(n.id);
    markDirty();
  };

  const deleteNode = (id) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
    if (selected === id) setSelected(null);
    markDirty();
  };

  const deleteEdge = (idx) => {
    setEdges(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const relPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + canvasRef.current.scrollLeft,
      y: e.clientY - rect.top + canvasRef.current.scrollTop,
    };
  };

  const pickTool = (t) => { setTool(t); setLinkSource(null); setEditingText(null); setConnectFrom(null); setTempLine(null); };

  const clickNode = (node) => {
    if (tool === "connect") {
      if (!linkSource) { setLinkSource(node.id); return; }
      if (linkSource !== node.id) {
        const exists = edges.some(ed => (ed.from === linkSource && ed.to === node.id) || (ed.from === node.id && ed.to === linkSource));
        if (!exists) { setEdges(prev => [...prev, { from: linkSource, to: node.id }]); markDirty(); }
      }
      setLinkSource(null);
      return;
    }
    if (tool === "unlink") return;
    if (!connectFrom) { setSelected(node.id); setEditingText(node.id); }
  };

  const dragNode = (e, node) => {
    if (tool !== "select") { e.stopPropagation(); return; }
    if (editingText === node.id) return;
    e.stopPropagation();
    setSelected(node.id);
    const startX = e.clientX, startY = e.clientY;
    const origX = node.x, origY = node.y;
    let moved = false;
    const onMove = (ev) => {
      moved = true;
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      updateNode(node.id, { x: Math.max(0, origX + dx), y: Math.max(0, origY + dy) });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const startConnect = (e, node) => {
    e.stopPropagation();
    setConnectFrom(node.id);
  };

  const onCanvasMouseMove = (e) => {
    if (!connectFrom) return;
    const from = nodes.find(n => n.id === connectFrom);
    if (!from) return;
    const p = relPoint(e);
    setTempLine({ x1: from.x + NODE_W / 2, y1: from.y + NODE_H / 2, x2: p.x, y2: p.y });
  };

  const finishConnect = (targetId) => {
    if (connectFrom && targetId && targetId !== connectFrom) {
      const exists = edges.some(ed => (ed.from === connectFrom && ed.to === targetId) || (ed.from === targetId && ed.to === connectFrom));
      if (!exists) { setEdges(prev => [...prev, { from: connectFrom, to: targetId }]); markDirty(); }
    }
    setConnectFrom(null);
    setTempLine(null);
  };

  const onCanvasMouseUp = () => { if (connectFrom) finishConnect(null); };
  const onCanvasClick = () => { setSelected(null); setEditingText(null); setLinkSource(null); };

  const save = async () => {
    setSaving(true);
    const res = await api.patch("mind_maps", "id", map.id, { name, data: { nodes, edges }, updated_at: new Date().toISOString() }).catch(e => ({ message: e.message }));
    setSaving(false);
    if (res?.code || res?.message) { showToast(`Save failed: ${res.message || res.code}`, "err"); return; }
    setDirty(false);
    showToast("Mind map saved");
  };

  return (
    <div className="fu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>‹ Back</button>
          <input className="inp" value={name} onChange={e => { setName(e.target.value); markDirty(); }}
            style={{ fontWeight: 700, fontSize: 15, maxWidth: 320 }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {dirty && <span style={{ fontSize: 11, color: "var(--yellow)" }}>Unsaved changes</span>}
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "💾 Save"}</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div className="card" style={{ width: 150, flexShrink: 0, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em" }}>Toolbox</div>
        <button className={`btn btn-sm ${tool === "select" ? "btn-primary" : "btn-ghost"}`} onClick={() => pickTool("select")} title="Move and edit ideas">🖐 Select / Move</button>
        <button className="btn btn-ghost btn-sm" onClick={addNode}>➕ Add Idea</button>
        <button className={`btn btn-sm ${tool === "connect" ? "btn-primary" : "btn-ghost"}`} onClick={() => pickTool(tool === "connect" ? "select" : "connect")} title="Click one idea, then another">🔗 Add Line</button>
        <button className={`btn btn-sm ${tool === "unlink" ? "btn-danger" : "btn-ghost"}`} onClick={() => pickTool(tool === "unlink" ? "select" : "unlink")} title="Click a line to remove it">✂ Remove Line</button>
        {tool === "connect" && <div style={{ fontSize: 11, color: "var(--text3)" }}>{linkSource ? "Now click the idea to link to." : "Click the first idea."}</div>}
        {tool === "unlink" && <div style={{ fontSize: 11, color: "var(--text3)" }}>Click a line to remove it.</div>}
        {selected && tool === "select" && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 6 }}>Selected idea</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {COLORS.map(c => (
                <button key={c} onClick={() => updateNode(selected, { color: c })}
                  title={c} style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: nodes.find(n => n.id === selected)?.color === c ? "2px solid var(--text)" : "1px solid var(--border)", cursor: "pointer", padding: 0 }} />
              ))}
            </div>
            <button className="btn btn-danger btn-xs" onClick={() => deleteNode(selected)}>🗑 Delete idea</button>
          </>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div ref={canvasRef} onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp} onClick={onCanvasClick}
          style={{
            position: "relative", width: "100%", height: "65vh", overflow: "auto",
            background: "radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0/18px 18px, var(--bg)",
            cursor: connectFrom || tool === "connect" ? "crosshair" : tool === "unlink" ? "pointer" : "default",
          }}>
          <div style={{ position: "relative", width: CANVAS_W, height: CANVAS_H }}>
            <svg width={CANVAS_W} height={CANVAS_H} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
              {edges.map((ed, i) => {
                const from = nodes.find(n => n.id === ed.from), to = nodes.find(n => n.id === ed.to);
                if (!from || !to) return null;
                const x1 = from.x + NODE_W / 2, y1 = from.y + NODE_H / 2, x2 = to.x + NODE_W / 2, y2 = to.y + NODE_H / 2;
                return (
                  <g key={i} style={{ pointerEvents: "stroke", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); if (tool === "unlink" || window.confirm("Remove this connection?")) deleteEdge(i); }}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border2)" strokeWidth={8} opacity={0} />
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tool === "unlink" ? "var(--red, #f87171)" : "var(--text3)"} strokeWidth={2} />
                  </g>
                );
              })}
              {tempLine && <line x1={tempLine.x1} y1={tempLine.y1} x2={tempLine.x2} y2={tempLine.y2} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5,4" />}
            </svg>

            {nodes.length === 0 && (
              <div style={{ position: "absolute", top: 40, left: 40, color: "var(--text3)", fontSize: 13 }}>
                Click "Add Idea" in the toolbox to place your first node, then use "Add Line" to connect ideas.
              </div>
            )}

            {nodes.map(node => (
              <div key={node.id} onMouseDown={(e) => dragNode(e, node)}
                onMouseUp={(e) => { if (connectFrom) { e.stopPropagation(); finishConnect(node.id); } }}
                onClick={(e) => { e.stopPropagation(); clickNode(node); }}
                style={{
                  position: "absolute", left: node.x, top: node.y, width: NODE_W, minHeight: NODE_H,
                  background: (node.color || COLORS[0]) + "22", border: `1.5px solid ${node.color || COLORS[0]}`,
                  borderRadius: 12, padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: tool === "select" ? "grab" : "pointer", userSelect: "none", boxShadow: linkSource === node.id ? "0 0 0 3px var(--accent)" : selected === node.id ? `0 0 0 2px ${node.color || COLORS[0]}` : "var(--shadow)",
                }}>
                {editingText === node.id ? (
                  <input autoFocus className="inp" value={node.text} onChange={e => updateNode(node.id, { text: e.target.value })}
                    onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onBlur={() => setEditingText(null)}
                    onKeyDown={e => { if (e.key === "Enter") setEditingText(null); }}
                    style={{ fontSize: 12, padding: "4px 6px", textAlign: "center" }} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, textAlign: "center", wordBreak: "break-word", color: "var(--text)" }}>
                    {node.text}
                  </span>
                )}
                {selected === node.id && editingText !== node.id && (
                  <div onMouseDown={(e) => startConnect(e, node)} title="Drag to connect to another idea"
                    style={{ position: "absolute", right: -8, top: -8, width: 18, height: 18, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, cursor: "crosshair" }}>
                    ⚭
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LIST — pick or create a mind map
// ═══════════════════════════════════════════════════════════════
export function MindMapPage({ showToast }) {
  const [maps, setMaps] = useState(null); // null = loading
  const [openMap, setOpenMap] = useState(null);

  const load = useCallback(async () => {
    const res = await api.get("mind_maps", "select=id,name,updated_at&order=updated_at.desc").catch(() => []);
    setMaps(Array.isArray(res) ? res : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createNew = async () => {
    const row = { id: makeId("MM"), name: "New Mind Map", data: { nodes: [], edges: [] } };
    const res = await api.insert("mind_maps", row).catch(e => ({ message: e.message }));
    if (res?.code || res?.message) { showToast(`Create failed: ${res?.message || res?.code}`, "err"); return; }
    setOpenMap(row);
  };

  const openExisting = async (id) => {
    const res = await api.get("mind_maps", `id=eq.${id}&select=*`).catch(() => []);
    const row = Array.isArray(res) ? res[0] : null;
    if (row) setOpenMap(row);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this mind map? This cannot be undone.")) return;
    await api.delete("mind_maps", "id", id).catch(() => {});
    showToast("Deleted", "err");
    load();
  };

  if (openMap) {
    return <MindMapEditor map={openMap} showToast={showToast} onBack={() => { setOpenMap(null); load(); }} />;
  }

  return (
    <div className="fu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div><h1 style={{ fontSize: 20, fontWeight: 700 }}>🧠 Mind Maps</h1><p style={{ color: "var(--text3)", fontSize: 13, marginTop: 3 }}>{maps?.length || 0} saved</p></div>
        <button className="btn btn-primary" onClick={createNew}>+ New Mind Map</button>
      </div>
      {maps === null && <div style={{ color: "var(--text3)", fontSize: 13 }}>Loading…</div>}
      {maps?.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>
          No mind maps yet. Create one to start brainstorming.
        </div>
      )}
      {maps?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
          {maps.map(m => (
            <div key={m.id} className="card card-hover" onClick={() => openExisting(m.id)} style={{ padding: 16, cursor: "pointer" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>🧠 {m.name}</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 12 }}>Updated {m.updated_at ? new Date(m.updated_at).toLocaleString() : "—"}</div>
              <button className="btn btn-danger btn-xs" onClick={(e) => { e.stopPropagation(); del(m.id); }}>🗑 Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
