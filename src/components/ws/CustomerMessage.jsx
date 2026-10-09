import { useState, useEffect } from "react";
import { Overlay, MHead } from "../shared.jsx";
import { waLink } from "../../lib/helpers.js";

// "Draft → owner reviews → owner sends" customer messages. Nothing is ever sent automatically:
// the owner picks a template, tweaks the text, then opens WhatsApp or copies it into WeChat.
//
// ctx = { name, phone, reg, make, model, date, time, defaultTpl }  (any field may be empty)

const TPLS = ["confirm", "reminder", "parts", "ready"];

const L = {
  zh: {
    title: "✉ 给客户发消息", sub: "先看一遍，需要的话改一改，再发送。",
    tpl: { confirm: "预约确认", reminder: "预约提醒", parts: "零件到货", ready: "车已修好" },
    date: "日期", time: "时间", text: "消息内容",
    wa: "💬 用 WhatsApp 发送", copy: "📋 复制", copied: "✅ 已复制", wechat: "复制并打开微信",
    noPhone: "没有客户电话 — 可以复制消息再手动发送。",
  },
  en: {
    title: "✉ Message customer", sub: "Check it, edit if needed, then send.",
    tpl: { confirm: "Booking confirmed", reminder: "Reminder", parts: "Parts arrived", ready: "Car ready" },
    date: "Date", time: "Time", text: "Message",
    wa: "💬 Send via WhatsApp", copy: "📋 Copy", copied: "✅ Copied", wechat: "Copy & open WeChat",
    noPhone: "No customer phone — copy the message and send it yourself.",
  },
};

const hasCJK = (s) => /[㐀-鿿]/.test(s || "");

function draft(tpl, lang, c) {
  const name = (c.name || "").trim().split(" ")[0] || (lang === "zh" ? "" : "there");
  const car = [c.make, c.model].filter(Boolean).join(" ");
  const carReg = [car, c.reg ? `(${c.reg})` : ""].filter(Boolean).join(" ") || (lang === "zh" ? "您的车" : "your vehicle");
  const when = [c.date, c.time].filter(Boolean).join(lang === "zh" ? " " : " at ");
  const shop = c.shop || "";
  const addr = c.address ? (lang === "zh" ? `地址：${c.address}。` : ` Address: ${c.address}.`) : "";
  if (lang === "zh") {
    const hi = name ? `${name}您好！` : "您好！";
    if (tpl === "confirm") return `${hi}您预约的 ${carReg} 已确认${when ? `：${when}` : ""}。${addr}如需改期请直接回复我们。${shop ? `\n— ${shop}` : ""}`;
    if (tpl === "reminder") return `${hi}提醒您：${when ? `${when} ` : "近期"}在${shop || "我们修车厂"}预约维修 ${carReg}。${addr}请准时到店，谢谢！`;
    if (tpl === "parts") return `${hi}您的 ${carReg} 所需零件已到货，我们会尽快安排维修，修好后第一时间通知您。${shop ? `\n— ${shop}` : ""}`;
    return `${hi}您的 ${carReg} 已经修好了，可以来取车了。${addr}${shop ? `\n— ${shop}` : ""}`;
  }
  const hi = `Hi ${name},`;
  if (tpl === "confirm") return `${hi} your booking for ${carReg} is confirmed${when ? ` for ${when}` : ""}.${addr} Reply here if you need to change it.${shop ? ` — ${shop}` : ""}`;
  if (tpl === "reminder") return `${hi} a reminder: your ${carReg} is booked in${when ? ` on ${when}` : " soon"}${shop ? ` at ${shop}` : ""}.${addr} See you then!`;
  if (tpl === "parts") return `${hi} the parts for your ${carReg} have arrived. We'll get started right away and let you know as soon as it's done.${shop ? ` — ${shop}` : ""}`;
  return `${hi} your ${carReg} is ready for collection.${addr}${shop ? ` — ${shop}` : ""}`;
}

export function WsCustomerMessageModal({ ctx, wsProfile = {}, onClose }) {
  const [lang, setLang] = useState(() => (hasCJK(ctx.name) ? "zh" : "en"));
  const [tpl, setTpl] = useState(ctx.defaultTpl || "confirm");
  const [date, setDate] = useState(ctx.date || "");
  const [time, setTime] = useState(ctx.time || "");
  const base = { ...ctx, date, time, shop: wsProfile.name || "", address: wsProfile.address || "" };
  const [text, setText] = useState(() => draft(ctx.defaultTpl || "confirm", hasCJK(ctx.name) ? "zh" : "en", base));
  const [copied, setCopied] = useState(false);
  const T = L[lang];
  const needsWhen = tpl === "confirm" || tpl === "reminder";

  // Re-draft when the template, language or date/time change (manual edits are kept until then).
  useEffect(() => {
    setText(draft(tpl, lang, { ...ctx, date, time, shop: wsProfile.name || "", address: wsProfile.address || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, lang, date, time]);

  const copy = async (andWeChat) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
    if (andWeChat) window.location.href = "weixin://";
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={T.title} sub={`${ctx.name || ""}${ctx.phone ? ` · ${ctx.phone}` : ""}`} onClose={onClose} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {TPLS.map(k => (
          <button key={k} className={`btn btn-xs ${tpl === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTpl(k)}>{T.tpl[k]}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[["zh", "中文"], ["en", "English"]].map(([v, lb]) => (
            <button key={v} className={`btn btn-xs ${lang === v ? "btn-primary" : "btn-ghost"}`} onClick={() => setLang(v)}>{lb}</button>
          ))}
        </div>
      </div>
      {needsWhen && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 3 }}>{T.date}</div>
            <input className="inp" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 3 }}>{T.time}</div>
            <input className="inp" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 3 }}>{T.text}</div>
      <textarea className="inp" rows={6} value={text} onChange={e => setText(e.target.value)} style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }} />
      <div style={{ fontSize: 11, color: "var(--text3)", margin: "4px 0 12px" }}>{T.sub}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ctx.phone
          ? <a href={waLink(ctx.phone, text, wsProfile.whatsapp_country_code)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", flex: 1 }}>
              <button className="btn" style={{ width: "100%", background: "#25D366", color: "#fff", border: "none", fontWeight: 700 }}>{T.wa}</button>
            </a>
          : <div style={{ flex: 1, fontSize: 12, color: "var(--text3)", alignSelf: "center" }}>{T.noPhone}</div>}
        <button className="btn btn-ghost" onClick={() => copy(false)}>{copied ? T.copied : T.copy}</button>
        {wsProfile.wechat_tools && (
          <button className="btn btn-ghost" style={{ color: "#07C160", borderColor: "rgba(7,193,96,.5)" }} onClick={() => copy(true)}>💬 {T.wechat}</button>
        )}
      </div>
    </Overlay>
  );
}
