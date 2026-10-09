import { useState, useEffect, useRef, useMemo } from "react";
import { Overlay, MHead } from "../shared.jsx";

// Voice → draft. The owner says e.g. "通知 Johnny 车修好了" / "tell Johnny his car is ready";
// we transcribe it in the browser (Web Speech API — no server, no cost), spot the customer and the
// kind of message, and hand a draft to the customer-message window. Nothing is sent from here —
// the owner still reviews the draft and taps send.
//
// Made to need as few taps as possible: listening starts as soon as the window opens, and when the
// customer and message type are both clear it jumps to the draft by itself after a 2-second
// "opening draft…" countdown (cancellable). Speech recognition is imperfect, so customer matching
// is forgiving (near-spellings, partly matching Chinese names, the recogniser's alternative guesses)
// and it LEARNS: when a customer has to be picked by hand, the odd word that was heard is remembered
// and matches that customer next time.

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

const CJK = "㐀-鿿";
const norm = (s) => (s || "").toLowerCase().replace(new RegExp(`[^a-z0-9${CJK}]`, "g"), "");
const hasCJK = (s) => new RegExp(`[${CJK}]`).test(s || "");

// Edit distance — tolerates "Jonny" for "Johnny", "Vincent" for "Vinsent"…
function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// ── Learned spoken-word → customer aliases (this browser only) ───────────────
const ALIAS_KEY = "ws_voice_aliases";
const personKey = (p) => `${norm(p.name)}|${norm(p.phone)}`;
const loadAliases = () => { try { return JSON.parse(localStorage.getItem(ALIAS_KEY) || "{}"); } catch { return {}; } };
const saveAlias = (alias, key) => {
  try { const m = loadAliases(); m[alias] = key; localStorage.setItem(ALIAS_KEY, JSON.stringify(m)); } catch { /* storage unavailable */ }
};
// What is left of the sentence once command words are removed — usually the (misheard) name.
const STOP = /通知|告诉|提醒|发消息|给|的|了|车|客户|请|帮我|一下|修好|好了|完成|零件|配件|到货|到了|确认|预约|明天|后天|\b(tell|notify|message|text|his|her|the|car|is|has|are|to|please|him|about|that|my|ready|done|finished|fixed|parts?|arrived|booking|booked|confirm|confirmed|remind|reminder|tomorrow)\b/gi;
function leftover(text) {
  const t = (text || "").replace(STOP, " ").replace(new RegExp(`[^a-zA-Z0-9${CJK} ]`, "g"), " ").replace(/\s+/g, " ").trim().toLowerCase();
  return t.length >= 2 && t.length <= 24 ? t : "";
}

// Rank people (from jobs + bookings) against what was heard (the best guess plus the recogniser's alternatives).
function findPeople(text, jobs, bookings, resolveModel = (mk, md) => md, aliases = {}) {
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
    if (hasCJK(p.name)) {
      const chars = [...new Set([...full].filter(c => new RegExp(`[${CJK}]`).test(c)))];
      const hit = chars.filter(c => spoken.includes(c)).length;
      if (full.length >= 2 && spoken.includes(full)) score += 4;
      else if (chars.length >= 3 && hit >= chars.length - 1) score += 3;      // one syllable misheard
      else if (chars.length >= 2 && hit >= 2) score += 2;
    }
    const nameTokens = (p.name || "").toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3);
    for (const tok of nameTokens) {
      if (spokenWords.includes(tok)) { score += 3; break; }
      const near = spokenWords.some(w => w.length >= 3 && Math.abs(w.length - tok.length) <= 2 && lev(w, tok) <= (tok.length >= 7 ? 2 : 1));
      if (near) { score += 2; break; }
    }
    if (!hasCJK(p.name) && full.length >= 3 && spoken.includes(full)) score += 2;
    const reg = norm(p.reg);
    if (reg.length >= 4 && spoken.includes(reg)) score += 4;
    // a word the owner taught us earlier for this customer
    const key = personKey(p);
    for (const [alias, k] of Object.entries(aliases)) { if (k === key && alias && spoken.includes(norm(alias))) { score += 5; break; } }
    if (score > 0 && p.active) score += 1;
    return { ...p, score };
  }).sort((a, b) => b.score - a.score || (b.when || "").localeCompare(a.when || ""));
}

