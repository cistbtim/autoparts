import { useState, useEffect, useCallback } from "react";

// Ordered list of stops. `id` must match a nav item's `data-tour-id` (see the
// sidebar/drawer buttons in App.jsx) — steps whose id isn't present in the
// current user's navGroups (wrong wsRole, feature not visible, etc.) are
// silently skipped, so the tour always matches what the viewer can actually see.
const STEPS = [
  { id: null, title: "👋 Welcome to your Workshop", body: "Quick 60-second tour of where everything lives. Skip anytime — you can replay this later from the sidebar." },
  { id: "workshop",    title: "🔧 Jobs",        body: "Every vehicle that comes in for work lives here. Track it from Pending all the way through to Delivered." },
  { id: "wsbookings",  title: "🗓️ Bookings",    body: "Customers can book a slot before their vehicle even arrives — turn a booking into a job with one tap." },
  { id: "wsquotations",title: "📝 Quotations",  body: "Build a quote from parts & labour, then send it to the customer for online approval — deposit requests and your bank details go with it." },
  { id: "wsinvoices",  title: "🧾 Invoices",    body: "Once a quote is accepted and work is done, convert it straight into an invoice here." },
  { id: "wsstock",     title: "📦 Stock",       body: "Your workshop's own parts inventory — separate from the main shop's stock." },
  { id: "wssuppliers", title: "🏪 Suppliers",   body: "Manage the suppliers you buy parts from, and request prices when you need something." },
  { id: "wsprofile",   title: "⚙️ Settings",    body: "Set up your workshop's name, logo, bank account details, and staff logins here." },
  { id: null, title: "✅ You're all set", body: "That's the whole workshop. Look for the 🧭 button in the sidebar any time you want to run this tour again." },
];

function findVisibleTarget(id) {
  const els = document.querySelectorAll(`[data-tour-id="${id}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function WorkshopTour({ active, onClose, tab, setTab, navGroups, drawerOpen, setDrawerOpen }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState(null);

  // Only keep steps whose target the viewer can actually see (or steps with no target).
  const visibleIds = new Set(navGroups.flatMap(g => g.children.map(c => c.id)));
  const steps = STEPS.filter(s => !s.id || visibleIds.has(s.id));
  const step = steps[stepIdx];

  // Most sidebar stops sit right next to each other and are already fully on
  // screen, so settling for the target's real rect immediately there (rather
  // than always doing a scrollIntoView) is what makes back-to-back steps feel
  // instant instead of lagging the tooltip text. For a genuinely off-screen
  // target (e.g. deep in a just-expanded group), scrollIntoView is called
  // WITHOUT smooth behavior — confirmed live 2026-09-21 that `behavior:
  // "smooth"` here would silently fail to complete (the nav's scroll position
  // never actually moved, so the delayed re-measure kept capturing the
  // pre-scroll rect forever, leaving the tooltip permanently rendered off the
  // bottom of the screen). An instant jump scrolls synchronously, so the
  // re-measure right after reflects the true final position with no guessing
  // about how long an animation might take.
  const settleRect = (el) => {
    const r = el.getBoundingClientRect();
    const onScreen = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
    if (onScreen) { setRect(r); return; }
    el.scrollIntoView({ block: "center" });
    setRect(el.getBoundingClientRect());
  };

  const measure = useCallback((id) => {
    if (!id) { setRect(null); return; }
    let el = findVisibleTarget(id);
    if (!el && window.innerWidth <= 767 && !drawerOpen) {
      // Sidebar is hidden on mobile — open the drawer and try again once it's rendered.
      setDrawerOpen(true);
      setTimeout(() => {
        const el2 = findVisibleTarget(id);
        if (el2) settleRect(el2);
      }, 260);
      return;
    }
    if (el) settleRect(el);
    else setRect(null);
  }, [drawerOpen, setDrawerOpen]);

  useEffect(() => {
    if (!active || !step) return;
    if (step.id && step.id !== tab) setTab(step.id);
    const t = setTimeout(() => measure(step.id), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx]);

  // Keep the spotlight glued to its target through resize/scroll while a step is showing.
  useEffect(() => {
    if (!active || !step?.id) return;
    const onMove = () => { const el = findVisibleTarget(step.id); if (el) setRect(el.getBoundingClientRect()); };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [active, step]);

  useEffect(() => { if (active) setStepIdx(0); }, [active]);

  if (!active || !step) return null;

  const finish = () => onClose();
  const next = () => stepIdx < steps.length - 1 ? setStepIdx(i => i + 1) : finish();
  const back = () => setStepIdx(i => Math.max(0, i - 1));

  const PAD = 8;
  const spotlightStyle = rect ? {
    position: "fixed", zIndex: 2001, pointerEvents: "none",
    top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
    borderRadius: 12, boxShadow: "0 0 0 9999px rgba(0,0,0,.72)", border: "2px solid var(--accent)",
    transition: "top .25s ease,left .25s ease,width .25s ease,height .25s ease",
  } : null;

  // Tooltip position: to the right of the target if there's room, else below; centered when there's no target.
  let cardStyle = { position: "fixed", zIndex: 2002, width: "min(92vw, 340px)" };
  if (rect) {
    const spaceRight = window.innerWidth - (rect.right + PAD);
    if (spaceRight > 360) {
      cardStyle = { ...cardStyle, top: Math.max(16, rect.top), left: rect.right + PAD + 12 };
    } else {
      const top = rect.bottom + PAD + 12;
      cardStyle = { ...cardStyle, top: Math.min(top, window.innerHeight - 220), left: Math.max(16, Math.min(rect.left, window.innerWidth - 356)) };
    }
  } else {
    cardStyle = { ...cardStyle, top: "50%", left: "50%", transform: "translate(-50%,-50%)" };
  }

  return (
    <>
      {!rect && <div style={{ position: "fixed", inset: 0, zIndex: 2001, background: "rgba(0,0,0,.72)" }} />}
      {rect && <div style={spotlightStyle} />}
      {/* Invisible full-screen click-catcher so the rest of the app can't be interacted with mid-tour */}
      <div style={{ position: "fixed", inset: 0, zIndex: 2001 }} onClick={e => e.stopPropagation()} />
      <div className="card" style={{ ...cardStyle, padding: 18, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", marginBottom: 6 }}>STEP {stepIdx + 1} OF {steps.length}</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{step.title}</div>
        <div style={{ fontSize: 13.5, color: "var(--text2)", lineHeight: 1.55, marginBottom: 18 }}>{step.body}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" onClick={finish} style={{ marginRight: "auto", color: "var(--text3)" }}>Skip tour</button>
          {stepIdx > 0 && <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>}
          <button className="btn btn-primary btn-sm" onClick={next}>{stepIdx < steps.length - 1 ? "Next →" : "Done"}</button>
        </div>
      </div>
    </>
  );
}

export const tourSeenKey = (userId) => `ws_tour_seen_${userId || "anon"}`;
