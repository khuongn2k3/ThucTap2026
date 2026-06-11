import { useEffect, useState, useCallback } from "react"
import api, {
  getApiKeys,
  createApiKey,
  revokeApiKey,
  deleteApiKey,
  updateApiKey,
} from "../services/api"

/* ============================================================
   Admin.jsx — Sidebar Layout with all sections
   Sections: Overview | Users | Jobs | Gallery | API Keys
   ============================================================ */

const SECTIONS = [
  { id: "overview",  label: "Overview",      icon: IconGrid },
  { id: "users",     label: "Users",         icon: IconUsers },
  { id: "jobs",      label: "Jobs 3D",       icon: IconCube },
  { id: "gallery",   label: "Gallery",       icon: IconImage },
  { id: "pricing",   label: "Token Pricing", icon: IconCoin },
  { id: "payments",  label: "Payments",      icon: IconPayment },
  { id: "revenue",   label: "Revenue",      icon: IconRevenue },
  { id: "apikeys",   label: "API Keys",      icon: IconKey },
]

export default function Admin() {
  const [section, setSection] = useState("overview")
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    api.get("/auth/me").then(res => setCurrentUser(res.data)).catch(() => {})
  }, [])

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 56px)", fontFamily: "'DM Sans', sans-serif" }}>

      {/* SIDEBAR */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: "#0d0d0d",
        borderRight: "1px solid #1a1a1a",
        padding: "24px 0",
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid #1a1a1a", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#444", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Admin Panel
          </span>
        </div>

        {SECTIONS.map(s => {
          const Icon = s.icon
          const active = section === s.id
          return (
            <button key={s.id} onClick={() => setSection(s.id)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 16px", margin: "0 8px",
              borderRadius: 8, border: "none", cursor: "pointer",
              background: active ? "rgba(124,110,245,0.12)" : "transparent",
              color: active ? "#7c6ef5" : "#666",
              fontSize: 13, fontWeight: active ? 500 : 400,
              transition: "all 0.15s", textAlign: "left",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              <Icon size={15} color={active ? "#7c6ef5" : "#444"} />
              {s.label}
            </button>
          )
        })}
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, padding: "32px 36px", overflowY: "auto", background: "#f8f8f8" }}>
        {section === "overview"  && <SectionOverview />}
        {section === "users"     && <SectionUsers currentUser={currentUser} />}
        {section === "jobs"      && <SectionJobs />}
        {section === "gallery"   && <SectionGallery />}
        {section === "pricing"   && <SectionPricing />}
        {section === "payments"  && <SectionPayments />}
        {section === "revenue"   && <SectionRevenue />}
        {section === "apikeys"   && <SectionApiKeys />}
      </main>
    </div>
  )
}

/* ============================================================
   SECTION: OVERVIEW — with charts
   ============================================================ */
function MiniBarChart({ data, color = "#7c6ef5", height = 48 }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{
            width: "100%", borderRadius: 3,
            height: Math.max(3, Math.round((d.value / max) * height)),
            background: i === data.length - 1 ? color : color + "55",
            transition: "height 0.3s",
          }} title={`${d.label}: ${d.value}`} />
        </div>
      ))}
    </div>
  )
}

function DonutChart({ segments, size = 80 }) {
  // segments: [{value, color, label}]
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  let offset = 0
  const r = 28, cx = 40, cy = 40, stroke = 10
  const circumference = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      {segments.map((seg, i) => {
        const pct = seg.value / total
        const dash = pct * circumference
        const gap = circumference - dash
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset * circumference}
            strokeLinecap="butt"
            style={{ transform: "rotate(-90deg)", transformOrigin: "40px 40px" }}
          />
        )
        offset += pct
        return el
      })}
    </svg>
  )
}

function SectionOverview() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recentJobs, setRecentJobs] = useState([])
  const [recentUsers, setRecentUsers] = useState([])

  useEffect(() => {
    api.get("/admin/stats")
      .then(res => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))

    api.get("/admin/jobs?limit=5&offset=0")
      .then(res => setRecentJobs(res.data.jobs || []))
      .catch(() => {})

    api.get("/admin/users")
      .then(res => {
        const all = res.data.users || []
        setRecentUsers(all.slice(0, 5))
      })
      .catch(() => {})
  }, [])

  // Build last-7-days bar chart data using recentJobs
  const today = new Date()
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    return { label: d.toLocaleDateString("en-US", { weekday: "short" }), value: 0 }
  })
  recentJobs.forEach(j => {
    if (!j.created_at) return
    const d = new Date(j.created_at)
    const diffDays = Math.floor((today - d) / 86400000)
    if (diffDays >= 0 && diffDays < 7) last7[6 - diffDays].value++
  })

  const jobSegments = [
    { value: stats?.completed ?? 0, color: "#10b981", label: "Completed" },
    { value: stats?.processing ?? 0, color: "#f59e0b", label: "Processing" },
    { value: stats?.failed ?? 0, color: "#ef4444", label: "Error" },
    { value: Math.max(0, (stats?.jobs ?? 0) - (stats?.completed ?? 0) - (stats?.processing ?? 0) - (stats?.failed ?? 0)), color: "#e5e7eb", label: "Other" },
  ].filter(s => s.value > 0)

  return (
    <div>
      <PageHeader title="Overview" subtitle="System-wide statistics for Hunyuan3D" />

      {loading ? <LoadingBox /> : (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
            <StatCard title="Users"  value={stats?.users      ?? 0} color="indigo"  icon="" />
            <StatCard title="Jobs 3D"     value={stats?.jobs       ?? 0} color="emerald" icon="" />
            <StatCard title="Processing" value={stats?.processing  ?? 0} color="amber"   icon="" />
            <StatCard title="Errors"         value={stats?.failed     ?? 0} color="red"     icon="" />
          </div>

          {/* Charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

            {/* Jobs — Last 7 Days */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>Jobs — Last 7 Days</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>Based on the 5 most recent jobs</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#7c6ef5" }}>{stats?.jobs ?? 0}</div>
              </div>
              <MiniBarChart data={last7} color="#7c6ef5" height={60} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                {last7.map((d, i) => (
                  <span key={i} style={{ fontSize: 9, color: "#bbb", flex: 1, textAlign: "center" }}>{d.label}</span>
                ))}
              </div>
            </div>

            {/* Donut job status */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 14 }}>Job Status Breakdown</div>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <DonutChart segments={jobSegments.length ? jobSegments : [{ value: 1, color: "#e5e7eb" }]} size={90} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { label: "Completed", value: stats?.completed ?? 0, color: "#10b981" },
                    { label: "Processing", value: stats?.processing ?? 0, color: "#f59e0b" },
                    { label: "Error",       value: stats?.failed ?? 0,     color: "#ef4444" },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#666" }}>{s.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#333", marginLeft: "auto" }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Recent Jobs */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 14 }}>Recent Jobs</div>
          {recentJobs.length === 0
            ? <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "20px 0" }}>No jobs yet</div>
            : recentJobs.map(j => (
              <div key={j.job_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#333", fontFamily: "monospace" }}>{j.job_id?.slice(0, 14)}…</div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>{j.user_name || "—"} · {j.created_at ? new Date(j.created_at).toLocaleString() : "—"}</div>
                </div>
                <StatusBadge status={j.status} />
              </div>
            ))
          }
        </div>

        {/* Recent Users */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 14 }}>Latest Users</div>
          {recentUsers.length === 0
            ? <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "20px 0" }}>No users yet</div>
            : recentUsers.map(u => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
                {u.avatar_url
                  ? <img src={u.avatar_url} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} alt={u.name} />
                  : <Avatar name={u.name} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                </div>
                <RoleBadge role={u.role} />
              </div>
            ))
          }
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <QuickCard title="User Management" desc="Change roles, ban/unban accounts, adjust tokens" />
        <QuickCard title="Pending Gallery" desc="Review new submissions from users" />
        <QuickCard title="API Keys" desc="Issue and manage keys for external developers" />
      </div>
    </div>
  )
}

/* ============================================================
   SECTION: PRICING — Token pricing management
   ============================================================ */
