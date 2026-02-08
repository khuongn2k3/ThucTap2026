import { useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "../services/api"

export default function Register() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    password_confirmation: "",
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await api.post("/register", form)

      if (res.data?.token) {
        localStorage.setItem("token", res.data.token)
      }

      navigate("/dashboard")
    } catch (err) {
      setError(err.response?.data?.message || "Đăng ký thất bại")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 px-4">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">
          Tạo tài khoản
        </h1>
        <p className="text-center text-gray-500 mb-6">
          Bắt đầu sử dụng hệ thống
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-100 text-red-700 px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Họ tên
            </label>
            <input
              name="name"
              placeholder="Nguyễn Văn A"
              onChange={handleChange}
              required
              className="
                w-full rounded-lg border border-gray-300 px-4 py-2.5
                focus:outline-none focus:ring-2 focus:ring-purple-500
                transition
              "
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              onChange={handleChange}
              required
              className="
                w-full rounded-lg border border-gray-300 px-4 py-2.5
                focus:outline-none focus:ring-2 focus:ring-purple-500
                transition
              "
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mật khẩu
            </label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              onChange={handleChange}
              required
              className="
                w-full rounded-lg border border-gray-300 px-4 py-2.5
                focus:outline-none focus:ring-2 focus:ring-purple-500
                transition
              "
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nhập lại mật khẩu
            </label>
            <input
              type="password"
              name="password_confirmation"
              placeholder="••••••••"
              onChange={handleChange}
              required
              className="
                w-full rounded-lg border border-gray-300 px-4 py-2.5
                focus:outline-none focus:ring-2 focus:ring-purple-500
                transition
              "
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="
              w-full flex items-center justify-center gap-2
              rounded-lg bg-purple-600 text-white py-2.5 font-semibold
              hover:bg-purple-700 transition
              disabled:opacity-60 disabled:cursor-not-allowed
            "
          >
            {loading && (
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Đang đăng ký..." : "Đăng ký"}
          </button>
        </form>

        <p className="text-sm text-center text-gray-600 mt-6">
          Đã có tài khoản?{" "}
          <span
            onClick={() => navigate("/login")}
            className="text-purple-600 font-medium cursor-pointer hover:underline"
          >
            Đăng nhập
          </span>
        </p>
      </div>
    </div>
  )
}
