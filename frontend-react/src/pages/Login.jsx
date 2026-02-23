import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { login } from "../services/api"  // ✅ Import function

export default function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await login({ email, password })  //  Dùng function

      if (!res.data?.access_token) {
        throw new Error("Không nhận được access_token")
      }

      localStorage.setItem("token", res.data.access_token)
      navigate("/dashboard")
    } catch (err) {
      console.error(" Login error:", err.response?.data)
      setError(err.response?.data?.detail || "Email hoặc mật khẩu không đúng")
    } finally {
      setLoading(false)
    }
  }

  // Google Login
  const handleGoogleLogin = () => {
    window.location.href =
      import.meta.env.VITE_API_URL + "/auth/google/redirect"
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
        {/* ===== HEADER ===== */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Hunyuan3D
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Đăng nhập để sử dụng hệ thống chuyển đổi 3D
          </p>
        </div>

        {/* ===== ERROR ===== */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* ===== GOOGLE LOGIN ===== */}
        <button
          onClick={handleGoogleLogin}
          className="
            w-full flex items-center justify-center gap-3
            rounded-xl border border-gray-200
            bg-white py-2.5
            text-gray-700 font-medium
            shadow-sm
            hover:bg-gray-50 hover:shadow
            transition
          "
        >
          <img
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt="Google"
            className="h-5 w-5"
          />
          Tiếp tục với Google
        </button>

        {/* ===== DIVIDER ===== */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-400">HOẶC</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* ===== EMAIL LOGIN ===== */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="
                w-full rounded-xl border border-gray-300
                px-4 py-2.5 text-sm
                focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
                outline-none transition
              "
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="
                w-full rounded-xl border border-gray-300
                px-4 py-2.5 text-sm
                focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
                outline-none transition
              "
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="
              w-full flex items-center justify-center gap-2
              rounded-xl bg-indigo-600
              py-2.5 text-sm font-semibold text-white
              hover:bg-indigo-700
              disabled:opacity-60
              transition
            "
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        {/* ===== FOOTER ===== */}
        <p className="mt-6 text-center text-sm text-gray-600">
          Chưa có tài khoản?{" "}
          <span
            onClick={() => navigate("/register")}
            className="cursor-pointer font-medium text-indigo-600 hover:underline"
          >
            Đăng ký ngay
          </span>
        </p>

        <p className="mt-4 text-center text-xs text-gray-400">
          © 2026 Hunyuan3D • Secure Authentication
        </p>
      </div>
    </div>
  )
}