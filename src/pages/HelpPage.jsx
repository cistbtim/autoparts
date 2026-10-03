import { useState, useEffect, useMemo, useRef } from "react";
import { CSS } from "../styles.js";
import { VelGeniusBanner } from "../components/shared.jsx";
import { TUTORIALS, TUTORIAL_CATEGORIES, tutorialById, searchTutorials, helpUrl, videoSrc, posterSrc } from "../lib/tutorials.js";

// Page-local styles (hc- prefix). Colours come from the app's CSS variables.
const HC_CSS = `
.hc-wrap{max-width:980px;margin:0 auto;padding:20px 16px 56px}
.hc-search{position:relative;margin:22px 0 14px}
.hc-search input{width:100%;font-size:17px;padding:15px 44px 15px 48px;border-radius:14px;background:var(--surface);border:1.5px solid var(--border2);color:var(--text)}
.hc-search input:focus{border-color:var(--accent)}
.hc-search .hc-mag{position:absolute;left:17px;top:50%;transform:translateY(-50%);font-size:18px;pointer-events:none}
.hc-search .hc-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:none;background:var(--surface3);color:var(--text2);cursor:pointer;font-size:14px}
.hc-pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.hc-pill{padding:7px 14px;border-radius:99px;border:1px solid var(--border2);background:var(--surface);color:var(--text2);font-size:13px;font-weight:600;cursor:pointer}
.hc-pill.on{background:var(--accent);border-color:var(--accent);color:#fff}
.hc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px}
.hc-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;cursor:pointer;text-align:left;padding:0;display:flex;flex-direction:column;transition:transform .15s,border-color .15s,box-shadow .15s;font-family:inherit;color:inherit}
.hc-card:hover,.hc-card:focus-visible{transform:translateY(-2px);border-color:var(--accent);box-shadow:0 8px 22px rgba(0,0,0,.12)}
.hc-thumb{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#1c2233,#3a2412);display:flex;align-items:center;justify-content:center;overflow:hidden}
.hc-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.hc-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.hc-play span{width:46px;height:46px;border-radius:50%;background:rgba(255,122,46,.94);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;padding-left:3px;box-shadow:0 4px 14px rgba(0,0,0,.35)}
.hc-dur{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.72);color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px}
.hc-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px;flex:1}
.hc-tag{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--accent)}
.hc-title{font-size:15.5px;font-weight:700;line-height:1.3;color:var(--text)}
.hc-sum{font-size:13px;line-height:1.5;color:var(--text3)}
.hc-step{display:flex;gap:14px;padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:12px}
.hc-num{flex:0 0 30px;height:30px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px}
.hc-video{width:100%;display:block;border-radius:14px;background:#000;aspect-ratio:16/10;box-shadow:0 8px 28px rgba(0,0,0,.2)}
.hc-chip{padding:7px 13px;border-radius:99px;border:1px solid var(--border2);background:var(--surface);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.hc-chip:hover{border-color:var(--accent);color:var(--accent)}
@media(max-width:560px){.hc-search input{font-size:16px}.hc-title{font-size:15px}}
`;

const parseUrl = () => {
  const p = new URLSearchParams(window.location.search);
  return { id: p.get("help") || "", q: p.get("q") || "" };
};

