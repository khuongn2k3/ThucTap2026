import { useEffect, useState } from "react"
import api from "../services/api"

/* ============================================================
   Admin.jsx — Dashboard + Gallery Management
   ============================================================ */

export default function Admin() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]       = useState("pending") // "pending" | "all"

  useEffect(() => {
    api.get("/admin/stats")
      .then(res => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">🛠 Admin Dashboard</h1>
        <p className="mt-1 text-gray-500">Quản lý hệ thống Hunyuan3D</p>
      </div>

      {/* STATS */}
      {!loading && stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-10">
          <StatCard title="Người dùng"  value={stats?.users      || 0} color="indigo" />
          <StatCard title="Jobs 3D"     value={stats?.jobs       || 0} color="emerald" />
          <StatCard title="Đang xử lý" value={stats?.processing  || 0} color="amber" />
          <StatCard title="Lỗi"         value={stats?.failed     || 0} color="red" />
        </div>
      )}

      {/* QUICK ACTIONS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-10">
        <AdminAction title="Quản lý người dùng" desc="Xem, khóa hoặc phân quyền user"       to="/admin/users"   />
        <AdminAction title="Lịch sử Jobs 3D"    desc="Theo dõi toàn bộ job tạo mô hình 3D"  to="/admin/history" />
      </div>

      {/* GALLERY SECTION */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">🖼 Quản lý Gallery</h2>

          {/* TAB SWITCHER */}
          <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>
              Chờ duyệt
            </TabBtn>
            <TabBtn active={tab === "all"} onClick={() => setTab("all")}>
              Tất cả
            </TabBtn>
          </div>
        </div>

        {tab === "pending"
          ? <GalleryPending />
          : <GalleryAll />
        }
      </div>
    </div>
  )
}

/* ============================================================
   TAB: Chờ duyệt
   ============================================================ */
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
    if (!window.confirm("Từ chối và xóa submission này?")) return
    setBusy(id + "_reject")
    try {
      await api.patch(`/gallery/admin/${id}/reject`)
      setSubmissions(prev => prev.filter(s => s.id !== id))
    } finally { setBusy(null) }
  }

  if (loading) return <LoadingBox />

  if (submissions.length === 0)
    return <EmptyBox text="Không có submission nào chờ duyệt ✅" />

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {submissions.map(sub => (
        <SubmissionCard key={sub.id} sub={sub} busy={busy}>
          <button
            onClick={() => approve(sub.id)}
            disabled={!!busy}
            className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40 transition"
          >
            {busy === sub.id + "_approve" ? "..." : "✓ Duyệt"}
          </button>
          <button
            onClick={() => reject(sub.id)}
            disabled={!!busy}
            className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40 transition"
          >
            {busy === sub.id + "_reject" ? "..." : "✕ Từ chối"}
          </button>
        </SubmissionCard>
      ))}
    </div>
  )
}

/* ============================================================
   TAB: Tất cả (có nút xóa)
   ============================================================ */
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
      .then(res => {
        setSubmissions(res.data.submissions || [])
        setTotal(res.data.total || 0)
      })
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll(offset) }, [offset])

  const deleteOne = async (id) => {
    if (!window.confirm("Xóa vĩnh viễn submission này?")) return
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
      setSubmissions(prev =>
        prev.map(s => s.id === sub.id ? { ...s, is_public: true } : s)
      )
    } finally { setBusy(null) }
  }

  if (loading) return <LoadingBox />
  if (submissions.length === 0) return <EmptyBox text="Chưa có submission nào" />

  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  return (
    <div>
      {/* COUNT */}
      <p className="mb-4 text-sm text-gray-500">
        Tổng: <span className="font-semibold text-gray-700">{total}</span> submissions
        &nbsp;·&nbsp; Trang {currentPage}/{totalPages}
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {submissions.map(sub => (
          <SubmissionCard key={sub.id} sub={sub} busy={busy} showStatus>
            {/* Nếu còn pending → hiện nút duyệt */}
            {!sub.is_public && (
              <button
                onClick={() => approve(sub)}
                disabled={!!busy}
                className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40 transition"
              >
                {busy === sub.id + "_approve" ? "..." : "✓ Duyệt"}
              </button>
            )}
            <button
              onClick={() => deleteOne(sub.id)}
              disabled={!!busy}
              className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40 transition"
            >
              {busy === sub.id + "_delete" ? "..." : "🗑 Xóa"}
            </button>
          </SubmissionCard>
        ))}
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <PageBtn
            disabled={offset === 0}
            onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
          >
            ← Trước
          </PageBtn>
          <span className="px-3 text-sm text-gray-600">
            {currentPage} / {totalPages}
          </span>
          <PageBtn
            disabled={offset + LIMIT >= total}
            onClick={() => setOffset(o => o + LIMIT)}
          >
            Sau →
          </PageBtn>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   Shared SubmissionCard
   ============================================================ */
function SubmissionCard({ sub, busy, showStatus, children }) {
  return (
    <div className="rounded-2xl bg-white shadow overflow-hidden flex flex-col">
      {/* Preview image */}
      <div className="relative h-44 bg-gray-100 flex items-center justify-center overflow-hidden">
        {sub.image_url
          ? <img src={sub.image_url} alt={sub.model_name} className="w-full h-full object-cover" />
          : <span className="text-5xl">🗂</span>
        }
        {showStatus && (
          <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
            sub.is_public
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}>
            {sub.is_public ? "✓ Public" : "⏳ Pending"}
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-gray-900 truncate">{sub.model_name}</h3>
        <p className="mt-1 text-sm text-gray-500">
          👤 {sub.user} · {sub.created_at}
        </p>

        {sub.categories?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sub.categories.map(c => (
              <span key={c} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                {c}
              </span>
            ))}
          </div>
        )}

        {sub.tags && (
          <p className="mt-1 text-xs text-gray-400 truncate">🏷 {sub.tags}</p>
        )}

        {sub.model_url && (
          <a
            href={sub.model_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 text-xs text-indigo-600 hover:underline"
          >
            📦 Xem file 3D
          </a>
        )}

        {/* Action buttons */}
        <div className="mt-auto pt-4 flex gap-2">
          {children}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Small reusable components
   ============================================================ */
function StatCard({ title, value, color }) {
  const colors = {
    indigo:  "bg-indigo-50  text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50   text-amber-700",
    red:     "bg-red-50     text-red-700",
  }
  return (
    <div className="rounded-2xl bg-white p-5 shadow">
      <div className={`inline-block rounded-lg px-2 py-1 text-xs font-medium ${colors[color]}`}>
        {title}
      </div>
      <div className="mt-3 text-3xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

function AdminAction({ title, desc, to }) {
  return (
    <a href={to} className="block rounded-2xl bg-white p-6 shadow transition hover:-translate-y-1 hover:shadow-lg">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{desc}</p>
    </a>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-white text-gray-900 shadow"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  )
}

function PageBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition"
    >
      {children}
    </button>
  )
}

function LoadingBox() {
  return (
    <div className="flex h-48 items-center justify-center text-gray-400">
      Đang tải...
    </div>
  )
}

function EmptyBox({ text }) {
  return (
    <div className="rounded-2xl bg-white p-12 text-center text-gray-400 shadow">
      {text}
    </div>
  )
}
