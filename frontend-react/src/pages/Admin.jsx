import { useEffect, useState } from "react"
import api from "../services/api"

export default function Admin() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get("/admin/stats")
      .then(res => setStats(res.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Đang tải dữ liệu admin...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          🛠 Admin Dashboard
        </h1>
        <p className="mt-1 text-gray-600">
          Quản lý hệ thống Hunyuan3D
        </p>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Người dùng"
          value={stats?.users || 0}
          color="indigo"
        />
        <StatCard
          title="Jobs 3D"
          value={stats?.jobs || 0}
          color="emerald"
        />
        <StatCard
          title="Đang xử lý"
          value={stats?.processing || 0}
          color="amber"
        />
        <StatCard
          title="Lỗi"
          value={stats?.failed || 0}
          color="red"
        />
      </div>

      {/* ACTIONS */}
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        <AdminAction
          title="Quản lý người dùng"
          desc="Xem, khóa hoặc phân quyền user"
          to="/admin/users"
        />
        <AdminAction
          title="Quản lý lịch sử"
          desc="Theo dõi toàn bộ job tạo 3D"
          to="/admin/history"
        />
      </div>
    </div>
  )
}

/* ---------------- COMPONENTS ---------------- */

function StatCard({ title, value, color }) {
  const colors = {
    indigo: "bg-indigo-100 text-indigo-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow">
      <div
        className={`inline-flex rounded-lg px-3 py-1 text-sm font-medium ${colors[color]}`}
      >
        {title}
      </div>
      <div className="mt-4 text-3xl font-bold text-gray-900">
        {value}
      </div>
    </div>
  )
}

function AdminAction({ title, desc, to }) {
  return (
    <a
      href={to}
      className="rounded-2xl bg-white p-6 shadow transition hover:-translate-y-1 hover:shadow-lg"
    >
      <h3 className="text-lg font-semibold text-gray-900">
        {title}
      </h3>
      <p className="mt-2 text-sm text-gray-600">
        {desc}
      </p>
    </a>
  )
}