function SectionPricing() {
  const DEFAULT_PRICING = {
    stage1_tokens: 25,
    stage2_tokens: 25,
    signup_bonus: 100,
    daily_bonus: 0,
  }

  const [pricing, setPricing] = useState(DEFAULT_PRICING)
  const [editing, setEditing] = useState({ ...DEFAULT_PRICING })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState("")

  useEffect(() => {
    api.get("/admin/pricing")
      .then(res => {
        const d = res.data || {}
        const merged = { ...DEFAULT_PRICING, ...d }
        setPricing(merged)
        setEditing(merged)
      })
      .catch(() => {
        // Endpoint not available yet — use defaults, still allow editing and saving
        setPricing(DEFAULT_PRICING)
        setEditing(DEFAULT_PRICING)
      })
      .finally(() => setLoading(false))
  }, [])

  const hasChanged = JSON.stringify(editing) !== JSON.stringify(pricing)

  const handleSave = async () => {
    setSaving(true); setError(""); setSaved(false)
    try {
      await api.post("/admin/pricing", editing)
      setPricing({ ...editing })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.response?.data?.detail || "Save failed, please check the backend.")
    } finally { setSaving(false) }
  }

  const field = (key) => ({
    value: editing[key],
    onChange: e => setEditing(p => ({ ...p, [key]: Math.max(0, parseInt(e.target.value) || 0) })),
  })

  const CARDS = [
    {
      title: "Stage 1 — Generate White Mesh",
      desc: "Tokens deducted when a user generates a 3D shape from images",
      key: "stage1_tokens",
      value: editing.stage1_tokens,
      color: "#7c6ef5",
      bg: "#f5f3ff",
    },
    {
      title: "Stage 2 — Apply Texture",
      desc: "Tokens deducted when a user applies texture to a white mesh",
      key: "stage2_tokens",
      value: editing.stage2_tokens,
      color: "#3b82f6",
      bg: "#eff6ff",
    },
    {
      title: "Sign-up Bonus",
      desc: "Free tokens granted on new account creation",
      key: "signup_bonus",
      value: editing.signup_bonus,
      color: "#10b981",
      bg: "#f0fdf4",
    },
    {
      title: "Daily Bonus",
      desc: "Tokens granted each day on login (0 = disabled)",
      key: "daily_bonus",
      value: editing.daily_bonus,
      color: "#f59e0b",
      bg: "#fffbeb",
    },
  ]

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <PageHeader title="Token Pricing" subtitle="Configure token consumption per feature" noMargin />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 12, color: "#10b981", fontWeight: 500 }}>Saved</span>}
          {hasChanged && (
            <button onClick={() => setEditing({ ...pricing })} style={{
              padding: "8px 16px", borderRadius: 10, border: "1px solid #e5e7eb",
              background: "none", fontSize: 13, color: "#666", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}>Revert</button>
          )}
          <button onClick={handleSave} disabled={saving || !hasChanged} style={{
            padding: "8px 20px", borderRadius: 10, border: "none",
            background: hasChanged ? "linear-gradient(135deg, #7c6ef5, #5650cc)" : "#e5e7eb",
            color: hasChanged ? "#fff" : "#aaa",
            fontSize: 13, fontWeight: 500, cursor: hasChanged ? "pointer" : "not-allowed",
            fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
          }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#dc2626" }}>
          {error}
        </div>
      )}

      {loading ? <LoadingBox /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            {CARDS.map(c => (
              <div key={c.key} style={{
                background: "#fff", borderRadius: 16, padding: "22px 24px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, background: c.bg,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
                  }}></div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{c.desc}</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>Tokens</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => setEditing(p => ({ ...p, [c.key]: Math.max(0, p[c.key] - 1) }))}
                        style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: 16, color: "#555", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                      <input type="number" min={0} {...field(c.key)} style={{
                        width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb",
                        fontSize: 18, fontWeight: 700, color: c.color, textAlign: "center",
                        outline: "none", fontFamily: "'DM Sans', sans-serif",
                      }} />
                      <button onClick={() => setEditing(p => ({ ...p, [c.key]: p[c.key] + 1 }))}
                        style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: 16, color: "#555", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                      <span style={{ fontSize: 12, color: "#aaa" }}>tokens</span>
                    </div>
                  </div>

                  {/* Compare with current value */}
                  {editing[c.key] !== pricing[c.key] && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: "#aaa" }}>Current</div>
                      <div style={{ fontSize: 13, color: "#bbb", textDecoration: "line-through" }}>{pricing[c.key]}</div>
                      <div style={{ fontSize: 10, color: editing[c.key] > pricing[c.key] ? "#ef4444" : "#10b981" }}>
                        {editing[c.key] > pricing[c.key] ? "▲" : "▼"} {Math.abs(editing[c.key] - pricing[c.key])}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Cost preview summary */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 14 }}>Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "Full Generation (S1+S2)", value: editing.stage1_tokens + editing.stage2_tokens, color: "#7c6ef5" },
                { label: "Stage 1 Only (no texture)", value: editing.stage1_tokens, color: "#3b82f6" },
                { label: "Sign-up Bonus Tokens", value: editing.signup_bonus, color: "#10b981" },
              ].map(s => (
                <div key={s.label} style={{ background: "#f9fafb", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>tokens</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}



/* ============================================================
   SECTION: USERS
   ============================================================ */
function SectionUsers({ currentUser }) {
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [busy, setBusy]     = useState(null)

  const fetchUsers = () => {
    setLoading(true)
    api.get("/admin/users")
      .then(res => setUsers(res.data.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchUsers() }, [])

  const toggleRole = async (user) => {
    const newRole = user.role === "admin" ? "user" : "admin"
    if (!window.confirm(`Change role of ${user.name} to "${newRole}"?`)) return
    setBusy(user.id)
    try {
      await api.patch(`/admin/users/${user.id}/role`, { role: newRole })
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
    } finally { setBusy(null) }
  }

  const toggleBan = async (user) => {
    const action = user.is_banned ? "unban" : "ban"
    if (!window.confirm(`${action} account ${user.name}?`)) return
    setBusy(user.id + "_ban")
    try {
      await api.patch(`/admin/users/${user.id}/ban`, { banned: !user.is_banned })
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_banned: !u.is_banned } : u))
    } finally { setBusy(null) }
  }

  const adjustTokens = async (user) => {
    const input = window.prompt(`Adjust tokens for ${user.name} (negative to subtract):`)
    if (!input || isNaN(input)) return
    setBusy(user.id + "_tok")
    try {
      await api.patch(`/admin/users/${user.id}/tokens`, { delta: parseInt(input) })
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, tokens: u.tokens + parseInt(input) } : u))
    } finally { setBusy(null) }
  }

  const filtered = users.filter(u =>
    (currentUser ? u.id !== currentUser.id : true) &&
    (u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <PageHeader title="Users" subtitle={`${filtered.length} accounts (excluding your own)`} />
      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or email..." />
      </div>
      {loading ? <LoadingBox /> : (
        <div className="overflow-hidden rounded-2xl bg-white shadow">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Tokens</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(u => (
                <tr key={u.id} className="text-sm hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {u.avatar_url
                        ? <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover" alt={u.name} />
                        : <Avatar name={u.name} />
                      }
                      <div>
                        <div className="font-medium text-gray-900">{u.name}</div>
                        <div className="text-xs text-gray-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-3"><span className="font-mono text-sm text-gray-700">{u.tokens ?? 0}</span></td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {u.is_banned
                      ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">Banned</span>
                      : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">Active</span>
                    }
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <ActionBtn onClick={() => toggleRole(u)} disabled={!!busy} color="indigo">
                        {busy === u.id ? "..." : u.role === "admin" ? "→ User" : "→ Admin"}
                      </ActionBtn>
                      <ActionBtn onClick={() => adjustTokens(u)} disabled={!!busy} color="amber">Token</ActionBtn>
                      <ActionBtn onClick={() => toggleBan(u)} disabled={!!busy} color={u.is_banned ? "emerald" : "red"}>
                        {busy === u.id + "_ban" ? "..." : u.is_banned ? "Unban" : "Ban"}
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyBox text="No users found" />}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   SECTION: JOBS 3D
   ============================================================ */
function SectionJobs() {
  const [jobs, setJobs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [total, setTotal]         = useState(0)
  const [offset, setOffset]       = useState(0)
  const [statusFilter, setStatusFilter] = useState("all")
  const [cancelling, setCancelling]     = useState(null)   // job_id currently being cancelled
  const [cancelMsg, setCancelMsg]       = useState(null)   // { type: "ok"|"err", text }
  const LIMIT = 20

  const fetchJobs = useCallback((off, status) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: LIMIT, offset: off })
    if (status !== "all") params.append("status", status)
    api.get(`/admin/jobs?${params}`)
      .then(res => { setJobs(res.data.jobs || []); setTotal(res.data.total || 0) })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { setOffset(0); fetchJobs(0, statusFilter) }, [statusFilter])
  useEffect(() => { fetchJobs(offset, statusFilter) }, [offset])

  const handleCancel = async (job) => {
    if (!window.confirm(`Cancel job ${job.job_id?.slice(0,16)}…?\nTokens used will be refunded to the user.`)) return
    setCancelling(job.job_id)
    setCancelMsg(null)
    try {
      const res = await api.post(`/admin/jobs/${job.job_id}/cancel`)
      // Optimistic update: immediately reflect status change in UI
      setJobs(prev => prev.map(j => j.job_id === job.job_id ? { ...j, status: "cancelled" } : j))
      const refund = res.data?.refunded_tokens
      setCancelMsg({ type: "ok", text: `Job cancelled. ${refund ? `Refunded ${refund} tokens.` : ""}` })
    } catch (e) {
      setCancelMsg({ type: "err", text: e.response?.data?.detail || "Failed to cancel job." })
    } finally {
      setCancelling(null)
      setTimeout(() => setCancelMsg(null), 4000)
    }
  }

  const isCancellable = (status) => status === "pending" || status === "processing"

  const totalPages  = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1
  const STATUS_TABS = ["all","pending","processing","completed","failed","cancelled"]
  const TAB_LABELS  = { all:"All", pending:"Pending", processing:"Processing", completed:"Done", failed:"Error", cancelled:"Cancelled" }

  return (
    <div>
      <PageHeader title="Jobs 3D" subtitle={`${total} jobs in the system`} />

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
        {STATUS_TABS.map(s => (
          <TabBtn key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{TAB_LABELS[s]}</TabBtn>
        ))}
      </div>

      {/* Toast message */}
      {cancelMsg && (
        <div style={{
          marginBottom: 14, padding: "10px 16px", borderRadius: 10, fontSize: 13,
          background: cancelMsg.type === "ok" ? "#ecfdf5" : "#fef2f2",
          color:      cancelMsg.type === "ok" ? "#065f46" : "#991b1b",
          border: `1px solid ${cancelMsg.type === "ok" ? "#a7f3d0" : "#fecaca"}`,
        }}>
          {cancelMsg.type === "ok" ? "✓ " : "✕ "}{cancelMsg.text}
        </div>
      )}

      {loading ? <LoadingBox /> : (
        <div className="overflow-hidden rounded-2xl bg-white shadow">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3">Job ID</th>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Tokens Used</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">File 3D</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map(j => (
                <tr key={j.job_id} className="text-sm hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{j.job_id?.slice(0,16)}…</td>
                  <td className="px-5 py-3 text-gray-700">{j.user_name || j.user_id}</td>
                  <td className="px-5 py-3"><StatusBadge status={j.status} /></td>
                  <td className="px-5 py-3 text-gray-600">{j.tokens_used ?? 1}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {j.created_at ? new Date(j.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {j.output_model_url
                      ? <a href={j.output_model_url} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline text-xs">Download</a>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-5 py-3">
                    {isCancellable(j.status)
                      ? (
                        <ActionBtn
                          onClick={() => handleCancel(j)}
                          disabled={cancelling === j.job_id}
                          color="red"
                        >
                          {cancelling === j.job_id ? "Cancelling..." : "Cancel"}
                        </ActionBtn>
                      )
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {jobs.length === 0 && <EmptyBox text="No jobs found" />}
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <PageBtn disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>Prev</PageBtn>
          <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
          <PageBtn disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}>Next</PageBtn>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   SECTION: GALLERY
   ============================================================ */
function SectionGallery() {
  const [tab, setTab] = useState("pending")
  return (
    <div>
      <PageHeader title="Gallery" subtitle="Manage and review 3D model submissions" />
      <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit mb-6">
        <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>Pending Review</TabBtn>
        <TabBtn active={tab === "all"}     onClick={() => setTab("all")}>All</TabBtn>
      </div>
      {tab === "pending" ? <GalleryPending /> : <GalleryAll />}
    </div>
  )
}

function GalleryPending() {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading]         = useState(true)
  const [busy, setBusy]               = useState(null)

  const fetchPending = () => {
    setLoading(true)
    api.get("/gallery/admin/pending")
      .then(res => setSubmissions(res.data.submissions || []))
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchPending() }, [])

  const approve = async (id) => {
    setBusy(id + "_approve")
    try {
      await api.patch(`/gallery/admin/${id}/approve`)
      setSubmissions(prev => prev.filter(s => s.id !== id))
    } finally { setBusy(null) }
  }
  const reject = async (id) => {
    if (!window.confirm("Reject and delete this submission?")) return
    setBusy(id + "_reject")
    try {
      await api.patch(`/gallery/admin/${id}/reject`)
      setSubmissions(prev => prev.filter(s => s.id !== id))
    } finally { setBusy(null) }
  }

  if (loading) return <LoadingBox />
  if (!submissions.length) return <EmptyBox text="No submissions pending review" />
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {submissions.map(sub => (
        <SubmissionCard key={sub.id} sub={sub} busy={busy}>
          <button onClick={() => approve(sub.id)} disabled={!!busy}
            className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40 transition">
            {busy === sub.id + "_approve" ? "..." : "Approve"}
          </button>
          <button onClick={() => reject(sub.id)} disabled={!!busy}
            className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40 transition">
            {busy === sub.id + "_reject" ? "..." : "Reject"}
          </button>
        </SubmissionCard>
      ))}
    </div>
  )
}

function GalleryAll() {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading]         = useState(true)
  const [busy, setBusy]               = useState(null)
  const [total, setTotal]             = useState(0)
  const [offset, setOffset]           = useState(0)
  const LIMIT = 12

  const fetchAll = (off = 0) => {
    setLoading(true)
    api.get(`/gallery/admin/all?limit=${LIMIT}&offset=${off}`)
      .then(res => { setSubmissions(res.data.submissions || []); setTotal(res.data.total || 0) })
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchAll(offset) }, [offset])

  const deleteOne = async (id) => {
    if (!window.confirm("Permanently delete this submission?")) return
    setBusy(id + "_delete")
    try {
      await api.delete(`/gallery/admin/${id}`)
      setSubmissions(prev => prev.filter(s => s.id !== id))
      setTotal(t => t - 1)
    } finally { setBusy(null) }
  }
  const approve = async (sub) => {
    if (sub.is_public) return
    setBusy(sub.id + "_approve")
    try {
      await api.patch(`/gallery/admin/${sub.id}/approve`)
      setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, is_public: true } : s))
    } finally { setBusy(null) }
  }

  if (loading) return <LoadingBox />
  if (!submissions.length) return <EmptyBox text="No submissions yet" />
  const totalPages  = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1
  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">Total: <span className="font-semibold text-gray-700">{total}</span> · Page {currentPage}/{totalPages}</p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {submissions.map(sub => (
          <SubmissionCard key={sub.id} sub={sub} busy={busy} showStatus>
            {!sub.is_public && (
              <button onClick={() => approve(sub)} disabled={!!busy}
                className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40 transition">
                {busy === sub.id + "_approve" ? "..." : "Approve"}
              </button>
            )}
            <button onClick={() => deleteOne(sub.id)} disabled={!!busy}
              className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40 transition">
              {busy === sub.id + "_delete" ? "..." : "Delete"}
            </button>
          </SubmissionCard>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <PageBtn disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>Prev</PageBtn>
          <span className="px-3 text-sm text-gray-600">{currentPage} / {totalPages}</span>
          <PageBtn disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}>Next</PageBtn>
        </div>
      )}
    </div>
  )
}


