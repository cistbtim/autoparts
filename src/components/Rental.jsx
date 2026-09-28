import { useRef, useState } from "react";
import { api } from "../lib/api.js";
import { makeId, today, fmtAmt } from "../lib/helpers.js";
import { decodePDF417fromImage, parseLicenceDisc } from "../lib/barcode.js";
import { Overlay, MHead, FL, FG, FD } from "./shared.jsx";

const VEHICLE_STATUSES = ["Available", "Rented", "Maintenance"];
const BOOKING_STATUSES = ["Reserved", "Active", "Completed", "Cancelled"];

const VEHICLE_STATUS_COLOR = { Available: "var(--green)", Rented: "var(--blue)", Maintenance: "var(--yellow)" };
const BOOKING_STATUS_COLOR = { Reserved: "var(--blue)", Active: "var(--accent)", Completed: "var(--green)", Cancelled: "var(--red)" };

const daysBetween = (a, b) => {
  if (!a || !b) return 1;
  const ms = new Date(b) - new Date(a);
  return Math.max(1, Math.round(ms / 86400000));
};

// ═══════════════════════════════════════════════════════════════
// LOCAL COMPONENTS
// ═══════════════════════════════════════════════════════════════

function SC({ label, value, icon, color, sub, onClick }) {
  return (
    <div className="stat-card card card-hover" style={{ "--gc": color + "20", cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "Rajdhani,sans-serif", lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 28, opacity: .75 }}>{icon}</div>
      </div>
    </div>
  );
}

function StatusPill({ status, colorMap }) {
  const c = colorMap[status] || "var(--text3)";
  return <span className="badge" style={{ background: c + "20", color: c }}>{status}</span>;
}

