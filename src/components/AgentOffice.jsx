import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Overlay, MHead, FL, FG, FD } from "../components/shared.jsx";

const STATUS_META = {
  active: { label: "Active", color: "var(--green)" },
  paused: { label: "Paused", color: "var(--yellow)" },
  planned: { label: "Planned", color: "var(--blue)" },
};

const StatusPill = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.planned;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
      background: m.color + "22", color: m.color, border: `1px solid ${m.color}55`,
    }}>{m.label}</span>
  );
};

const DeptModal = ({ dept, onSave, onClose }) => {
  const [form, setForm] = useState(dept || { name: "", icon: "🤖", color: "#6366f1", description: "" });
  return (
    <Overlay onClose={onClose}>
      <MHead title={dept ? "Edit Department" : "Add Department"} onClose={onClose} />
      <FG cols="80px 1fr">
        <FD><FL label="Icon" /><input className="inp" value={form.icon}
          onChange={e => setForm({ ...form, icon: e.target.value })} /></FD>
        <FD><FL label="Name" req /><input className="inp" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} /></FD>
      </FG>
      <FD><FL label="Color" /><input className="inp" type="color" style={{ width: 60, padding: 2 }}
        value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></FD>
      <FD><FL label="Description" /><textarea className="inp" rows={2} value={form.description}
        onChange={e => setForm({ ...form, description: e.target.value })} /></FD>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!form.name.trim()}
          onClick={() => onSave(form)}>Save</button>
      </div>
    </Overlay>
  );
};

const TaskModal = ({ task, onSave, onClose }) => {
  const [form, setForm] = useState(task || { name: "", description: "", status: "planned", trigger: "" });
  return (
    <Overlay onClose={onClose}>
      <MHead title={task ? "Edit Agent Task" : "Add Agent Task"} onClose={onClose} />
      <FD><FL label="Name" req /><input className="inp" value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })} /></FD>
      <FD><FL label="What does it automate?" /><textarea className="inp" rows={2} value={form.description}
        onChange={e => setForm({ ...form, description: e.target.value })} /></FD>
      <FG cols="1fr 1fr">
        <FD><FL label="Status" /><select className="inp" value={form.status}
          onChange={e => setForm({ ...form, status: e.target.value })}>
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select></FD>
        <FD><FL label="Trigger / schedule" /><input className="inp" value={form.trigger}
          onChange={e => setForm({ ...form, trigger: e.target.value })} placeholder="e.g. daily 08:00, on new order" /></FD>
      </FG>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!form.name.trim()}
          onClick={() => onSave(form)}>Save</button>
      </div>
    </Overlay>
  );
};