const L = {
  zh: {
    title: "🎤 语音发消息", sub: "说一句话，例如：「通知 Johnny 车修好了」。",
    startZh: "🎤 说中文", startEn: "🎤 English", stop: "⏹ 停止", listening: "正在听…",
    unsupported: "这个浏览器不支持语音识别 — 请直接在下面打字。推荐 Chrome 或安卓手机。",
    placeholder: "说出的话会显示在这里，也可以直接打字…",
    kind: "消息类型", who: "客户", none: "没有找到匹配的客户 — 请从下面选一位，或打字搜索。",
    tpl: { confirm: "预约确认", reminder: "预约提醒", parts: "零件到货", ready: "车已修好" },
    draft: "✉ 生成消息草稿", denied: "无法使用麦克风 — 请在浏览器里允许麦克风权限。",
    other: "最近的客户", match: "匹配", filter: "🔍 输入姓名 / 车牌 / 电话…",
    privacy: "语音由浏览器识别（Chrome 会把录音发给 Google 转成文字）。",
    auto: (n, tpl, s) => `✓ ${n} — ${tpl} · ${s} 秒后打开草稿`, cancel: "取消", learned: "已记住这个说法",
  },
  en: {
    title: "🎤 Voice message", sub: 'Say something like: "Tell Johnny his car is ready".',
    startZh: "🎤 中文", startEn: "🎤 Speak English", stop: "⏹ Stop", listening: "Listening…",
    unsupported: "This browser doesn't support voice recognition — type below instead. Chrome or an Android phone works best.",
    placeholder: "What you say appears here — or just type it…",
    kind: "Message type", who: "Customer", none: "No matching customer found — pick one below or type to search.",
    tpl: { confirm: "Booking confirmed", reminder: "Reminder", parts: "Parts arrived", ready: "Car ready" },
    draft: "✉ Draft message", denied: "Microphone unavailable — allow microphone access in your browser.",
    other: "Recent customers", match: "match", filter: "🔍 Type a name / plate / phone…",
    privacy: "Speech is transcribed by the browser (Chrome sends the audio to Google).",
    auto: (n, tpl, s) => `✓ ${n} — ${tpl} · opening draft in ${s}s`, cancel: "Cancel", learned: "Remembered how you say it",
  },
};

const LANG_KEY = "ws_voice_lang";
const AUTO_SECS = 2;