function RentalVehicleModal({ vehicle, rentalId, onSave, onClose }) {
  const [f, setF] = useState({
    make: "", model: "", year: "", reg: "", vin: "", color: "", category: "",
    status: "Available", daily_rate: "", weekly_rate: "", monthly_rate: "",
    mileage: "", location: "", notes: "", ...(vehicle || {}),
  });
  const [saving, setSaving] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const cameraInput = useRef(null);
  const photoInput = useRef(null);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const handleDiscScan = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanLoading(true);
    setScanMessage("");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read the selected image"));
        reader.readAsDataURL(file);
      });
      const parsed = parseLicenceDisc(await decodePDF417fromImage(dataUrl));
      const updates = {};
      if (parsed.make) updates.make = parsed.make;
      if (parsed.model) updates.model = parsed.model;
      if (parsed.reg) updates.reg = parsed.reg.replace(/\s/g, "").toUpperCase();
      if (parsed.vin) updates.vin = parsed.vin.toUpperCase();
      if (parsed.color) updates.color = parsed.color;
      if (parsed.body_type) updates.category = parsed.body_type;
      if (!Object.keys(updates).length) throw new Error("Barcode found, but no vehicle details could be read");
      setF(previous => ({ ...previous, ...updates }));
      setScanMessage("Disc read. Check the filled details before saving.");
    } catch {
      setScanMessage("Could not read the disc. Try a clearer photo, or enter the details manually.");
    }
    setScanLoading(false);
  };

  const save = async () => {
    if (!f.make.trim() || !f.model.trim() || !f.reg.trim()) { alert("Make, model and registration are required"); return; }
    setSaving(true);
    const payload = {
      ...f, rental_id: rentalId, id: vehicle?.id || makeId("RTV"),
      year: f.year ? Number(f.year) : null,
      mileage: f.mileage ? Number(f.mileage) : null,
      daily_rate: f.daily_rate !== "" ? Number(f.daily_rate) : null,
      weekly_rate: f.weekly_rate !== "" ? Number(f.weekly_rate) : null,
      monthly_rate: f.monthly_rate !== "" ? Number(f.monthly_rate) : null,
    };
    await onSave(payload);
    setSaving(false);
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={vehicle ? "Edit Vehicle" : "Add Vehicle"} onClose={onClose} />
      <div style={{ marginBottom: 14, padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>South African Licence Disc</div>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={handleDiscScan} style={{ display: "none" }} />
        <input ref={photoInput} type="file" accept="image/*" onChange={handleDiscScan} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => cameraInput.current?.click()} disabled={scanLoading}>Scan with Camera</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => photoInput.current?.click()} disabled={scanLoading}>Choose Disc Photo</button>
          {scanLoading && <span style={{ fontSize: 12, color: "var(--text3)", alignSelf: "center" }}>Reading disc…</span>}
        </div>
        {scanMessage && <div role="status" style={{ fontSize: 12, color: scanMessage.startsWith("Could not") ? "var(--red)" : "var(--green)", marginTop: 8 }}>{scanMessage}</div>}
      </div>
      <FG><FD><FL label="Make *" /><input className="inp" value={f.make} onChange={e => s("make", e.target.value)} /></FD><FD><FL label="Model *" /><input className="inp" value={f.model} onChange={e => s("model", e.target.value)} /></FD></FG>
      <FG><FD><FL label="Year" /><input className="inp" type="number" value={f.year} onChange={e => s("year", e.target.value)} /></FD><FD><FL label="Registration *" /><input className="inp" value={f.reg} onChange={e => s("reg", e.target.value.toUpperCase())} /></FD></FG>
      <FG><FD><FL label="VIN" /><input className="inp" value={f.vin || ""} onChange={e => s("vin", e.target.value.toUpperCase())} /></FD><FD><FL label="Color" /><input className="inp" value={f.color || ""} onChange={e => s("color", e.target.value)} /></FD></FG>
      <FG><FD><FL label="Category" /><input className="inp" placeholder="e.g. Sedan, SUV, Bakkie" value={f.category || ""} onChange={e => s("category", e.target.value)} /></FD><FD><FL label="Status" /><select className="inp" value={f.status} onChange={e => s("status", e.target.value)}>{VEHICLE_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}</select></FD></FG>
      <FG cols="1fr 1fr 1fr">
        <FD><FL label="Daily Rate" /><input className="inp" type="number" value={f.daily_rate} onChange={e => s("daily_rate", e.target.value)} /></FD>
        <FD><FL label="Weekly Rate" /><input className="inp" type="number" value={f.weekly_rate} onChange={e => s("weekly_rate", e.target.value)} /></FD>
        <FD><FL label="Monthly Rate" /><input className="inp" type="number" value={f.monthly_rate} onChange={e => s("monthly_rate", e.target.value)} /></FD>
      </FG>
      <FG><FD><FL label="Mileage (km)" /><input className="inp" type="number" value={f.mileage} onChange={e => s("mileage", e.target.value)} /></FD><FD><FL label="Location" /><input className="inp" value={f.location || ""} onChange={e => s("location", e.target.value)} /></FD></FG>
      <FD><FL label="Notes" /><textarea className="inp" rows={2} value={f.notes || ""} onChange={e => s("notes", e.target.value)} /></FD>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Overlay>
  );
}

function RentalCustomerModal({ customer, rentalId, onSave, onClose }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", id_number: "", address: "", ...(customer || {}) });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim() || !f.phone.trim()) { alert("Name and phone are required"); return; }
    setSaving(true);
    await onSave({ ...f, rental_id: rentalId, id: customer?.id || makeId("RTC") });
    setSaving(false);
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={customer ? "Edit Customer" : "Add Customer"} onClose={onClose} />
      <FG><FD><FL label="Name *" /><input className="inp" value={f.name} onChange={e => s("name", e.target.value)} /></FD><FD><FL label="Phone *" /><input className="inp" type="tel" value={f.phone} onChange={e => s("phone", e.target.value)} /></FD></FG>
      <FG><FD><FL label="Email" /><input className="inp" type="email" value={f.email || ""} onChange={e => s("email", e.target.value)} /></FD><FD><FL label="ID / Licence Number" /><input className="inp" value={f.id_number || ""} onChange={e => s("id_number", e.target.value)} /></FD></FG>
      <FD><FL label="Address" /><textarea className="inp" rows={2} value={f.address || ""} onChange={e => s("address", e.target.value)} /></FD>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Overlay>
  );
}

