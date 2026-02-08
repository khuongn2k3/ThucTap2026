import { useEffect, useState } from "react"
import api from "../services/api"

export default function Dashboard() {
  const [user, setUser] = useState(null)

  const [stats, setStats] = useState({
    total: null,
    processing: null,
    completed: null,
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Lấy user hiện tại
        const meRes = await api.get("/me")
        setUser(meRes.data)

        // Chưa có backend
        // const statsRes = await api.get("/dashboard/stats")
        // setStats(statsRes.data)

      } catch (err) {
        setError("Không thể tải dữ liệu dashboard")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-gray-500">
        Đang tải dashboard...
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-red-600">
        {error}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          👋 Chào {user?.name || "bạn"}
        </h1>
        <p className="mt-1 text-gray-600">
          Tổng quan hoạt động tạo mô hình 3D của bạn
        </p>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard
          title="Tổng mô hình"
          value={stats.total}
          color="indigo"
        />
        <StatCard
          title="Đang xử lý"
          value={stats.processing}
          color="amber"
        />
        <StatCard
          title="Hoàn thành"
          value={stats.completed}
          color="emerald"
        />
      </div>

      {/* INFO */}
      <div className="mt-10 rounded-2xl bg-white p-6 shadow">
        <h2 className="text-xl font-semibold text-gray-900">
          🚀 Hunyuan3D AI
        </h2>
        <p className="mt-2 text-gray-600">
          Tải ảnh lên và tạo mô hình 3D chỉ trong vài phút.
          Hỗ trợ OBJ / GLB, tối ưu cho game, AR/VR và in 3D.
        </p>
      </div>
    </div>
  )
}

/* =====================
   STAT CARD COMPONENT
   ===================== */

function StatCard({ title, value, color }) {
  const colors = {
    indigo: "bg-indigo-100 text-indigo-700",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow">
      <div
        className={`inline-flex rounded-lg px-3 py-1 text-sm font-medium ${colors[color]}`}
      >
        {title}
      </div>

      <div className="mt-4 text-3xl font-bold text-gray-900">
        {value === null ? (
          <span className="text-gray-400 text-xl">—</span>
        ) : (
          value
        )}
      </div>
    </div>
  )
}
