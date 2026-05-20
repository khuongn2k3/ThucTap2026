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
  const sseUrl = `${baseURL}/job-progress-sse/${jobId}`
  const pollUrl = `${baseURL}/job-status-mv/${jobId}`

  let closed = false
  let retryCount = 0
  const MAX_RETRIES = 5
  let es = null
  let pollTimer = null

  function startPolling() {
    if (closed) return
    pollTimer = setInterval(async () => {
      try {
        const token = localStorage.getItem("token")
        // Fix: dùng thẳng pollUrl đã build sẵn, không build lại
        const res = await fetch(pollUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const data = await res.json()
        if (data.status === "completed") {
          clearInterval(pollTimer)
          closed = true
          if (onCompleted) onCompleted(data)
        } else if (data.status === "failed") {
          clearInterval(pollTimer)
          closed = true
          if (onFailed) onFailed(data)
        } else {
          if (onProgress) onProgress({ message: data.message || "Processing..." })
        }
      } catch (e) {
        console.warn("[SSE fallback poll error]", e)
      }
    }, 3000)
  }

  function connect() {
    if (closed) return
    es = new EventSource(sseUrl)

    if (onProgress) es.addEventListener("progress", (e) => {
      try { onProgress(JSON.parse(e.data)) } catch { }
    })
    if (onCompleted) es.addEventListener("completed", (e) => {
      closed = true
      es.close() // đóng ngay để tránh onerror fire sau khi server đóng connection
      // Parse JSON tách riêng: nếu parse thất bại (e.g. data rỗng) vẫn gọi callback với {}
      // để UI có thể transition sang DONE thay vì bị treo mãi ở S2_POLLING
      let parsed = {}
      try { parsed = JSON.parse(e.data) } catch (parseErr) {
        console.warn("[SSE] completed — could not parse event data, falling back to {}", e.data, parseErr)
      }
      try { onCompleted(parsed) } catch (cbErr) {
        console.error("[SSE] onCompleted callback threw:", cbErr)
      }
    })
    if (onFailed) es.addEventListener("failed", (e) => {
      closed = true
      es.close() // đóng ngay để tránh onerror fire sau khi server đóng connection
      let parsed = {}
      try { parsed = JSON.parse(e.data) } catch (parseErr) {
        console.warn("[SSE] failed — could not parse event data", e.data, parseErr)
      }
      try { onFailed(parsed) } catch (cbErr) {
        console.error("[SSE] onFailed callback threw:", cbErr)
      }
    })
    if (onHeartbeat) es.addEventListener("heartbeat", (e) => {
      try { onHeartbeat(JSON.parse(e.data)) } catch { }
    })

    es.onerror = () => {
      es.close()
      if (closed) return
      // Không retry SSE — Cloudflare tunnel không ổn định với SSE reconnect
      // Chuyển thẳng sang polling
      console.warn("[SSE] Connection dropped, switching to polling...")
      startPolling()
    }
  }

  connect()

  return {
    close: () => {
      closed = true
      if (es) es.close()
      if (pollTimer) clearInterval(pollTimer)
    }
  }
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

// =========================================
// ADMIN — API KEYS
// =========================================

/**
 * Lấy danh sách tất cả API keys (admin only)
 */
export function getApiKeys() {
  return api.get("/admin/api-keys")
}

/**
 * Tạo API key mới
 * @param {object} data - { name, owner_email?, quota_per_month?, expires_at?, note? }
 * @returns key đầy đủ (key_value chỉ trả về 1 lần duy nhất)
 */
export function createApiKey(data) {
  return api.post("/admin/api-keys", data)
}

/**
 * Thu hồi key (status → revoked, key ngừng hoạt động ngay)
 * @param {number} keyId
 */
export function revokeApiKey(keyId) {
  return api.patch(`/admin/api-keys/${keyId}/revoke`)
}

/**
 * Xóa vĩnh viễn key
 * @param {number} keyId
 */
export function deleteApiKey(keyId) {
  return api.delete(`/admin/api-keys/${keyId}`)
}

/**
 * Cập nhật quota / thông tin key
 * @param {number} keyId
 * @param {object} data - { quota_per_month?, note?, expires_at? }
 */
export function updateApiKey(keyId, data) {
  return api.patch(`/admin/api-keys/${keyId}`, data)
}

// =========================================
// ADMIN — USERS
// =========================================

export function getAdminUsers() {
  return api.get("/admin/users")
}

export function setUserRole(userId, role) {
  return api.patch(`/admin/users/${userId}/role`, { role })
}

export function setUserBan(userId, banned) {
  return api.patch(`/admin/users/${userId}/ban`, { banned })
}

export function adjustUserTokens(userId, delta) {
  return api.patch(`/admin/users/${userId}/tokens`, { delta })
}

// =========================================
// ADMIN — JOBS
// =========================================

export function getAdminJobs({ limit = 20, offset = 0, status } = {}) {
  const params = new URLSearchParams({ limit, offset })
  if (status && status !== "all") params.append("status", status)
  return api.get(`/admin/jobs?${params}`)
}
