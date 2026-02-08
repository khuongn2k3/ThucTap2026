import api from "./api"

export const convert3D = async (file, onProgress) => {
  const formData = new FormData()
  formData.append("image", file)

  const res = await api.post("/convert-3d", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress) {
        const percent = Math.round((e.loaded * 100) / e.total)
        onProgress(percent)
      }
    }
  })

  return res.data
}
