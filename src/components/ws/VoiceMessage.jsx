import { useState, useEffect, useRef, useMemo } from "react";
import { Overlay, MHead } from "../shared.jsx";

// Voice → draft. The owner says e.g. "通知 Johnny 车修好了" / "tell Johnny his car is ready";
// we transcribe it in the browser (Web Speech API — no server, no cost), spot the customer and the
// kind of message with simple keyword rules, and hand a draft to the customer-message window.
// Nothing is sent from here — the owner still reviews and taps send.

const KEYWORDS = {
  ready:    [/修好|好了|完成|做好|可以取|来取|取车|取走/, /\b(ready|done|finished|fixed|collect|pick ?up)\b/i],
  parts:    [/零件|配件|到货|到了|货到/, /\b(parts?|arrived|arrive|delivered|stock)\b/i],
  confirm:  [/确认|预约了|订好|已预约/, /\b(confirm|confirmed|booked|booking)\b/i],
  reminder: [/提醒|明天|后天|别忘/, /\b(remind|reminder|tomorrow|don'?t forget)\b/i],
};
// Order matters: "parts arrived" must win over a stray "ready", and a reminder over "confirm".
const ORDER = ["parts", "reminder", "confirm", "ready"];

function detectTpl(text) {
  for (const k of ORDER) if (KEYWORDS[k].some(re => re.test(text))) return k;
  return null;
}

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9㐀-鿿]/g, "");
const cjk = (s) => /[㐀-鿿]/.test(s || "");

