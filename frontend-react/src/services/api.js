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

// =========================================
//                AUTH API 
// =========================================

export function register(data) {
  return api.post("/auth/register", data)
}

export function login(data) {
  return api.post("/auth/login", data)
}

export function getMe() {
  return api.get("/auth/me")  
}

// =========================================
// PROFILE API
// =========================================

export function updateProfile(formData) {
  return api.post("/auth/me/update", formData)  
}

export function changePassword(data) {
  return api.post("/auth/me/change-password", data)  
}

// =========================================
// 3D CONVERSION API
// =========================================

export function convert3D(formData) {
  return api.post("/convert-3d/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  })
}

export function getJobStatus(jobId) {
  return api.get(`/job-status/${jobId}`)  
}

// =========================================
// HEALTH CHECK
// =========================================

export function healthCheck() {
  return api.get("/health")
}

export default api