export function AgentOfficePage({ showToast }) {
  const [departments, setDepartments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [editingDept, setEditingDept] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [editingTask, setEditingTask] = useState(undefined);

  useEffect(() => {
    (async () => {
      const [d, tk] = await Promise.all([
        api.get("agent_departments", "select=*&order=sort_order.asc"),
        api.get("agent_tasks", "select=*&order=sort_order.asc"),
      ]);
      setDepartments(d || []);
      setTasks(tk || []);
      setLoading(false);
      if ((d || []).length && selectedDeptId == null) setSelectedDeptId(d[0].id);
    })();
  }, []);

  const saveDept = async (form) => {
    if (form.id) {
      const { id, ...rest } = form;
      await api.patch("agent_departments", "id", id, rest);
      setDepartments(ds => ds.map(d => d.id === id ? { ...d, ...rest } : d));
    } else {
      const res = await api.insert("agent_departments", { ...form, sort_order: departments.length });
      const created = Array.isArray(res) ? res[0] : res;
      setDepartments(ds => [...ds, created]);
      setSelectedDeptId(created.id);
    }
    setEditingDept(undefined);
    showToast?.("Department saved");
  };

  const deleteDept = async (dept) => {
    if (!confirm(`Delete "${dept.name}" and all its agent tasks?`)) return;
    await api.delete("agent_tasks", "department_id", dept.id);
    await api.delete("agent_departments", "id", dept.id);
    setTasks(tk => tk.filter(x => x.department_id !== dept.id));
    setDepartments(ds => ds.filter(x => x.id !== dept.id));
    if (selectedDeptId === dept.id) setSelectedDeptId(null);
    showToast?.("Department deleted");
  };

  const saveTask = async (form) => {
    if (form.id) {
      const { id, ...rest } = form;
      await api.patch("agent_tasks", "id", id, rest);
      setTasks(ts => ts.map(x => x.id === id ? { ...x, ...rest } : x));
    } else {
      const payload = { ...form, department_id: selectedDeptId, sort_order: tasks.filter(x => x.department_id === selectedDeptId).length };
      const res = await api.insert("agent_tasks", payload);
      const created = Array.isArray(res) ? res[0] : res;
      setTasks(ts => [...ts, created]);
    }
    setEditingTask(undefined);
    showToast?.("Agent task saved");
  };

  const deleteTask = async (task) => {
    if (!confirm(`Delete agent task "${task.name}"?`)) return;
    await api.delete("agent_tasks", "id", task.id);
    setTasks(ts => ts.filter(x => x.id !== task.id));
    showToast?.("Agent task deleted");
  };

  const selectedDept = departments.find(d => d.id === selectedDeptId) || null;
  const deptTasks = tasks.filter(x => x.department_id === selectedDeptId);

  if (loading) return <div className="fu"><div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>Loading AI Agent Office…</div></div>;

  return (
    <div className="fu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>🏢 AI Agent Office</h2>
          <div style={{ color: "var(--text3)", fontSize: 13 }}>Departments and the AI agents automating work in each one</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditingDept(null)}>+ Add Department</button>
      </div>

      {/* Org chart */}
      <div className="card" style={{ padding: "28px 16px", marginBottom: 20, overflowX: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 0 }}>
          <div style={{
            display: "inline-block", padding: "10px 22px", borderRadius: "var(--radius)",
            background: "var(--surface2)", border: "1px solid var(--border2)", fontWeight: 700,
          }}>🏢 VelGenius</div>
          <div style={{ width: 2, height: 24, background: "var(--border2)", margin: "0 auto" }} />
        </div>
        <div style={{
          display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap",
          borderTop: "2px solid var(--border2)", paddingTop: 24, position: "relative", minWidth: 320,
        }}>
          {departments.length === 0 && (
            <div style={{ color: "var(--text3)", fontSize: 13, paddingTop: 8 }}>No departments yet — add one to get started.</div>
          )}
          {departments.map(d => {
            const count = tasks.filter(x => x.department_id === d.id).length;
            const on = d.id === selectedDeptId;
            return (
              <div key={d.id} style={{ position: "relative" }}>
                <div style={{
                  position: "absolute", top: -24, left: "50%", width: 2, height: 24,
                  background: "var(--border2)",
                }} />
                <button onClick={() => setSelectedDeptId(d.id)} className="card-hover" style={{
                  cursor: "pointer", padding: "12px 18px", borderRadius: "var(--radius)",
                  background: on ? (d.color || "var(--accent)") + "22" : "var(--surface)",
                  border: `2px solid ${on ? (d.color || "var(--accent)") : "var(--border)"}`,
                  minWidth: 140, textAlign: "center",
                }}>
                  <div style={{ fontSize: 22 }}>{d.icon || "🤖"}</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{count} agent{count === 1 ? "" : "s"}</div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected department panel */}
      {selectedDept && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedDept.icon} {selectedDept.name}</div>
              {selectedDept.description && <div style={{ color: "var(--text3)", fontSize: 13 }}>{selectedDept.description}</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEditingDept(selectedDept)}>Edit dept</button>
              <button className="btn btn-danger" onClick={() => deleteDept(selectedDept)}>Delete dept</button>
              <button className="btn btn-primary" onClick={() => setEditingTask(null)}>+ Add Agent Task</button>
            </div>
          </div>

          {deptTasks.length === 0 ? (
            <div style={{ color: "var(--text3)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>No agent tasks in this department yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
              {deptTasks.map(task => (
                <div key={task.id} className="kb-card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>{task.name}</div>
                    <StatusPill status={task.status} />
                  </div>
                  {task.description && <div style={{ fontSize: 12.5, color: "var(--text2)", marginTop: 6 }}>{task.description}</div>}
                  {task.trigger && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>⏱ {task.trigger}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setEditingTask(task)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => deleteTask(task)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editingDept !== undefined && (
        <DeptModal dept={editingDept} onSave={saveDept} onClose={() => setEditingDept(undefined)} />
      )}
      {editingTask !== undefined && (
        <TaskModal task={editingTask} onSave={saveTask} onClose={() => setEditingTask(undefined)} />
      )}
    </div>
  );
}
