import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 300000,
})

// Gắn JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")

  if (token && token !== "undefined") {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Bắt lỗi 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const token = localStorage.getItem("token")
    const url = err.config?.url || ""

    if (
      token &&
      err.response?.status === 401 &&
      !url.includes("/login") &&
      !url.includes("/register")
    ) {
      console.warn("JWT expired or invalid")
      localStorage.removeItem("token")
      window.location.href = "/login"
    }

    return Promise.reject(err)
  }
)

// THÊM HÀM NÀY
export function convert3D(formData) {
  return api.post("/convert-3d", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  })
}

export default api
