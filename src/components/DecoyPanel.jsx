import { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/api.js";
import { DECOYS, DECOY_IDS } from "../lib/decoys.js";

// Admin view of the decoy ("canary") parts: fake catalogue rows only a copier of the database would ever see.
// If one of these SKUs / OE numbers / names turns up on another site or price list, your catalogue was copied.

const google = (q) => `https://www.google.com/search?q=${encodeURIComponent(`"${q}"`)}`;

export function DecoyPanel() {
  const [alive, setAlive] = useState(null);   // how many decoy rows still exist in the database
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // read straight from the database — the app's own reads deliberately skip these rows
    fetch(`${SUPABASE_URL}/rest/v1/parts?id=in.(${DECOY_IDS.join(",")})&select=id`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
      .then(r => r.json()).then(r => setAlive(Array.isArray(r) ? r.length : null)).catch(() => setAlive(null));
  }, []);

  const copyAll = async () => {
    const text = DECOYS.map(d => `${d.sku}\t${d.oe}\t${d.name}`).join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
        <b>🪤 Decoy parts.</b> These {DECOYS.length} fake parts sit in your catalogue database. Your staff and customers never see them (the app skips them everywhere),
        but anyone who copies the catalogue straight from the database gets them too. <b>If one of these numbers shows up on another website, app or price list, your catalogue was copied.</b>
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: alive === DECOYS.length ? "var(--green)" : "var(--yellow)" }}>
            {alive === null ? "Checking…" : alive === DECOYS.length ? `✓ All ${alive} decoys are in place` : `⚠ Only ${alive} of ${DECOYS.length} decoys found — someone deleted some`}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={copyAll}>{copied ? "✅ Copied" : "📋 Copy the list"}</button>
        </div>
      </div>
      <div className="card" style={{ overflow: "hidden", marginBottom: 12 }}><div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>SKU</th><th>OE number</th><th>Name</th><th>Fits</th><th>Search the web</th></tr></thead>
        <tbody>{DECOYS.map(d => (
          <tr key={d.id}>
            <td style={{ fontFamily: "DM Mono,monospace", fontSize: 12, fontWeight: 700 }}>{d.sku}</td>
            <td style={{ fontFamily: "DM Mono,monospace", fontSize: 12 }}>{d.oe}</td>
            <td style={{ fontSize: 12 }}>{d.name}</td>
            <td style={{ fontSize: 11, color: "var(--text3)" }}>{d.make} {d.model}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              <a className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }} href={google(d.sku)} target="_blank" rel="noreferrer">SKU</a>{" "}
              <a className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }} href={google(d.oe)} target="_blank" rel="noreferrer">OE no.</a>
            </td>
          </tr>))}
        </tbody></table></div></div>
      <div className="card" style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: "var(--text2)" }}>
        <b>How to watch for copies</b>
        <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
          <li>Click "SKU" / "OE no." now and then — Google shows every page that contains that exact number.</li>
          <li>Better, set up a free <b>Google Alert</b> (google.com/alerts) for a few of the SKUs and OE numbers in quotes. Google emails you when a new page contains one.</li>
          <li>Also search the same numbers on marketplaces and on the sites of rival parts sellers.</li>
          <li>Do not delete, rename or sell these parts. They are stock 0 and price 0.</li>
        </ol>
        <div style={{ marginTop: 8, color: "var(--text3)" }}>
          Limits: this shows <i>that</i> the catalogue was copied, not <i>who</i> did it. A person who reads the site's code can find the list of decoy ids in it, so it works best against ordinary copying tools.
        </div>
      </div>
    </div>
  );
}
