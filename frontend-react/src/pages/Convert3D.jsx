import { useState } from "react"
import UploadBox from "../components/UploadBox"
import Loader from "../components/Loader"

export default function Convert3D() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* LOADING OVERLAY */}
      {loading && <Loader text="AI đang tạo mô hình 3D..." />}

      {/* HEADER */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Hunyuan3D Generator
        </h1>
        <p className="mt-2 text-gray-600">
          Tải ảnh lên để AI tạo mô hình 3D chất lượng cao
        </p>
      </div>

      {/* MAIN CARD */}
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-lg">
        <UploadBox
          onStart={() => setLoading(true)}
          onResult={(res) => {
            setResult(res)
            setLoading(false)
          }}
          onError={() => setLoading(false)}
        />
      </div>

      {/* RESULT */}
      {result && (
        <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-blue-200 bg-blue-50 p-6">
          <h3 className="text-lg font-semibold text-blue-900">
             KẾT QUẢ TẠO MÔ HÌNH 3D
          </h3>

          <p className="mt-2 text-sm text-gray-700">
            <span className="font-medium">Job ID:</span>{" "}
            <span className="font-mono">{result.job_id}</span>
          </p>

          <a
            href={result.output_model_url}
            target="_blank"
            rel="noreferrer"
            className="
              mt-4 inline-flex items-center justify-center
              rounded-xl bg-indigo-600 px-5 py-2.5
              text-sm font-semibold text-white
              hover:bg-indigo-700
              transition
            "
          >
            ⬇️ Tải model 3D
          </a>
        </div>
      )}
    </div>
  )
}