// Rank people (from jobs + bookings) against the spoken sentence.
function findPeople(text, jobs, bookings, resolveModel = (mk, md) => md) {
  const spoken = norm(text);
  const spokenWords = (text || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const people = [];
  const seen = new Set();
  const add = (p) => {
    const key = `${norm(p.name)}|${norm(p.phone)}|${norm(p.reg)}`;
    if (!p.name || seen.has(key)) return;
    seen.add(key);
    people.push(p);
  };
  jobs.filter(j => !j.is_cancelled).forEach(j => add({
    name: j.customer_name, phone: j.customer_phone, reg: j.vehicle_reg, make: j.vehicle_make, model: resolveModel(j.vehicle_make, j.vehicle_model), year: j.vehicle_year || "",
    when: j.date_in || j.created_at || "", active: j.status !== "Paid", src: "job", status: j.status,
  }));
  bookings.filter(b => b.status !== "deleted").forEach(b => add({
    name: b.customer_name, phone: b.customer_phone, reg: b.vehicle_reg, make: b.vehicle_make, model: resolveModel(b.vehicle_make, b.vehicle_model), year: b.vehicle_year || "",
    when: b.created_at || "", active: b.status !== "cancelled", src: "booking", status: b.status,
  }));
  return people.map(p => {
    let score = 0;
    const full = norm(p.name);
    const first = (p.name || "").trim().split(/\s+/)[0] || "";
    if (full && full.length >= 2 && spoken.includes(full)) score += 4;
    else if (cjk(p.name)) {
      // Chinese names: a spoken surname+given name or just the given name (2+ chars) is a strong hint
      const given = full.slice(1);
      if (given.length >= 2 && spoken.includes(given)) score += 3;
    } else if (first.length >= 3 && spokenWords.includes(first.toLowerCase())) score += 3;
    const reg = norm(p.reg);
    if (reg.length >= 4 && spoken.includes(reg)) score += 4;
    if (score > 0 && p.active) score += 1;
    return { ...p, score };
  }).sort((a, b) => b.score - a.score || (b.when || "").localeCompare(a.when || ""));
}

const L = {
  zh: {
    title: "🎤 语音发消息", sub: "说一句话，例如：「通知 Johnny 车修好了」。",
    start: "🎤 开始说话", stop: "⏹ 停止", listening: "正在听…",
    unsupported: "这个浏览器不支持语音识别 — 请直接在下面打字。推荐 Chrome 或安卓手机。",
    placeholder: "说出的话会显示在这里，也可以直接打字…",
    kind: "消息类型", who: "客户", none: "没有找到匹配的客户 — 请从下面选一位，或换个说法再试。",
    tpl: { confirm: "预约确认", reminder: "预约提醒", parts: "零件到货", ready: "车已修好" },
    draft: "✉ 生成消息草稿", find: "🔍 识别", denied: "无法使用麦克风 — 请在浏览器里允许麦克风权限。",
    other: "其他客户", match: "匹配", privacy: "语音由浏览器识别（Chrome 会把录音发给 Google 转成文字）。",
  },
  en: {
    title: "🎤 Voice message", sub: 'Say something like: "Tell Johnny his car is ready".',
    start: "🎤 Start speaking", stop: "⏹ Stop", listening: "Listening…",
    unsupported: "This browser doesn't support voice recognition — type below instead. Chrome or an Android phone works best.",
    placeholder: "What you say appears here — or just type it…",
    kind: "Message type", who: "Customer", none: "No matching customer found — pick one below or try rephrasing.",
    tpl: { confirm: "Booking confirmed", reminder: "Reminder", parts: "Parts arrived", ready: "Car ready" },
    draft: "✉ Draft message", find: "🔍 Detect", denied: "Microphone unavailable — allow microphone access in your browser.",
    other: "Other customers", match: "match", privacy: "Speech is transcribed by the browser (Chrome sends the audio to Google).",
  },
};

export function WsVoiceMessageModal({ jobs = [], bookings = [], resolveModel, onDraft, onClose, initialLang = "zh" }) {
  const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const [lang, setLang] = useState(initialLang);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState("");
  const [tpl, setTpl] = useState(null);
  const [pick, setPick] = useState(0);
  const recRef = useRef(null);
  const T = L[lang];

  const people = useMemo(() => findPeople(text, jobs, bookings, resolveModel), [text, jobs, bookings, resolveModel]);
  const matches = people.filter(p => p.score > 0);
  const detected = detectTpl(text);

  // Re-detect whenever the sentence changes; the owner can still override with the chips.
  useEffect(() => { setTpl(detected); setPick(0); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* not running */ } }, []);

  const start = () => {
    if (!SR) return;
    setErr(""); setText("");
    const rec = new SR();
    rec.lang = lang === "zh" ? "zh-CN" : "en-ZA";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(s);
    };
    rec.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") setErr(T.denied); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };
  const stop = () => { try { recRef.current?.stop(); } catch { /* already stopped */ } };

  // Candidates shown: the matches if any, otherwise the most recent customers to pick from.
  const shown = (matches.length ? matches : people).slice(0, 6);
  const chosen = shown[pick] || null;
  const effTpl = tpl || (chosen?.src === "booking" ? "confirm" : "ready");

  return (
    <Overlay onClose={onClose}>
      <MHead title={T.title} sub={T.sub} onClose={onClose} />
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        {SR && (listening
          ? <button className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} onClick={stop}>{T.stop}</button>
          : <button className="btn btn-primary" onClick={start}>{T.start}</button>)}
        {listening && <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 700 }}>● {T.listening}</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[["zh", "中文"], ["en", "English"]].map(([v, lb]) => (
            <button key={v} className={`btn btn-xs ${lang === v ? "btn-primary" : "btn-ghost"}`} disabled={listening} onClick={() => setLang(v)}>{lb}</button>
          ))}
        </div>
      </div>
      {!SR && <div style={{ fontSize: 12, color: "var(--yellow)", marginBottom: 8 }}>{T.unsupported}</div>}
      {err && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 8 }}>{err}</div>}
      <textarea className="inp" rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={T.placeholder}
        style={{ width: "100%", resize: "vertical", fontFamily: "inherit", marginBottom: 10 }} />

      <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>{T.kind}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.keys(T.tpl).map(k => (
          <button key={k} className={`btn btn-xs ${effTpl === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTpl(k)}>{T.tpl[k]}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>{matches.length ? T.who : T.other}</div>
      {text.trim() && !matches.length && <div style={{ fontSize: 12, color: "var(--yellow)", marginBottom: 6 }}>{T.none}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, maxHeight: 220, overflowY: "auto" }}>
        {shown.map((p, i) => (
          <label key={`${p.name}${p.phone}${p.reg}${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer",
            border: `1.5px solid ${pick === i ? "var(--accent)" : "var(--border)"}`, background: pick === i ? "rgba(255,122,46,.08)" : "transparent" }}>
            <input type="radio" checked={pick === i} onChange={() => setPick(i)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>
                {[p.reg, [p.year, p.make, p.model].filter(Boolean).join(" "), p.phone].filter(Boolean).join(" · ")}
              </div>
            </div>
            {p.score > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green)" }}>✓ {T.match}</span>}
          </label>
        ))}
      </div>

      <button className="btn btn-primary" style={{ width: "100%", fontWeight: 700 }} disabled={!chosen}
        onClick={() => { onDraft({ name: chosen.name, phone: chosen.phone, reg: chosen.reg, make: chosen.make, model: chosen.model, year: chosen.year, date: "", defaultTpl: effTpl }); onClose(); }}>
        {T.draft}
      </button>
      <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 8 }}>{T.privacy}</div>
    </Overlay>
  );
}