function RentalBookingModal({ booking, rentalId, vehicles, customers, onSave, onClose }) {
  const [f, setF] = useState({
    vehicle_id: "", customer_id: "", customer_name: "", customer_phone: "",
    start_date: today(), end_date: today(), daily_rate: "", deposit_amount: "",
    pickup_location: "", return_location: "", notes: "", ...(booking || {}),
  });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const availableVehicles = vehicles.filter(v => v.status === "Available" || v.id === booking?.vehicle_id);

  const pickVehicle = (id) => {
    const v = vehicles.find(x => x.id === id);
    setF(p => ({ ...p, vehicle_id: id, daily_rate: v?.daily_rate ?? p.daily_rate }));
  };
  const pickCustomer = (id) => {
    const c = customers.find(x => x.id === id);
    setF(p => ({ ...p, customer_id: id, customer_name: c?.name ?? p.customer_name, customer_phone: c?.phone ?? p.customer_phone }));
  };

  const days = daysBetween(f.start_date, f.end_date);
  const total = (Number(f.daily_rate) || 0) * days;

  const save = async () => {
    if (!f.vehicle_id) { alert("Select a vehicle"); return; }
    if (!f.customer_name?.trim() || !f.customer_phone?.trim()) { alert("Customer name and phone are required"); return; }
    if (!f.start_date || !f.end_date || new Date(f.end_date) < new Date(f.start_date)) { alert("Check the rental dates"); return; }
    setSaving(true);
    const payload = {
      ...f, rental_id: rentalId, id: booking?.id || makeId("RTB"),
      customer_id: f.customer_id || null,
      daily_rate: Number(f.daily_rate) || 0,
      total_amount: total,
      deposit_amount: f.deposit_amount !== "" ? Number(f.deposit_amount) : null,
      status: booking?.status || "Reserved",
    };
    await onSave(payload);
    setSaving(false);
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={booking ? "Edit Booking" : "New Booking"} onClose={onClose} />
      <FD>
        <FL label="Vehicle *" />
        <select className="inp" value={f.vehicle_id} onChange={e => pickVehicle(e.target.value)} disabled={!!booking}>
          <option value="">— Select vehicle —</option>
          {availableVehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} · {v.reg}{v.daily_rate ? ` · ${fmtAmt(v.daily_rate)}/day` : ""}</option>)}
        </select>
        {!booking && availableVehicles.length === 0 && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 3 }}>No vehicles currently available</div>}
      </FD>
      <FD>
        <FL label="Customer" />
        <select className="inp" value={f.customer_id || ""} onChange={e => pickCustomer(e.target.value)}>
          <option value="">— Type new customer below —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
        </select>
      </FD>
      <FG><FD><FL label="Customer Name *" /><input className="inp" value={f.customer_name || ""} onChange={e => s("customer_name", e.target.value)} /></FD><FD><FL label="Customer Phone *" /><input className="inp" type="tel" value={f.customer_phone || ""} onChange={e => s("customer_phone", e.target.value)} /></FD></FG>
      <FG><FD><FL label="Start Date *" /><input className="inp" type="date" value={f.start_date} onChange={e => s("start_date", e.target.value)} /></FD><FD><FL label="End Date *" /><input className="inp" type="date" value={f.end_date} onChange={e => s("end_date", e.target.value)} /></FD></FG>
      <FG><FD><FL label="Daily Rate" /><input className="inp" type="number" value={f.daily_rate} onChange={e => s("daily_rate", e.target.value)} /></FD><FD><FL label="Deposit" /><input className="inp" type="number" value={f.deposit_amount} onChange={e => s("deposit_amount", e.target.value)} /></FD></FG>
      <FG><FD><FL label="Pickup Location" /><input className="inp" value={f.pickup_location || ""} onChange={e => s("pickup_location", e.target.value)} /></FD><FD><FL label="Return Location" /><input className="inp" value={f.return_location || ""} onChange={e => s("return_location", e.target.value)} /></FD></FG>
      <FD><FL label="Notes" /><textarea className="inp" rows={2} value={f.notes || ""} onChange={e => s("notes", e.target.value)} /></FD>
      <div style={{ background: "var(--surface2)", borderRadius: 9, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ color: "var(--text3)" }}>{days} day{days !== 1 ? "s" : ""}</span>
        <span style={{ fontWeight: 700, color: "var(--accent)", fontFamily: "Rajdhani,sans-serif", fontSize: 16 }}>{fmtAmt(total)}</span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPORTED PAGES