export function HelpPage() {
  const [selectedId, setSelectedId] = useState(() => parseUrl().id);
  const [query, setQuery] = useState(() => parseUrl().q);
  const [category, setCategory] = useState("All");
  const [copied, setCopied] = useState(false);
  const searchRef = useRef(null);

  const selected = tutorialById(selectedId);
  const results = useMemo(() => searchTutorials(query, category), [query, category]);

  const go = (id) => {
    setSelectedId(id);
    const url = id ? helpUrl(id) : helpUrl();
    window.history.pushState({}, "", url);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onPop = () => setSelectedId(parseUrl().id);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = selected ? `${selected.title} · VelGenius Help` : "VelGenius Help Center";
  }, [selected]);

  useEffect(() => { if (!selected) searchRef.current?.focus(); }, [selected]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(helpUrl(selected.id)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  const appUrl = `${window.location.origin}${window.location.pathname}`;

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: "var(--text)" }}>
      <style>{CSS}</style>
      <style>{HC_CSS}</style>
      <div className="hc-wrap">
        <VelGeniusBanner t={{ appTagline: "Help Center · learn how to use every feature" }} />

        {!selected && (
          <>
            <div className="hc-search">
              <span className="hc-mag">🔍</span>
              <input ref={searchRef} type="search" value={query} placeholder="Search tutorials, e.g. booking"
                onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Escape") setQuery(""); }} aria-label="Search tutorials" />
              {query && <button className="hc-clear" onClick={() => setQuery("")} aria-label="Clear search">✕</button>}
            </div>

            <div className="hc-pills" role="group" aria-label="Filter by topic">
              {["All", ...TUTORIAL_CATEGORIES].map(c => (
                <button key={c} className={"hc-pill" + (category === c ? " on" : "")} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>

            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 12 }}>
              {query || category !== "All"
                ? `${results.length} of ${TUTORIALS.length} tutorials`
                : `${TUTORIALS.length} tutorials · ${TUTORIALS.filter(t => t.video).length} with video`}
            </div>

            {results.length === 0 ? (
              <div className="card" style={{ padding: 36, textAlign: "center" }}>
                <div style={{ fontSize: 38, marginBottom: 8 }}>🤔</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>No tutorials match “{query}”</div>
                <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16 }}>Try a shorter word, like “booking” or “vehicle”.</div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setQuery(""); setCategory("All"); }}>Show all tutorials</button>
              </div>
            ) : (
              <div className="hc-grid">
                {results.map(t => (
                  <button key={t.id} className="hc-card" onClick={() => go(t.id)}>
                    <div className="hc-thumb">
                      {t.video ? <img src={posterSrc(t.video)} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }} /> : <span style={{ fontSize: 40 }}>📄</span>}
                      {t.video && <div className="hc-play"><span>▶</span></div>}
                      {t.duration && <div className="hc-dur">{t.duration}</div>}
                    </div>
                    <div className="hc-body">
                      <div className="hc-tag">{t.module} · {t.category}</div>
                      <div className="hc-title">{t.title}</div>
                      <div className="hc-sum">{t.summary}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {selected && (
          <div style={{ marginTop: 22, maxWidth: 780, marginInline: "auto" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => go("")}>‹ All tutorials</button>
            <div className="hc-tag" style={{ marginTop: 18 }}>{selected.module} · {selected.category}</div>
            <h1 style={{ fontSize: 26, lineHeight: 1.25, margin: "6px 0 8px", fontWeight: 800 }}>{selected.title}</h1>
            <p style={{ color: "var(--text3)", fontSize: 15, lineHeight: 1.55, marginBottom: 18 }}>{selected.summary}</p>

            {selected.video && (
              <video key={selected.id} className="hc-video" controls playsInline preload="metadata" poster={posterSrc(selected.video)}>
                <source src={videoSrc(selected.video)} type="video/mp4" />
                Your browser can't play this video. The steps below cover the same thing.
              </video>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0 6px" }}>
              <button className="btn btn-ghost btn-sm" onClick={copyLink}>{copied ? "✅ Link copied" : "🔗 Copy link"}</button>
              <a className="btn btn-primary btn-sm" href={appUrl} style={{ textDecoration: "none" }}>Open VelGenius →</a>
            </div>

            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "26px 0 12px" }}>Steps</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {selected.steps.map((s, i) => (
                <div key={i} className="hc-step">
                  <div className="hc-num">{i + 1}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{s.title}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text2)" }}>{s.text}</div>
                  </div>
                </div>
              ))}
            </div>

            {selected.tips?.length > 0 && (
              <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 12, background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.3)" }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>💡 Good to know</div>
                {selected.tips.map((tip, i) => <div key={i} style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text2)" }}>• {tip}</div>)}
              </div>
            )}

            {selected.related?.length > 0 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "28px 0 12px" }}>Related</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selected.related.map(id => tutorialById(id)).filter(Boolean).map(r => (
                    <button key={r.id} className="hc-chip" onClick={() => go(r.id)}>{r.video ? "🎬" : "📄"} {r.title}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
