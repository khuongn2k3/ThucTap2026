import { useEffect, useState } from "react"
import api from "../services/api"

export default function History() {
  const [jobs, setJobs] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true)

        // ❌ CHƯA CÓ BACKEND → để trống
        // const res = await api.get("/model-jobs")
        // setJobs(res.data)

      } catch (err) {
        setError("Không thể tải lịch sử mô hình")
      } finally {
        setLoading(false)
      }
    }

    fetchJobs()
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-gray-500">
        Đang tải lịch sử...
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          📜 Lịch sử tạo mô hình
        </h1>
        <p className="mt-1 text-gray-600">
          Danh sách các job AI bạn đã thực hiện
        </p>
      </div>

      {/* EMPTY STATE */}
      {jobs.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow text-gray-500">
          Chưa có job nào được tạo
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-sm text-gray-600">
              <tr>
                <th className="px-6 py-3">Job ID</th>
                <th className="px-6 py-3">Ngày tạo</th>
                <th className="px-6 py-3">Trạng thái</th>
                <th className="px-6 py-3">Tải xuống</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {jobs.map(job => (
                <tr key={job.id} className="text-sm">
                  <td className="px-6 py-4 font-mono text-gray-800">
                    {job.id}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {job.created_at}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-6 py-4">
                    {job.model_url ? (
                      <a
                        href={job.model_url}
                        className="text-indigo-600 hover:underline"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* =====================
   STATUS BADGE
   ===================== */

function StatusBadge({ status }) {
  const map = {
    completed: "bg-emerald-100 text-emerald-700",
    processing: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
  }

  const label = {
    completed: "Hoàn thành",
    processing: "Đang xử lý",
    failed: "Thất bại",
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${map[status]}`}
    >
      {label[status]}
    </span>
  )
}
