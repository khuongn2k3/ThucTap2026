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
// AUTH API
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
// 3D MULTIVIEW API (2mv - 2 giai đoạn)
// =========================================

/**
 * Stage 1: Upload ảnh multiview → sinh white mesh
 * @param {FormData} formData - front (bắt buộc), left, right, back (tùy chọn)
 * @returns job_id để subscribe SSE
 */
export function generateShapeMv(formData) {
  return api.post("/generate-shape-mv/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
}

/**
 * Stage 2: Sơn texture lên white mesh
 * @param {FormData} formData - shape_job_id + front image
 * @returns job_id mới để subscribe SSE
 */
export function generateTextureMv(formData) {
  return api.post("/generate-texture-mv/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
}

/**
 * Giải phóng shape pipeline khỏi VRAM ngay sau Stage 1
 */
export function unloadShapeMv() {
  return api.post("/worker-mv/unload-shape")
}

/**
 * Poll trạng thái job — giữ lại để fallback khi SSE không khả dụng
 */
export function getJobStatusMv(jobId) {
  return api.get(`/job-status-mv/${jobId}`)
}

// =========================================
// [MỚI] SSE — Stream progress realtime
// =========================================

/**
 * Mở SSE stream để nhận progress events realtime của 1 job.
 *
 * @param {string} jobId - job_id trả về từ generateShapeMv / generateTextureMv
 * @param {object} handlers - callback handlers
 * @param {function} handlers.onProgress  - (data) => void  — mỗi bước xử lý
 * @param {function} handlers.onCompleted - (data) => void  — job xong, có output_model_url
 * @param {function} handlers.onFailed    - (data) => void  — job lỗi
 * @param {function} [handlers.onHeartbeat] - (data) => void — optional heartbeat
 * @returns {EventSource} - gọi .close() để ngắt kết nối
 *
 * @example
 * const es = openJobSSE(jobId, {
 *   onProgress:  d => setLog(d.message),
 *   onCompleted: d => { setUrl(d.output_model_url); es.close() },
 *   onFailed:    d => { setError(d.message); es.close() },
 * })
 * // Cleanup: es.close() khi component unmount
 */
export function openJobSSE(jobId, { onProgress, onCompleted, onFailed, onHeartbeat } = {}) {
  const baseURL = import.meta.env.VITE_API_URL || ""
  const url = `${baseURL}/job-progress-sse/${jobId}`

  const es = new EventSource(url)

  if (onProgress) {
    es.addEventListener("progress", (e) => {
      try { onProgress(JSON.parse(e.data)) } catch { /* ignore parse error */ }
    })
  }

  if (onCompleted) {
    es.addEventListener("completed", (e) => {
      try { onCompleted(JSON.parse(e.data)) } catch { /* ignore parse error */ }
    })
  }

  if (onFailed) {
    es.addEventListener("failed", (e) => {
      try { onFailed(JSON.parse(e.data)) } catch { /* ignore parse error */ }
    })
  }

  if (onHeartbeat) {
    es.addEventListener("heartbeat", (e) => {
      try { onHeartbeat(JSON.parse(e.data)) } catch { /* ignore parse error */ }
    })
  }

  es.onerror = (err) => {
    // EventSource tự reconnect khi mất kết nối —
    // chỉ gọi onFailed nếu server trả về error status (readyState === 2 = CLOSED)
    if (es.readyState === EventSource.CLOSED) {
      if (onFailed) onFailed({ error: "SSE connection closed unexpectedly", message: "❌ Mất kết nối server" })
    }
  }

  return es
}

// =========================================
// 3D SINGLE-VIEW API (legacy)
// =========================================

export function convert3D(formData) {
  return api.post("/convert-3d/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
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
