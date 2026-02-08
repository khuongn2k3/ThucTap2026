import { useState, useRef } from "react"
import { convert3D } from "../services/api"

export default function UploadBox({ onResult, onStart, onError }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setError(null)
  }

  const clearFile = () => {
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
      const res = await convert3D(file, setProgress)
      onResult && onResult(res)
    } catch (e) {
      setError(e.response?.data?.message || "Lỗi xử lý 3D")
      onError && onError()
    }

    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-lg font-semibold text-gray-900">
        Image to 3D
      </h3>

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
          handleFile(e.dataTransfer.files[0])
        }}
        className={`
          relative flex h-60 cursor-pointer flex-col items-center
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

        {/* CLEAR BUTTON */}
        {preview && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              clearFile()
            }}
            className="
              absolute right-2 top-2 z-10
              rounded-full bg-black/60 p-1.5
              text-xs text-white
              transition hover:bg-black
            "
          >
            ✕
          </button>
        )}

        {!preview ? (
          <>
            <div className="text-4xl">📷</div>
            <p className="mt-2 text-center text-sm font-medium text-gray-700">
              Kéo & thả ảnh vào đây
            </p>
            <p className="text-xs text-gray-500">
              hoặc click để chọn ảnh
            </p>
          </>
        ) : (
          <img
            src={preview}
            alt="preview"
            className="
              max-h-full max-w-full rounded-lg
              object-contain shadow-md
              animate-fadeIn
            "
          />
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
        {loading ? "Đang xử lý..." : "Generate 3D"}
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
          {error}
        </p>
      )}
    </div>
  )
}