// ═══════════════════════════════════════════════════════════════

export function RentalDashboardPage({ vehicles, bookings, customers, onNavigate }) {
  const todayStr = today();
  const monthStr = todayStr.slice(0, 7);

  const activeBookings = bookings.filter(b => b.status === "Active");
  const reservedBookings = bookings.filter(b => b.status === "Reserved");
  const availableVehicles = vehicles.filter(v => v.status === "Available");
  const monthRev = bookings
    .filter(b => b.status !== "Cancelled" && (b.actual_return_date || b.end_date || "").startsWith(monthStr))
    .reduce((s, b) => s + (b.total_amount || 0), 0);
  const totalRev = bookings.filter(b => b.status !== "Cancelled").reduce((s, b) => s + (b.total_amount || 0), 0);

  const upcomingReturns = activeBookings
    .filter(b => b.end_date)
    .sort((a, c) => new Date(a.end_date) - new Date(c.end_date))
    .slice(0, 6);

  const recentBookings = [...bookings].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6);

  const months6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i);
    const ms = d.toISOString().slice(0, 7);
    const rev = bookings.filter(b => b.status !== "Cancelled" && (b.actual_return_date || b.end_date || "").startsWith(ms)).reduce((s, b) => s + (b.total_amount || 0), 0);
    return { label: d.toLocaleString("default", { month: "short" }), ms, rev };
  });
  const maxRev = Math.max(...months6.map(m => m.rev), 1);

  return (
    <div className="fu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
        <div><h1 style={{ fontSize: 20, fontWeight: 700 }}>📊 Dashboard</h1><p style={{ color: "var(--text3)", fontSize: 13, marginTop: 3 }}>{todayStr}</p></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 14 }}>
        <SC label="Total Vehicles" value={vehicles.length} icon="🚗" color="var(--blue)" onClick={() => onNavigate("rental_vehicles")} />
        <SC label="Available Now" value={availableVehicles.length} icon="🟢" color="var(--green)" onClick={() => onNavigate("rental_vehicles")} />
        <SC label="Active Bookings" value={activeBookings.length} icon="🔑" color="var(--accent)" sub={`${reservedBookings.length} reserved`} onClick={() => onNavigate("rental_bookings")} />
        <SC label="Month Revenue" value={fmtAmt(monthRev)} icon="💰" color="var(--green)" sub={`Total: ${fmtAmt(totalRev)}`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".05em" }}>📋 Recent Bookings</h3>
            <button className="btn btn-ghost btn-xs" onClick={() => onNavigate("rental_bookings")}>View all →</button>
          </div>
          {recentBookings.length === 0
            ? <p style={{ color: "var(--text3)", fontSize: 13 }}>No bookings yet</p>
            : recentBookings.map(b => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                <div><div style={{ fontSize: 14, fontWeight: 600 }}>{b.customer_name}</div><div style={{ fontSize: 11, color: "var(--text3)" }}>{b.start_date} → {b.end_date}</div></div>
                <div style={{ textAlign: "right" }}><StatusPill status={b.status} colorMap={BOOKING_STATUS_COLOR} /><div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)", fontFamily: "Rajdhani,sans-serif", marginTop: 2 }}>{fmtAmt(b.total_amount)}</div></div>
              </div>
            ))
          }
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".05em" }}>⏳ Upcoming Returns</h3>
            <button className="btn btn-ghost btn-xs" onClick={() => onNavigate("rental_bookings")}>Manage</button>
          </div>
          {upcomingReturns.length === 0
            ? <p style={{ color: "var(--green)", fontSize: 13 }}>✅ Nothing due back</p>
            : upcomingReturns.map(b => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{b.customer_name}</div>
                <span className="badge" style={{ background: "rgba(96,165,250,.12)", color: "var(--blue)" }}>{b.end_date}</span>
              </div>
            ))
          }
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".05em" }}>🚗 Fleet Status</h3>
          <button className="btn btn-ghost btn-xs" onClick={() => onNavigate("rental_vehicles")}>View all →</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {VEHICLE_STATUSES.map(st => {
            const cnt = vehicles.filter(v => v.status === st).length;
            const color = VEHICLE_STATUS_COLOR[st];
            return (
              <div key={st} onClick={() => onNavigate("rental_vehicles")} style={{ background: "var(--surface2)", borderRadius: 10, padding: "14px 16px", border: `1px solid ${color}33`, cursor: "pointer" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: "Rajdhani,sans-serif", lineHeight: 1 }}>{cnt}</div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{st}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text3)", textAlign: "right" }}>{vehicles.length} total vehicles · {customers.length} customers</div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".05em" }}>📈 Monthly Revenue</h3>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>Last 6 months</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110 }}>
          {months6.map(m => {
            const barH = m.rev > 0 ? Math.max(8, Math.round((m.rev / maxRev) * 84)) : 3;
            const isCurrent = m.ms === monthStr;
            return (
              <div key={m.ms} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{ fontSize: 10, color: isCurrent ? "var(--accent)" : "var(--text3)", fontFamily: "Rajdhani,sans-serif", fontWeight: isCurrent ? 700 : 400, whiteSpace: "nowrap" }}>{m.rev > 0 ? fmtAmt(m.rev) : ""}</div>
                <div style={{ width: "100%", height: barH, background: isCurrent ? "var(--accent)" : "var(--surface2)", borderRadius: 4 }} />
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{m.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RentalVehiclesPage({ rentalId, vehicles, onRefresh, showToast }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [modal, setModal] = useState(null);

  const filtered = vehicles.filter(v => {
    if (filterStatus !== "__all__" && v.status !== filterStatus) return false;
    const q = search.toLowerCase();
    return !q || (v.make || "").toLowerCase().includes(q) || (v.model || "").toLowerCase().includes(q) || (v.reg || "").toLowerCase().includes(q);
  });

  const save = async (data) => {
    if (vehicles.find(v => v.id === data.id)) {
      await api.patch("rental_vehicles", "id", data.id, data);
      showToast("Vehicle updated");
    } else {
      await api.insert("rental_vehicles", data);
      showToast("Vehicle added");
    }
    await onRefresh(); setModal(null);
  };

  const del = async (id) => {
    if (!confirm("Delete this vehicle?")) return;
    await api.delete("rental_vehicles", "id", id);
    showToast("Deleted", "err"); onRefresh();
  };

  return (
    <div className="fu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div><h1 style={{ fontSize: 20, fontWeight: 700 }}>🚗 Vehicles</h1><p style={{ color: "var(--text3)", fontSize: 13, marginTop: 3 }}>{vehicles.length} vehicles</p></div>
        <button className="btn btn-primary" onClick={() => setModal("add")}>+ Add Vehicle</button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="inp" placeholder="Search make, model, reg…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select className="inp" style={{ width: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="__all__">All statuses</option>
          {VEHICLE_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
        </select>
      </div>
      {filtered.length === 0
        ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>No vehicles found.</div>
        : <div className="card" style={{ overflow: "hidden" }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>{["Vehicle", "Reg", "Status", "Daily Rate", "Mileage", "Actions"].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.make} {v.model} {v.year ? `(${v.year})` : ""}</td>
                    <td style={{ color: "var(--text3)" }}>{v.reg}</td>
                    <td><StatusPill status={v.status} colorMap={VEHICLE_STATUS_COLOR} /></td>
                    <td style={{ color: "var(--text2)", fontSize: 13 }}>{v.daily_rate ? fmtAmt(v.daily_rate) : "—"}</td>
                    <td style={{ color: "var(--text3)", fontSize: 13 }}>{v.mileage ? `${v.mileage.toLocaleString()} km` : "—"}</td>
                    <td><div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setModal(v)}>Edit</button>
                      <button className="btn btn-danger btn-xs" onClick={() => del(v.id)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      }
      {modal && <RentalVehicleModal rentalId={rentalId} vehicle={modal === "add" ? null : modal} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

export function RentalCustomersPage({ rentalId, customers, onRefresh, showToast }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);

  const filtered = customers.filter(c => (c.name || "").toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search));

  const save = async (data) => {
    if (customers.find(c => c.id === data.id)) {
      await api.patch("rental_customers", "id", data.id, data);
      showToast("Customer updated");
    } else {
      await api.insert("rental_customers", data);
      showToast("Customer added");
    }
    await onRefresh(); setModal(null);
  };

  const del = async (id) => {
    if (!confirm("Delete this customer?")) return;
    await api.delete("rental_customers", "id", id);
    showToast("Deleted", "err"); onRefresh();
  };

  return (
    <div className="fu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div><h1 style={{ fontSize: 20, fontWeight: 700 }}>👥 Customers</h1><p style={{ color: "var(--text3)", fontSize: 13, marginTop: 3 }}>{customers.length} customers</p></div>
        <button className="btn btn-primary" onClick={() => setModal("add")}>+ Add Customer</button>
      </div>
      <input className="inp" placeholder="Search name or phone…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16 }} />
      {filtered.length === 0
        ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>No customers yet. Add your first customer.</div>
        : <div className="card" style={{ overflow: "hidden" }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>{["Name", "Phone", "Email", "ID / Licence", "Actions"].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ color: "var(--text3)" }}>{c.phone || "—"}</td>
                    <td style={{ color: "var(--text3)", fontSize: 13 }}>{c.email || "—"}</td>
                    <td style={{ color: "var(--text2)", fontSize: 13 }}>{c.id_number || "—"}</td>
                    <td><div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setModal(c)}>Edit</button>
                      <button className="btn btn-danger btn-xs" onClick={() => del(c.id)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      }
      {modal && <RentalCustomerModal rentalId={rentalId} customer={modal === "add" ? null : modal} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

export function RentalBookingsPage({ rentalId, bookings, vehicles, customers, onRefresh, showToast }) {
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [modal, setModal] = useState(null);

  const filtered = filterStatus === "__all__" ? bookings : bookings.filter(b => b.status === filterStatus);
  const sorted = [...filtered].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const setVehicleStatus = (vehicleId, status) => vehicleId ? api.patch("rental_vehicles", "id", vehicleId, { status }).catch(() => {}) : Promise.resolve();

  const save = async (data) => {
    const isNew = !bookings.find(b => b.id === data.id);
    if (isNew) {
      await api.insert("rental_bookings", data);
      showToast("Booking created");
    } else {
      await api.patch("rental_bookings", "id", data.id, data);
      showToast("Booking updated");
    }
    await onRefresh(); setModal(null);
  };

  const transition = async (booking, newStatus) => {
    await api.patch("rental_bookings", "id", booking.id, { status: newStatus, ...(newStatus === "Completed" ? { actual_return_date: today() } : {}) });
    if (newStatus === "Active") await setVehicleStatus(booking.vehicle_id, "Rented");
    if (newStatus === "Completed" || newStatus === "Cancelled") await setVehicleStatus(booking.vehicle_id, "Available");
    showToast(`Booking marked ${newStatus}`);
    onRefresh();
  };

  const del = async (b) => {
    if (!confirm("Delete this booking?")) return;
    await api.delete("rental_bookings", "id", b.id);
    if (b.status === "Active") await setVehicleStatus(b.vehicle_id, "Available");
    showToast("Deleted", "err"); onRefresh();
  };

  return (
    <div className="fu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div><h1 style={{ fontSize: 20, fontWeight: 700 }}>📋 Bookings</h1><p style={{ color: "var(--text3)", fontSize: 13, marginTop: 3 }}>{bookings.length} bookings</p></div>
        <button className="btn btn-primary" onClick={() => setModal("add")}>+ New Booking</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className={`btn btn-sm ${filterStatus === "__all__" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilterStatus("__all__")}>All</button>
        {BOOKING_STATUSES.map(st => (
          <button key={st} className={`btn btn-sm ${filterStatus === st ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilterStatus(st)}>{st}</button>
        ))}
      </div>
      {sorted.length === 0
        ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>No bookings found.</div>
        : <div className="card" style={{ overflow: "hidden" }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>{["Customer", "Vehicle", "Dates", "Total", "Status", "Actions"].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {sorted.map(b => {
                  const v = vehicles.find(x => x.id === b.vehicle_id);
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.customer_name}<div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400 }}>{b.customer_phone}</div></td>
                      <td style={{ color: "var(--text3)", fontSize: 13 }}>{v ? `${v.make} ${v.model} · ${v.reg}` : "—"}</td>
                      <td style={{ color: "var(--text3)", fontSize: 12 }}>{b.start_date} → {b.actual_return_date || b.end_date}</td>
                      <td style={{ fontWeight: 700, color: "var(--accent)", fontFamily: "Rajdhani,sans-serif" }}>{fmtAmt(b.total_amount)}</td>
                      <td><StatusPill status={b.status} colorMap={BOOKING_STATUS_COLOR} /></td>
                      <td><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {b.status === "Reserved" && <button className="btn btn-ghost btn-xs" onClick={() => transition(b, "Active")}>Hand Over</button>}
                        {b.status === "Active" && <button className="btn btn-ghost btn-xs" onClick={() => transition(b, "Completed")}>Mark Returned</button>}
                        {(b.status === "Reserved" || b.status === "Active") && <button className="btn btn-ghost btn-xs" onClick={() => transition(b, "Cancelled")}>Cancel</button>}
                        <button className="btn btn-ghost btn-xs" onClick={() => setModal(b)}>Edit</button>
                        <button className="btn btn-danger btn-xs" onClick={() => del(b)}>Delete</button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      }
      {modal && <RentalBookingModal rentalId={rentalId} booking={modal === "add" ? null : modal} vehicles={vehicles} customers={customers} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

export function RentalProfilePage({ profile, onSave }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", city: "", country: "", ...(profile || {}) });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const save = async () => { setSaving(true); await onSave(f); setSaving(false); };

  return (
    <div className="fu" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>⚙️ Business Settings</h1>
      <p style={{ color: "var(--text3)", fontSize: 13, marginBottom: 20 }}>Trial: {profile?.subscription_status || "trial"}{profile?.subscription_expires_at ? ` · expires ${profile.subscription_expires_at}` : ""}</p>
      <div className="card" style={{ padding: 20 }}>
        <FG><FD><FL label="Business Name" /><input className="inp" value={f.name} onChange={e => s("name", e.target.value)} /></FD><FD><FL label="Phone" /><input className="inp" type="tel" value={f.phone || ""} onChange={e => s("phone", e.target.value)} /></FD></FG>
        <FG><FD><FL label="Email" /><input className="inp" type="email" value={f.email || ""} onChange={e => s("email", e.target.value)} /></FD><FD><FL label="City" /><input className="inp" value={f.city || ""} onChange={e => s("city", e.target.value)} /></FD></FG>
        <FD><FL label="Country" /><input className="inp" value={f.country || ""} onChange={e => s("country", e.target.value)} /></FD>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