export function WsVoiceMessageModal({ jobs = [], bookings = [], resolveModel, onDraft, onClose, initialLang = "zh" }) {
  const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const [lang, setLang] = useState(() => { try { return localStorage.getItem(LANG_KEY) || initialLang; } catch { return initialLang; } });
  const [text, setText] = useState("");        // what the owner sees / edits
  const [alts, setAlts] = useState("");        // the recogniser's other guesses (matching only)
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState("");
  const [tpl, setTpl] = useState(null);
  const [pick, setPick] = useState(0);
  const [filter, setFilter] = useState("");
  const [countdown, setCountdown] = useState(null); // seconds left before the draft opens by itself
  const [learned, setLearned] = useState(false);
  const recRef = useRef(null);
  const heardRef = useRef(false);
  const T = L[lang];
  const aliases = useMemo(() => loadAliases(), [learned]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchText = `${text} ${alts}`;
  const people = useMemo(() => findPeople(matchText, jobs, bookings, resolveModel, aliases), [matchText, jobs, bookings, resolveModel, aliases]);
  const matches = people.filter(p => p.score > 0);
  const detected = detectTpl(text);

  // What is shown: typed filter first, then matches, then the most recent customers.
  const q = filter.trim().toLowerCase();
  const filtered = q ? people.filter(p => `${p.name} ${p.reg} ${p.phone}`.toLowerCase().includes(q)) : null;
  const shown = (filtered || (matches.length ? matches : people)).slice(0, 6);
  const chosen = shown[pick] || null;
  const effTpl = tpl || (chosen?.src === "booking" ? "confirm" : "ready");

  // Re-detect whenever the sentence changes; the owner can still override with the chips.
  useEffect(() => { setTpl(detected); setPick(0); setCountdown(null); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPick(0); }, [filter]);
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* not running */ } }, []);

  const draftNow = (person, kind) => {
    // Teach it: if this customer was picked by hand, remember the odd word that was heard for them.
    if (person && !(person.score > 0)) {
      const a = leftover(text);
      if (a) { saveAlias(a, personKey(person)); setLearned(true); }
    }
    onDraft({ name: person.name, phone: person.phone, reg: person.reg, make: person.make, model: person.model, year: person.year, date: "", defaultTpl: kind });
    onClose();
  };

  const start = (language) => {
    if (!SR) return;
    const lg = language || lang;
    setLang(lg); try { localStorage.setItem(LANG_KEY, lg); } catch { /* storage unavailable */ }
    setErr(""); setText(""); setAlts(""); setFilter(""); setCountdown(null);
    heardRef.current = false;
    const rec = new SR();
    rec.lang = lg === "zh" ? "zh-CN" : "en-ZA";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      let best = "", other = "";
      for (let i = 0; i < e.results.length; i++) {
        best += e.results[i][0].transcript;
        for (let k = 1; k < e.results[i].length; k++) other += " " + e.results[i][k].transcript;
      }
      heardRef.current = true;
      setText(best); setAlts(other);
    };
    rec.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") setErr(L[lg].denied); setListening(false); };
    rec.onend = () => { setListening(false); if (heardRef.current) setCountdown(AUTO_SECS); };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };
  const stop = () => { try { recRef.current?.stop(); } catch { /* already stopped */ } };

  // Start listening as soon as the window opens (the 🎤 tap that opened it counts as the gesture).
  useEffect(() => { if (SR) start(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After speaking: if the customer is a clear winner and we know the kind of message, open the draft by itself.
  const clearWinner = matches.length > 0 && matches[0].score >= 3 && (matches.length === 1 || matches[0].score - matches[1].score >= 2) && !!detected && !q;
  useEffect(() => {
    if (countdown === null) return;
    if (!clearWinner) { setCountdown(null); return; }
    if (countdown <= 0) { draftNow(matches[0], detected); return; }
    const id = setTimeout(() => setCountdown(c => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, clearWinner]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Overlay onClose={onClose}>
      <MHead title={T.title} sub={T.sub} onClose={onClose} />
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        {SR && (listening
          ? <button className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} onClick={stop}>{T.stop}</button>
          : <>
              <button className={`btn ${lang === "zh" ? "btn-primary" : "btn-ghost"}`} onClick={() => start("zh")}>{T.startZh}</button>
              <button className={`btn ${lang === "en" ? "btn-primary" : "btn-ghost"}`} onClick={() => start("en")}>{T.startEn}</button>
            </>)}
        {listening && <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 700 }}>● {T.listening}</span>}
      </div>
      {!SR && <div style={{ fontSize: 12, color: "var(--yellow)", marginBottom: 8 }}>{T.unsupported}</div>}
      {err && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 8 }}>{err}</div>}
      <textarea className="inp" rows={2} value={text} onChange={e => { setText(e.target.value); setAlts(""); }} placeholder={T.placeholder}
        style={{ width: "100%", resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} />

      {countdown !== null && clearWinner && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 8, borderRadius: 8, background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.4)" }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--green)" }}>{T.auto(matches[0].name, T.tpl[detected], Math.max(countdown, 0))}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setCountdown(null)}>{T.cancel}</button>
        </div>
      )}
      {learned && <div style={{ fontSize: 11, color: "var(--green)", marginBottom: 6 }}>✓ {T.learned}</div>}

      <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>{T.kind}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {Object.keys(T.tpl).map(k => (
          <button key={k} className={`btn btn-xs ${effTpl === k ? "btn-primary" : "btn-ghost"}`} onClick={() => { setTpl(k); setCountdown(null); }}>{T.tpl[k]}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>{matches.length && !q ? T.who : T.other}</div>
      <input className="inp" value={filter} onChange={e => { setFilter(e.target.value); setCountdown(null); }} placeholder={T.filter} style={{ marginBottom: 6 }} />
      {text.trim() && !matches.length && !q && <div style={{ fontSize: 12, color: "var(--yellow)", marginBottom: 6 }}>{T.none}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, maxHeight: 200, overflowY: "auto" }}>
        {shown.map((p, i) => (
          <label key={`${p.name}${p.phone}${p.reg}${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer",
            border: `1.5px solid ${pick === i ? "var(--accent)" : "var(--border)"}`, background: pick === i ? "rgba(255,122,46,.08)" : "transparent" }}>
            <input type="radio" checked={pick === i} onChange={() => { setPick(i); setCountdown(null); }} />
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

      <button className="btn btn-primary" style={{ width: "100%", fontWeight: 700 }} disabled={!chosen} onClick={() => draftNow(chosen, effTpl)}>
        {T.draft}
      </button>
      <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 8 }}>{T.privacy}</div>
    </Overlay>
  );
}