/* ============================================================
   SECTION: PAYMENTS
   ============================================================ */
function SectionPayments() {
  const [payments, setPayments] = useState([])
  const [stats, setStats]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [total, setTotal]       = useState(0)
  const [offset, setOffset]     = useState(0)
  const LIMIT = 20

  const STATUS_TABS = ["all", "completed", "pending", "expired"]
  const TAB_LABELS  = { all: "All", completed: "Completed", pending: "Pending", expired: "Expired" }

  const fetchPayments = (off, status) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: LIMIT, offset: off })
    if (status !== "all") params.append("status", status)
    Promise.all([
      api.get(`/admin/payments?${params}`),
      api.get("/admin/payments/stats"),
    ])
      .then(([pRes, sRes]) => {
        setPayments(pRes.data.payments || [])
        setTotal(pRes.data.total || 0)
        setStats(sRes.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { setOffset(0); fetchPayments(0, statusFilter) }, [statusFilter])
  useEffect(() => { fetchPayments(offset, statusFilter) }, [offset])

  const totalPages  = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  const fmtVND = (v) => Number(v).toLocaleString("vi-VN") + "đ"
  const toUTC = (d) => d ? (d.endsWith('Z') || d.includes('+') ? d : d + 'Z') : null
  const fmtDate = (d) => { const s = toUTC(d); return s ? new Date(s).toLocaleString('vi-VN') : '—' }

  const STATUS_COLOR = {
    completed: { bg: "#ecfdf5", color: "#059669" },
    pending:   { bg: "#fffbeb", color: "#d97706" },
    expired:   { bg: "#f3f4f6", color: "#6b7280" },
    failed:    { bg: "#fef2f2", color: "#dc2626" },
  }

  return (
    <div>
      <PageHeader title="Payments" subtitle="All top-up transactions" />

      {/* Stats row */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total",     value: stats.total,      color: "indigo" },
            { label: "Completed", value: stats.completed,  color: "emerald" },
            { label: "Pending",   value: stats.pending,    color: "amber" },
            { label: "Expired",   value: stats.expired,    color: "red" },
            { label: "Revenue",   value: fmtVND(stats.revenue_vnd), color: "emerald", wide: true },
            { label: "Tokens Sold", value: stats.tokens_sold.toLocaleString(), color: "indigo" },
          ].map(s => {
            const C = { indigo: ["#eef2ff","#4f46e5"], emerald: ["#ecfdf5","#059669"], amber: ["#fffbeb","#d97706"], red: ["#fef2f2","#dc2626"] }
            const [bg, text] = C[s.color] || C.indigo
            return (
              <div key={s.label} style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
                <div style={{ display: "inline-flex", background: bg, color: text, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>{s.value}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
        {STATUS_TABS.map(s => (
          <TabBtn key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{TAB_LABELS[s]}</TabBtn>
        ))}
      </div>

      {loading ? <LoadingBox /> : (
        <div className="overflow-hidden rounded-2xl bg-white shadow">
          <table className="w-full text-left" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "16%" }} />
            </colgroup>
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Package</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Tokens</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tx ID</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map(p => {
                const sc = STATUS_COLOR[p.status] || { bg: "#f3f4f6", color: "#6b7280" }
                return (
                  <tr key={p.id} className="text-sm hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">#{p.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 truncate">{p.user_name}</div>
                      <div className="text-xs text-gray-400 truncate">{p.user_email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{p.package_id?.replace("_", " ")}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{fmtVND(p.amount_vnd)}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">+{p.tokens}</td>
                    <td className="px-4 py-3">
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate">{p.sepay_transaction_id || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(p.paid_at || p.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {payments.length === 0 && <EmptyBox text="No payments found" />}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <PageBtn disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>Prev</PageBtn>
          <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
          <PageBtn disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}>Next</PageBtn>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   SECTION: REVENUE
   ============================================================ */
function SectionRevenue() {
  const [stats, setStats]         = useState(null)
  const [payments, setPayments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [period, setPeriod]       = useState("month") // month | week | all
  const [offset, setOffset]       = useState(0)
  const [total, setTotal]         = useState(0)
  const LIMIT = 20

  const fmtVND = (v) => Number(v || 0).toLocaleString("vi-VN") + "đ"
  const toUTC  = (d) => d ? (d.endsWith('Z') || d.includes('+') ? d : d + 'Z') : null
  const fmtDate = (d) => { const s = toUTC(d); return s ? new Date(s).toLocaleString('vi-VN') : '—' }

  const fetchData = (off = 0) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: LIMIT, offset: off, status: "completed" })
    Promise.all([
      api.get("/admin/payments/stats"),
      api.get(`/admin/payments?${params}`),
    ])
      .then(([sRes, pRes]) => {
        setStats(sRes.data)
        setPayments(pRes.data.payments || [])
        setTotal(pRes.data.total || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { setOffset(0); fetchData(0) }, [period])
  useEffect(() => { fetchData(offset) }, [offset])

  // Build monthly revenue bar chart from completed payments
  const monthlyData = (() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return {
        label: d.toLocaleDateString("en-US", { month: "short" }),
        month: d.getMonth(),
        year: d.getFullYear(),
        value: 0,
      }
    })
    payments.filter(p => p.status === "completed").forEach(p => {
      const d = new Date(toUTC(p.paid_at || p.created_at))
      const m = months.find(x => x.month === d.getMonth() && x.year === d.getFullYear())
      if (m) m.value += p.amount_vnd || 0
    })
    return months
  })()

  const maxBar = Math.max(...monthlyData.map(d => d.value), 1)

  const totalPages  = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  // Conversion rate
  const convRate = stats ? ((stats.completed / (stats.total || 1)) * 100).toFixed(1) : "—"

  return (
    <div>
      <PageHeader title="Revenue" subtitle="Financial overview and payment transactions" />

      {loading && !stats ? <LoadingBox /> : (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Total Revenue", value: fmtVND(stats?.revenue_vnd), color: "#10b981", bg: "#ecfdf5" },
              { label: "Completed Payments", value: stats?.completed ?? 0, color: "#4f46e5", bg: "#eef2ff" },
              { label: "Tokens Sold", value: Number(stats?.tokens_sold ?? 0).toLocaleString(), color: "#7c6ef5", bg: "#f5f3ff" },
              { label: "Conversion Rate", value: convRate + "%", color: "#f59e0b", bg: "#fffbeb" },
            ].map(s => (
              <div key={s.label} style={{
                background: "#fff", borderRadius: 16, padding: "20px 22px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0",
              }}>
                <div style={{ display: "inline-flex", background: s.bg, color: s.color, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 20 }}>

            {/* Monthly Revenue Bar Chart */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>Revenue — Last 6 Months</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>Completed transactions only</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#10b981" }}>{fmtVND(stats?.revenue_vnd)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80, marginBottom: 8 }}>
                {monthlyData.map((d, i) => {
                  const h = Math.max(4, Math.round((d.value / maxBar) * 80))
                  const isLast = i === monthlyData.length - 1
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div title={fmtVND(d.value)} style={{
                        width: "100%", borderRadius: 5,
                        height: h,
                        background: isLast ? "#10b981" : "#10b98144",
                        transition: "height 0.3s", cursor: "default",
                        position: "relative",
                      }} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {monthlyData.map((d, i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#bbb" }}>{d.label}</div>
                    {d.value > 0 && <div style={{ fontSize: 9, color: "#10b981", marginTop: 1 }}>{(d.value / 1000000).toFixed(1)}M</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Status Breakdown */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 16 }}>Payment Breakdown</div>
              {stats && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "Completed", value: stats.completed, color: "#10b981" },
                    { label: "Pending",   value: stats.pending,   color: "#f59e0b" },
                    { label: "Expired",   value: stats.expired,   color: "#9ca3af" },
                  ].map(s => {
                    const pct = stats.total ? Math.round((s.value / stats.total) * 100) : 0
                    return (
                      <div key={s.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: "#555" }}>{s.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.value} <span style={{ color: "#bbb", fontWeight: 400 }}>({pct}%)</span></span>
                        </div>
                        <div style={{ height: 6, borderRadius: 99, background: "#f3f4f6", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: pct + "%", background: s.color, borderRadius: 99, transition: "width 0.5s" }} />
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid #f5f5f5" }}>
                    <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>Total transactions</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>{stats.total}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Completed Transactions Table */}
          <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #f5f5f5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>Completed Transactions</div>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{total} successful payments</div>
              </div>
            </div>
            {loading ? <LoadingBox /> : (
              <table className="w-full text-left" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Package</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Tokens</th>
                    <th className="px-4 py-3">Transaction ID</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payments.filter(p => p.status === "completed").map(p => (
                    <tr key={p.id} className="text-sm hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">#{p.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 truncate">{p.user_name}</div>
                        <div className="text-xs text-gray-400 truncate">{p.user_email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 capitalize text-xs">{p.package_id?.replace("_", " ")}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">{fmtVND(p.amount_vnd)}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">+{p.tokens}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate">{p.sepay_transaction_id || "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(p.paid_at || p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {payments.filter(p => p.status === "completed").length === 0 && !loading && (
              <EmptyBox text="No completed transactions yet" />
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <PageBtn disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>Prev</PageBtn>
              <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
              <PageBtn disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}>Next</PageBtn>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ============================================================
   SECTION: API KEYS
   ============================================================ */

function ApiUsageGuide() {
  const [tab, setTab] = useState("bash")
  const kw   = { color: "#7c6ef5" }
  const url  = { color: "#34d399" }
  const flag = { color: "#fbbf24" }
  const val  = { color: "#f9a8d4" }
  const cm   = { color: "#888" }
  const tabStyle = (active) => ({
    background: active ? "#1a1a2e" : "none",
    border: active ? "0.5px solid #3a3a55" : "0.5px solid transparent",
    borderRadius: 6, padding: "4px 14px", fontSize: 11,
    cursor: "pointer", color: active ? "#a89ff5" : "#666",
    fontFamily: "monospace", lineHeight: 1.6,
  })
  const codeBox = { background: "#0d0d0d", borderRadius: 8, padding: "14px 16px", fontFamily: "monospace", fontSize: 11.5, color: "#ccc", lineHeight: 2, overflowX: "auto" }
  const nl   = tab === "bash" ? " \\" : tab === "ps" ? " `" : " ^"
  const curl = tab === "bash" ? "curl" : "curl.exe"

  const BashCmd = () => (
    <div style={codeBox}>
      <div style={cm}># Stage 1 — Generate white mesh</div>
      <div><span style={kw}>{curl} -X POST</span>{" "}<span style={url}>https://api.example.com/api/v1/generate-shape-mv/upload</span>{nl}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span>{nl}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-F</span> <span style={val}>"front=@front.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"left=@left.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"right=@right.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"back=@back.jpeg"</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Track Stage 1 progress (SSE stream)</div>
      <div><span style={kw}>{curl}</span>{" "}<span style={url}>{"https://api.example.com/api/v1/job-progress-sse/{shape_job_id}"}</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Download white mesh</div>
      <div><span style={kw}>{curl} -O</span>{" "}<span style={url}>{"https://api.example.com/api/v1/download/{shape_job_id}/white"}</span></div>

      <div style={{ ...cm, marginTop: 14 }}># Stage 2 — Apply texture</div>
      <div><span style={kw}>{curl} -X POST</span>{" "}<span style={url}>https://api.example.com/api/v1/generate-texture-mv</span>{nl}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span>{nl}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"Content-Type: application/json"</span>{nl}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-d</span> <span style={val}>{`'{"shape_job_id": "<shape_job_id>", "texture_4k": true}'`}</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Track Stage 2 progress (SSE stream)</div>
      <div><span style={kw}>{curl}</span>{" "}<span style={url}>{"https://api.example.com/api/v1/job-progress-sse/{texture_job_id}"}</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Download textured model</div>
      <div><span style={kw}>{curl} -O</span>{" "}<span style={url}>{"https://api.example.com/api/v1/download/{texture_job_id}/textured"}</span></div>

      <div style={{ ...cm, marginTop: 14 }}># Stage 1 + 2 combined — shape &amp; texture in one request</div>
      <div><span style={kw}>{curl} -X POST</span>{" "}<span style={url}>https://api.example.com/api/v1/generate-full-mv/upload</span>{nl}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span>{nl}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-F</span> <span style={val}>"front=@front.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"left=@left.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"right=@right.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"back=@back.jpeg"</span>{nl}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-F</span> <span style={val}>"texture_4k=true"</span></div>

      <div style={{ ...cm, marginTop: 14 }}># List your jobs</div>
      <div><span style={kw}>{curl}</span>{" "}<span style={url}>https://api.example.com/api/v1/my-jobs</span>{nl}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span></div>
    </div>
  )

  const PsCmd = () => (
    <div style={codeBox}>
      <div style={cm}># Stage 1 — Generate white mesh</div>
      <div><span style={kw}>curl.exe -X POST</span>{" "}<span style={url}>https://api.example.com/api/v1/generate-shape-mv/upload</span>{" `"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span>{" `"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-F</span> <span style={val}>"front=@front.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"left=@left.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"right=@right.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"back=@back.jpeg"</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Track Stage 1 progress (SSE stream)</div>
      <div><span style={kw}>curl.exe</span>{" "}<span style={url}>{"https://api.example.com/api/v1/job-progress-sse/{shape_job_id}"}</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Download white mesh</div>
      <div><span style={kw}>curl.exe -O</span>{" "}<span style={url}>{"https://api.example.com/api/v1/download/{shape_job_id}/white"}</span></div>

      <div style={{ ...cm, marginTop: 14 }}># Stage 2 — Apply texture</div>
      <div><span style={kw}>curl.exe -X POST</span>{" "}<span style={url}>https://api.example.com/api/v1/generate-texture-mv</span>{" `"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span>{" `"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"Content-Type: application/json"</span>{" `"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-d</span> <span style={val}>{'"{\\\"shape_job_id\\\": \\\"<shape_job_id>\\\", \\\"texture_4k\\\": true}"'}</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Track Stage 2 progress (SSE stream)</div>
      <div><span style={kw}>curl.exe</span>{" "}<span style={url}>{"https://api.example.com/api/v1/job-progress-sse/{texture_job_id}"}</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Download textured model</div>
      <div><span style={kw}>curl.exe -O</span>{" "}<span style={url}>{"https://api.example.com/api/v1/download/{texture_job_id}/textured"}</span></div>

      <div style={{ ...cm, marginTop: 14 }}># Stage 1 + 2 combined — shape &amp; texture in one request</div>
      <div><span style={kw}>curl.exe -X POST</span>{" "}<span style={url}>https://api.example.com/api/v1/generate-full-mv/upload</span>{" `"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span>{" `"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-F</span> <span style={val}>"front=@front.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"left=@left.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"right=@right.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"back=@back.jpeg"</span>{" `"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-F</span> <span style={val}>"texture_4k=true"</span></div>

      <div style={{ ...cm, marginTop: 14 }}># List your jobs</div>
      <div><span style={kw}>curl.exe</span>{" "}<span style={url}>https://api.example.com/api/v1/my-jobs</span>{" `"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span></div>
    </div>
  )

  const CmdCmd = () => (
    <div style={codeBox}>
      <div style={cm}># Stage 1 — Generate white mesh</div>
      <div><span style={kw}>curl.exe -X POST</span>{" "}<span style={url}>https://api.example.com/api/v1/generate-shape-mv/upload</span>{" ^"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span>{" ^"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-F</span> <span style={val}>"front=@front.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"left=@left.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"right=@right.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"back=@back.jpeg"</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Track Stage 1 progress (SSE stream)</div>
      <div><span style={kw}>curl.exe</span>{" "}<span style={url}>{"https://api.example.com/api/v1/job-progress-sse/{shape_job_id}"}</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Download white mesh</div>
      <div><span style={kw}>curl.exe -O</span>{" "}<span style={url}>{"https://api.example.com/api/v1/download/{shape_job_id}/white"}</span></div>

      <div style={{ ...cm, marginTop: 14 }}># Stage 2 — Apply texture</div>
      <div><span style={kw}>curl.exe -X POST</span>{" "}<span style={url}>https://api.example.com/api/v1/generate-texture-mv</span>{" ^"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span>{" ^"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"Content-Type: application/json"</span>{" ^"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-d</span> <span style={val}>{'"{\\\"shape_job_id\\\": \\\"<shape_job_id>\\\", \\\"texture_4k\\\": true}"'}</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Track Stage 2 progress (SSE stream)</div>
      <div><span style={kw}>curl.exe</span>{" "}<span style={url}>{"https://api.example.com/api/v1/job-progress-sse/{texture_job_id}"}</span></div>

      <div style={{ ...cm, marginTop: 10 }}># Download textured model</div>
      <div><span style={kw}>curl.exe -O</span>{" "}<span style={url}>{"https://api.example.com/api/v1/download/{texture_job_id}/textured"}</span></div>

      <div style={{ ...cm, marginTop: 14 }}># Stage 1 + 2 combined — shape &amp; texture in one request</div>
      <div><span style={kw}>curl.exe -X POST</span>{" "}<span style={url}>https://api.example.com/api/v1/generate-full-mv/upload</span>{" ^"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span>{" ^"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-F</span> <span style={val}>"front=@front.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"left=@left.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"right=@right.jpeg"</span>{" "}<span style={flag}>-F</span> <span style={val}>"back=@back.jpeg"</span>{" ^"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-F</span> <span style={val}>"texture_4k=true"</span></div>

      <div style={{ ...cm, marginTop: 14 }}># List your jobs</div>
      <div><span style={kw}>curl.exe</span>{" "}<span style={url}>https://api.example.com/api/v1/my-jobs</span>{" ^"}</div>
      <div style={{ paddingLeft: 16 }}><span style={flag}>-H</span> <span style={val}>"X-API-Key: sk_live_xxxx...abcd"</span></div>
    </div>
  )

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button style={tabStyle(tab === "bash")} onClick={() => setTab("bash")}>
          bash / zsh<br /><span style={{ fontSize: 10, opacity: 0.7 }}>Linux · macOS</span>
        </button>
        <button style={tabStyle(tab === "ps")} onClick={() => setTab("ps")}>
          PowerShell<br /><span style={{ fontSize: 10, opacity: 0.7 }}>Windows</span>
        </button>
        <button style={tabStyle(tab === "cmd")} onClick={() => setTab("cmd")}>
          CMD<br /><span style={{ fontSize: 10, opacity: 0.7 }}>Windows</span>
        </button>
      </div>
      {tab === "bash" && <BashCmd />}
      {tab === "ps"   && <PsCmd />}
      {tab === "cmd"  && <CmdCmd />}
    </>
  )
}

function SectionApiKeys() {
  const [keys, setKeys]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editKey, setEditKey]       = useState(null)   // P2: edit mode
  const [busy, setBusy]             = useState(null)
  const [copiedId, setCopiedId]     = useState(null)
  const [actionError, setActionError] = useState("")   // P1: error feedback

  const fetchKeys = () => {
    setLoading(true)
    getApiKeys()                                        // P2: named export
      .then(res => setKeys(res.data || []))
      .catch(() => setKeys([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchKeys() }, [])

  // P1: error handling cho revoke
  const revokeKey = async (key) => {
    if (!window.confirm(`Revoke key "${key.name}"? It will stop working immediately.`)) return
    setBusy(key.id + "_revoke")
    setActionError("")
    try {
      await revokeApiKey(key.id)                       // P2: named export
      setKeys(prev => prev.map(k => k.id === key.id ? { ...k, status: "revoked" } : k))
    } catch (e) {
      setActionError(e.response?.data?.detail || `Failed to revoke key "${key.name}", please try again.`)
    } finally { setBusy(null) }
  }

  // P1: error handling cho delete
  const deleteKey = async (key) => {
    if (!window.confirm(`Permanently delete key "${key.name}"?`)) return
    setBusy(key.id + "_delete")
    setActionError("")
    try {
      await deleteApiKey(key.id)                       // P2: named export
      setKeys(prev => prev.filter(k => k.id !== key.id))
    } catch (e) {
      setActionError(e.response?.data?.detail || `Failed to delete key "${key.name}", please try again.`)
    } finally { setBusy(null) }
  }

  // P0: only copy if key_value is present (just created), skip otherwise
  const copyKey = (key) => {
    if (!key.key_value) return
    navigator.clipboard.writeText(key.key_value).then(() => {
      setCopiedId(key.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const activeCount  = keys.filter(k => k.status === "active").length
  const revokedCount = keys.filter(k => k.status === "revoked").length
  const totalCalls   = keys.reduce((s, k) => s + (k.calls_used ?? 0), 0)

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <PageHeader title="API Keys" subtitle="Grant API access to external developers for 3D model generation" noMargin />
        <button onClick={() => setShowCreate(true)} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "linear-gradient(135deg, #7c6ef5, #5650cc)",
          color: "#fff", border: "none", borderRadius: 10,
          padding: "9px 18px", fontSize: 13, fontWeight: 500,
          cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
        }}>
          + Create API Key
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard title="Active" value={activeCount}  color="emerald" icon="" />
        <StatCard title="Revoked"     value={revokedCount} color="red"     icon="" />
        <StatCard title="Total Calls"  value={totalCalls}   color="indigo"  icon="" />
      </div>

      {/* Pricing Info */}
      <div style={{ background: "#fff", borderRadius: 16, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>API Quota Pricing</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>1 quota = 1 full generation call (Stage 1 + Stage 2)</div>
          </div>
          <span style={{ background: "#eef2ff", color: "#4f46e5", borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>$0.20 / quota</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "Starter",  quota: 50,   price: "$10",  per: "$0.20/call" },
            { label: "Pro",      quota: 200,  price: "$29",  per: "$0.145/call" },
            { label: "Business", quota: 700,  price: "$79",  per: "$0.113/call" },
            { label: "Pay-as-go",quota: null, price: "—",    per: "$0.20/call" },
          ].map(t => (
            <div key={t.label} style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#888", fontWeight: 500, marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{t.price}</div>
              {t.quota && <div style={{ fontSize: 11, color: "#7c6ef5", marginTop: 2 }}>{t.quota} quota/mo</div>}
              <div style={{ fontSize: 10, color: "#bbb", marginTop: 3 }}>{t.per}</div>
            </div>
          ))}
        </div>

      </div>

      {/* P1: show action errors inline */}
      {actionError && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: "#fef2f2", border: "1px solid #fecaca",
          fontSize: 13, color: "#dc2626", display: "flex", justifyContent: "space-between",
        }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {loading ? <LoadingBox /> : (
        <div className="overflow-hidden rounded-2xl bg-white shadow">
          <table className="w-full text-left" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "20%" }} /><col style={{ width: "22%" }} />
              <col style={{ width: "11%" }} /><col style={{ width: "14%" }} />
              <col style={{ width: "13%" }} /><col style={{ width: "20%" }} />
            </colgroup>
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3">Key Name</th>
                <th className="px-5 py-3">API Key</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Monthly Quota</th>
                <th className="px-5 py-3">Usage</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {keys.map(k => {
                const isExpired = k.expires_at && new Date(k.expires_at) < new Date()
                return (
                  <tr key={k.id} className="text-sm hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900 truncate">{k.name}</div>
                      <div className="text-xs text-gray-400 truncate">{k.owner_email || "—"}</div>
                      {/* P1: show expires_at, red if expired */}
                      {k.expires_at && (
                        <div className={`text-xs mt-0.5 ${isExpired ? "text-red-400" : "text-gray-400"}`}>
                          {isExpired ? "Expired: " : "Expires: "}
                          {new Date(k.expires_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontFamily: "monospace", fontSize: 11,
                          background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, color: "#555",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120,
                        }}>{k.key_preview || maskKey(k.key_value)}</span>
                        {/* P0: only show copy button if key_value present (just created) */}
                        {k.key_value ? (
                          <button onClick={() => copyKey(k)} title="Copy full key" style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: copiedId === k.id ? "#10b981" : "#aaa", fontSize: 14, padding: 2, flexShrink: 0,
                          }}>{copiedId === k.id ? "✓" : "⎘"}</button>
                        ) : (
                          <span title="Key cannot be viewed again" style={{ fontSize: 12, color: "#d1d5db", padding: 2, flexShrink: 0, cursor: "default" }}>⎘</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3"><ApiKeyStatusBadge status={k.status} /></td>
                    <td className="px-5 py-3 text-gray-600 text-xs">
                      {k.quota_per_month == null ? "Unlimited" : `${k.quota_per_month} calls`}
                    </td>
                    <td className="px-5 py-3">
                      {/* P0: show calls_this_month vs monthly quota */}
                      <div className="text-gray-700 text-sm font-mono">{k.calls_this_month ?? 0}</div>
                      <div className="text-gray-400 text-xs">/ {k.quota_per_month ?? "∞"} quota</div>
                      {/* P0: progress bar using calls_this_month vs monthly quota */}
                      {k.quota_per_month && (
                        <div style={{ marginTop: 3, height: 3, background: "#e5e7eb", borderRadius: 99 }}>
                          <div style={{
                            height: "100%", borderRadius: 99,
                            background: (k.calls_this_month ?? 0) / k.quota_per_month > 0.9 ? "#ef4444" : "#7c6ef5",
                            width: `${Math.min(100, Math.round(((k.calls_this_month ?? 0) / k.quota_per_month) * 100))}%`,
                          }} />
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {/* P2: edit quota/note button */}
                        <ActionBtn onClick={() => setEditKey(k)} disabled={!!busy} color="indigo">Edit
          </ActionBtn>
                        {k.status === "active" && (
                          <ActionBtn onClick={() => revokeKey(k)} disabled={!!busy} color="amber">
                            {busy === k.id + "_revoke" ? "..." : "Revoke"}
                          </ActionBtn>
                        )}
                        <ActionBtn onClick={() => deleteKey(k)} disabled={!!busy} color="red">
                          {busy === k.id + "_delete" ? "..." : "Delete"}
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {keys.length === 0 && <EmptyBox text="No API keys yet. Click '+ Create API Key' to get started." />}
        </div>
      )}

      {/* Docs */}
      <div className="mt-6 rounded-2xl bg-white shadow p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">API Usage Guide</h3>
        <p className="text-xs text-gray-500 mb-3">Pass your API key via the header <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>X-API-Key</code></p>
        <ApiUsageGuide />

      </div>

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={(newKey) => { setKeys(prev => [newKey, ...prev]); setShowCreate(false) }}
        />
      )}

      {/* P2: key edit modal */}
      {editKey && (
        <CreateKeyModal
          editKey={editKey}
          onClose={() => setEditKey(null)}
          onCreated={(updated) => {
            setKeys(prev => prev.map(k => k.id === updated.id ? { ...k, ...updated } : k))
            setEditKey(null)
          }}
        />
      )}
    </div>
  )
}

/* ---- Create / Edit Key Modal ---- */
const PLANS = [
  { label: "Starter",   quota: 50,   price: "$10", per: "$0.20/call",  color: "#6366f1", expiryMonths: 1  },
  { label: "Pro",       quota: 200,  price: "$29", per: "$0.145/call", color: "#7c6ef5", expiryMonths: 12 },
  { label: "Business",  quota: 700,  price: "$79", per: "$0.113/call", color: "#8b5cf6", expiryMonths: 12 },
  { label: "Pay-as-go", quota: null, price: "—",   per: "$0.20/call",  color: "#64748b", expiryMonths: null },
]

function calcExpiry(months) {
  if (!months) return ""
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function CreateKeyModal({ onClose, onCreated, editKey }) {
  const isEdit = !!editKey
  const [form, setForm] = useState(isEdit ? {
    name:            editKey.name           || "",
    owner_email:     editKey.owner_email    || "",
    quota_per_month: editKey.quota_per_month != null ? String(editKey.quota_per_month) : "",
    expires_at:      editKey.expires_at     || "",
    note:            editKey.note           || "",
  } : { name: "", owner_email: "", quota_per_month: "", expires_at: "", note: "" })
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [newKey, setNewKey]   = useState(null)
  const [copied, setCopied]   = useState(false)
  const [error, setError]     = useState("")

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const applyPlan = (plan) => {
    setSelectedPlan(plan.label)
    set("quota_per_month", plan.quota ? String(plan.quota) : "")
    set("expires_at", calcExpiry(plan.expiryMonths))
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError("Please enter a key name"); return }
    setLoading(true); setError("")
    try {
      if (isEdit) {
        // P2: call updateApiKey instead of POST
        await updateApiKey(editKey.id, {
          name:            form.name.trim(),
          quota_per_month: form.quota_per_month ? parseInt(form.quota_per_month) : null,
          expires_at:      form.expires_at || null,
          note:            form.note.trim() || null,
        })
        onCreated({ ...editKey, ...form, quota_per_month: form.quota_per_month ? parseInt(form.quota_per_month) : null })
      } else {
        const res = await createApiKey({                 // P2: named export
          name:            form.name.trim(),
          owner_email:     form.owner_email.trim() || null,
          quota_per_month: form.quota_per_month ? parseInt(form.quota_per_month) : null,
          expires_at:      form.expires_at || null,
          note:            form.note.trim() || null,
        })
        setNewKey(res.data)
      }
    } catch (e) {
      setError(e.response?.data?.detail || (isEdit ? "Update failed" : "Failed to create key"))
    } finally { setLoading(false) }
  }

  const copyAndDone = () => {
    navigator.clipboard.writeText(newKey.key_value).then(() => {
      setCopied(true)
      setTimeout(() => onCreated(newKey), 1200)
    })
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480,
        padding: 28, fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        {!newKey ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{isEdit ? `Edit: ${editKey.name}` : "Create New API Key"}</h2>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999" }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Plan selector — only on create */}
              {!isEdit && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#555", marginBottom: 7 }}>Select Plan</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
                    {PLANS.map(plan => {
                      const active = selectedPlan === plan.label
                      return (
                        <button key={plan.label} onClick={() => applyPlan(plan)} style={{
                          border: `1.5px solid ${active ? plan.color : "#e5e7eb"}`,
                          borderRadius: 10, padding: "9px 6px", cursor: "pointer",
                          background: active ? plan.color + "12" : "#fafafa",
                          textAlign: "center", fontFamily: "'DM Sans', sans-serif",
                          transition: "all 0.15s",
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: active ? plan.color : "#555" }}>{plan.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: active ? plan.color : "#111", marginTop: 2 }}>{plan.price}</div>
                          {plan.quota
                            ? <div style={{ fontSize: 10, color: active ? plan.color : "#aaa", marginTop: 1 }}>{plan.quota} quota/mo</div>
                            : <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>pay per call</div>
                          }
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <FormField label="Key Name *" hint='e.g. "Mobile App", "Studio X"'>
                <input type="text" placeholder="Enter a name to identify this key..." value={form.name}
                  onChange={e => set("name", e.target.value)} style={inputStyle} />
              </FormField>
              {/* Owner email is only shown on creation, cannot be changed later */}
              {!isEdit && (
                <FormField label="Key Owner Email" hint="Person receiving the key (optional)">
                  <input type="email" placeholder="developer@example.com" value={form.owner_email}
                    onChange={e => set("owner_email", e.target.value)} style={inputStyle} />
                </FormField>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Monthly Quota" hint="Leave blank for unlimited">
                  <input type="number" min={1} placeholder="e.g. 1000" value={form.quota_per_month}
                    onChange={e => set("quota_per_month", e.target.value)} style={inputStyle} />
                </FormField>
                <FormField label="Expiry Date" hint="Leave blank for no expiry">
                  <input type="date" value={form.expires_at}
                    onChange={e => set("expires_at", e.target.value)} style={inputStyle} />
                </FormField>
              </div>
              <FormField label="Notes">
                <textarea placeholder="Purpose or usage notes..." value={form.note} rows={2}
                  onChange={e => set("note", e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
              </FormField>
            </div>

            {error && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 12 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={onClose} style={{
                flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e5e7eb",
                background: "none", color: "#666", fontSize: 13, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}>Cancel</button>
              <button onClick={handleSubmit} disabled={loading} style={{
                flex: 2, padding: "10px",
                background: "linear-gradient(135deg, #7c6ef5, #5650cc)",
                border: "none", borderRadius: 10, color: "#fff",
                fontSize: 13, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif",
              }}>
                {loading ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create API Key")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              
              <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px" }}>API Key Created!</h2>
              <p style={{ fontSize: 13, color: "#888" }}>
                Copy and share the key with the recipient.<br />
                <strong style={{ color: "#ef4444" }}>The key is shown only once.</strong>
              </p>
            </div>
            <div style={{
              background: "#0d0d0d", borderRadius: 10, padding: "14px 16px",
              marginBottom: 16, display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{
                fontFamily: "monospace", fontSize: 12, color: "#7c6ef5",
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{newKey.key_value}</span>
              <button onClick={copyAndDone} style={{
                background: copied ? "#10b981" : "#7c6ef5", color: "#fff",
                border: "none", borderRadius: 6, padding: "5px 12px",
                fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>{copied ? "Copied!" : "Copy Key"}</button>
            </div>
            <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7, marginBottom: 20 }}>
              <div>Name: <strong style={{ color: "#333" }}>{newKey.name}</strong></div>
              {newKey.owner_email && <div>Owner: <strong style={{ color: "#333" }}>{newKey.owner_email}</strong></div>}
              {newKey.quota_per_month && <div>Quota: <strong style={{ color: "#333" }}>{newKey.quota_per_month} calls/month</strong></div>}
              {newKey.expires_at && <div>Expires: <strong style={{ color: "#333" }}>{newKey.expires_at}</strong></div>}
            </div>
            <button onClick={() => onCreated(newKey)} style={{
              width: "100%", padding: "10px", background: "#f3f4f6", border: "none",
              borderRadius: 10, fontSize: 13, color: "#555", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   SHARED: SubmissionCard
   ============================================================ */
function SubmissionCard({ sub, busy, showStatus, children }) {
  return (
    <div className="rounded-2xl bg-white shadow overflow-hidden flex flex-col">
      <div className="relative h-44 bg-gray-100 flex items-center justify-center overflow-hidden">
        {sub.image_url
          ? <img src={sub.image_url} alt={sub.model_name} className="w-full h-full object-cover" />
          : <span className="text-5xl"></span>
        }
        {showStatus && (
          <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
            sub.is_public ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}>{sub.is_public ? "Public" : "Pending"}</span>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-gray-900 truncate">{sub.model_name}</h3>
        <p className="mt-1 text-sm text-gray-500">{sub.user} · {sub.created_at}</p>
        {sub.categories?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sub.categories.map(c => (
              <span key={c} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{c}</span>
            ))}
          </div>
        )}
        {sub.tags && <p className="mt-1 text-xs text-gray-400 truncate">{sub.tags}</p>}
        {sub.model_url && (
          <a href={sub.model_url} target="_blank" rel="noreferrer" className="mt-2 text-xs text-indigo-600 hover:underline">
            View 3D File
          </a>
        )}
        <div className="mt-auto pt-4 flex gap-2">{children}</div>
      </div>
    </div>
  )
}

/* ============================================================
   REUSABLE COMPONENTS
   ============================================================ */
function PageHeader({ title, subtitle, noMargin }) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: "#111", margin: 0 }}>{title}</h1>
      {subtitle && <p style={{ marginTop: 4, fontSize: 13, color: "#888" }}>{subtitle}</p>}
    </div>
  )
}

function StatCard({ title, value, color, icon }) {
  const C = { indigo: ["#eef2ff","#4f46e5"], emerald: ["#ecfdf5","#059669"], amber: ["#fffbeb","#d97706"], red: ["#fef2f2","#dc2626"] }
  const [bg, text] = C[color] || C.indigo
  return (
    <div className="rounded-2xl bg-white p-5 shadow">
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, color: text, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 500, marginBottom: 10 }}>
        {icon && <span style={{ fontSize: 11 }}>{icon}</span>}{title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: "#111" }}>{value}</div>
    </div>
  )
}

function QuickCard({ title, desc, icon }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
      
      <div style={{ fontSize: 14, fontWeight: 500, color: "#111", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#888" }}>{desc}</div>
    </div>
  )
}

function Avatar({ name }) {
  return (
    <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg, #7c6ef5, #34d399)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff" }}>
      {(name || "U").slice(0, 2).toUpperCase()}
    </div>
  )
}

function RoleBadge({ role }) {
  return role === "admin"
    ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">Admin</span>
    : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">User</span>
}

function ApiKeyStatusBadge({ status }) {
  if (status === "active")  return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">Active</span>
  if (status === "revoked") return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">Revoked</span>
  if (status === "expired") return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">Expired</span>
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">{status}</span>
}

function StatusBadge({ status }) {
  const map   = { completed:"bg-emerald-100 text-emerald-700", processing:"bg-amber-100 text-amber-700", failed:"bg-red-100 text-red-700", pending:"bg-gray-100 text-gray-500", cancelled:"bg-purple-100 text-purple-600" }
  const label = { completed:"Completed", processing:"Processing", failed:"Failed", pending:"Pending", cancelled:"Cancelled" }
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || "bg-gray-100 text-gray-500"}`}>{label[status] || status}</span>
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${active ? "bg-white text-gray-900 shadow" : "text-gray-500 hover:text-gray-700"}`}>
      {children}
    </button>
  )
}

function ActionBtn({ onClick, disabled, color, children }) {
  const C = { indigo:["#4f46e5","#c7d2fe","#eef2ff"], amber:["#d97706","#fde68a","#fffbeb"], emerald:["#059669","#a7f3d0","#ecfdf5"], red:["#dc2626","#fecaca","#fef2f2"] }
  const [text, border, hoverBg] = C[color] || C.indigo
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize: 11, padding: "3px 9px", borderRadius: 6,
      border: `1px solid ${border}`, background: "transparent",
      color: text, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif",
      transition: "background 0.12s", whiteSpace: "nowrap",
    }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >{children}</button>
  )
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
      width: 300, padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 10,
      fontSize: 13, outline: "none", background: "#fff", fontFamily: "'DM Sans', sans-serif", color: "#333",
    }} />
  )
}

function FormField({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#555", marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{hint}</p>}
    </div>
  )
}

function PageBtn({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-xl border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition">
      {children}
    </button>
  )
}

function LoadingBox() {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, color: "#aaa", fontSize: 13 }}>Loading...</div>
}

function EmptyBox({ text }) {
  return <div className="rounded-2xl bg-white p-12 text-center text-gray-400 shadow">{text}</div>
}

const inputStyle = {
  width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8,
  fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif", color: "#333",
  background: "#fff", boxSizing: "border-box",
}

function maskKey(key) {
  if (!key) return "sk_forma_••••••••••••"
  return key.slice(0, 12) + "••••••••" + key.slice(-4)
}

/* ICONS */
function IconGrid({ size=16, color="currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
}
function IconUsers({ size=16, color="currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21c0-4 3.1-7 7-7s7 3 7 7"/><circle cx="19" cy="9" r="3"/><path d="M19 15c2.5 0 4 1.5 4 4"/></svg>
}
function IconCube({ size=16, color="currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
}
function IconImage({ size=16, color="currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
}
function IconKey({ size=16, color="currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L21 8l-3-3"/></svg>
}
function IconPayment({ size=16, color="currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
}
function IconRevenue({ size=16, color="currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
}
function IconCoin({ size=16, color="currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v2m0 6v2M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 2.5-5 2.5-5 5C9.5 15.9 10.6 17 12 17s2.5-1.1 2.5-2.5"/></svg>
}