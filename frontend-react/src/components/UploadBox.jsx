import { useState, useRef } from "react"
import { convert3D, getJobStatus } from "../services/api"

export default function UploadBox({ onResult, onStart, onError }) {
  const [file, setFile] = useState(null)  // ← SINGLE FILE
  const [preview, setPreview] = useState(null)  // ← SINGLE PREVIEW
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef()

  const handleFile = (selectedFile) => {
    if (!selectedFile) return

    // Validate file type
    if (!selectedFile.type.startsWith('image/')) {
      setError("Vui lòng chọn file ảnh hợp lệ")
      return
    }

    setFile(selectedFile)
    setPreview(URL.createObjectURL(selectedFile))
    setError(null)
  }

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setProgress(0)
    setError(null)
  }

  const handleUpload = async () => {
    if (!file) {
      setError("Vui lòng chọn ảnh")
      return
    }

    setLoading(true)
    setProgress(0)
    setError(null)
    onStart && onStart()

    try {
      // ✅ TẠO FORMDATA VỚI 1 FILE DUY NHẤT
      const formData = new FormData()
      formData.append("file", file)  // ← Backend expects "file" (singular)
      
      //  GỌI API
      const res = await convert3D(formData)
      const jobId = res.data.job_id
      
      // Poll mỗi 3 giây
      const poll = setInterval(async () => {
        try {
          const status = await getJobStatus(jobId)
          if (status.data.status === "completed") {
            clearInterval(poll)
            setLoading(false)   // ← tắt ở đây
            onResult && onResult(status.data)
          } else if (status.data.status === "failed") {
            clearInterval(poll)
            setLoading(false)   // ← và ở đây
            onError && onError()
          }
        } catch (e) {
          clearInterval(poll)
          setLoading(false)
          onError && onError()
        }
      }, 3000)
      
    } catch (e) {
      console.error("❌ Convert3D error:", e.response?.data)
      setError(e.response?.data?.detail || e.response?.data?.message || "Lỗi xử lý 3D")
      onError && onError()
    } 
  }

  return (
    <div className="flex flex-col gap-5">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Image to 3D
        </h3>
        {file && (
          <button
            onClick={clearFile}
            className="text-sm text-red-500 hover:text-red-600"
          >
            Xóa ảnh
          </button>
        )}
      </div>

      {/* DROPZONE */}
      <div
        onClick={() => fileRef.current.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const droppedFile = e.dataTransfer.files[0]
          handleFile(droppedFile)
        }}
        className={`
          relative flex min-h-[240px] cursor-pointer flex-col items-center
          justify-center rounded-xl border-2 border-dashed
          transition-all duration-200
          ${
            dragging
              ? "border-blue-500 bg-blue-50"
              : preview
              ? "border-emerald-400 bg-emerald-50/30"
              : "border-gray-300 bg-gray-50 hover:bg-gray-100"
          }
        `}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {!preview ? (
          <div className="text-center">
            <div className="text-4xl">📷</div>
            <p className="mt-2 text-sm font-medium text-gray-700">
              Kéo & thả ảnh vào đây
            </p>
            <p className="text-xs text-gray-500">
              hoặc click để chọn ảnh
            </p>
          </div>
        ) : (
          <div className="relative w-full max-w-sm p-4">
            <img
              src={preview}
              alt="preview"
              className="w-full rounded-lg border bg-white shadow-sm"
            />
            <div className="mt-2 text-center text-sm text-gray-600">
              {file?.name}
            </div>
          </div>
        )}
      </div>

      {/* BUTTON */}
      <button
        onClick={handleUpload}
        disabled={loading || !file}
        className="
          rounded-xl bg-gradient-to-r
          from-blue-600 to-indigo-600
          py-3 font-semibold text-white
          transition hover:opacity-90
          disabled:cursor-not-allowed disabled:opacity-50
        "
      >
        {loading ? "Đang xử lý..." : "Generate 3D Model"}
      </button>

      {/* PROGRESS */}
      {loading && (
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className="
                h-full rounded-full bg-emerald-500
                transition-all duration-300
              "
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-600">
            {progress}%
          </span>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500">
          ❌ {error}
        </p>
      )}
    </div>
  )
}