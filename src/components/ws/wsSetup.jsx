import { useState } from "react";
import { SETUP_SQL } from "./wsUtil.js";

// Friendly "one-time setup" box shown instead of an empty screen when the tables are missing.
export function SetupNotice({ what }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(SETUP_SQL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(251,191,36,.12)", border: "1px solid rgba(251,191,36,.4)", marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>⚙️ One-time setup needed</div>
      <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.5, marginBottom: 10 }}>
        {what} needs new database tables. Copy the SQL below and run it once in the Supabase SQL editor, then reload this page.
      </div>
      <pre style={{ fontSize: 11, background: "var(--surface2)", borderRadius: 8, padding: 10, maxHeight: 130, overflow: "auto", margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{SETUP_SQL}</pre>
      <button className="btn btn-primary btn-sm" onClick={copy}>{copied ? "✅ Copied" : "📋 Copy SQL"}</button>
    </div>
  );
}
