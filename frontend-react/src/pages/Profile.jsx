import { useEffect, useState } from "react"
import { getMe, updateProfile, changePassword } from "../services/api"  // ✅ Import functions

export default function Profile() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  // ===== PROFILE FORM =====
  const [form, setForm] = useState({
    name: "",
    email: "",
  })

  // ===== PASSWORD FORM =====
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    new: "",
    new_confirmation: "",
  })

  const [showPasswordForm, setShowPasswordForm] = useState(false)

  // ===== AVATAR =====
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)

  // ================= FETCH PROFILE =================
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await getMe()  // ✅ Dùng function
        setUser(res.data)
        setForm({
          name: res.data.name,
          email: res.data.email,
        })
      } catch (err) {
        console.error("❌ Profile error:", err.response?.data)
        setError("Không thể tải thông tin cá nhân")
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  // ===== HANDLERS =====
  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handlePasswordChange = e => {
    setPasswordForm({
      ...passwordForm,
      [e.target.name]: e.target.value,
    })
  }

  const handleAvatarChange = e => {
    const file = e.target.files[0]
    if (!file) return

    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  // ================= SAVE PROFILE + AVATAR =================
  const handleSaveProfile = async () => {
    try {
      setSaving(true)
      setError("")

      const formData = new FormData()
      formData.append("name", form.name)
      formData.append("email", form.email)

      if (avatarFile) {
        formData.append("avatar", avatarFile)
      }

      const res = await updateProfile(formData)  // ✅ Dùng function

      setUser(prev => ({
        ...prev,
        name: form.name,
        email: form.email,
        avatar: res.data.avatar_url || prev.avatar,
      }))

      setAvatarFile(null)
      setAvatarPreview(null)

      alert("Cập nhật thông tin thành công")
    } catch (err) {
      console.error("❌ Update error:", err.response?.data)
      setError("Không thể cập nhật hồ sơ")
    } finally {
      setSaving(false)
    }
  }

  // ================= CHANGE PASSWORD =================
  const handleChangePassword = async () => {
    try {
      setSaving(true)
      setError("")

      await changePassword(passwordForm)  // Dùng function

      alert("Đổi mật khẩu thành công")
      setPasswordForm({
        current: "",
        new: "",
        new_confirmation: "",
      })
      setShowPasswordForm(false)
    } catch (err) {
      console.error(" Password error:", err.response?.data)
      setError(err.response?.data?.detail || "Không thể đổi mật khẩu")
    } finally {
      setSaving(false)
    }
  }

  // ================= UI STATES =================
  if (loading) {
    return <div className="px-6 py-10 text-gray-500">Đang tải hồ sơ...</div>
  }

  if (error) {
    return <div className="px-6 py-10 text-red-600">{error}</div>
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <h1 className="text-3xl font-bold">👤 Hồ sơ cá nhân</h1>

      {/* ================= AVATAR ================= */}
      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-col items-center gap-3">
          <label className="relative cursor-pointer">
            <img
              src={
                avatarPreview ||
                user.avatar_url ||
                `https://ui-avatars.com/api/?name=${user.name}&background=0D8ABC&color=fff`
              }
              className="h-28 w-28 rounded-full border object-cover transition hover:opacity-80"
            />

            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white text-sm opacity-0 hover:opacity-100 transition">
              Đổi ảnh
            </div>

            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </label>

          {/* ROLE */}
          <span className="rounded-full bg-indigo-100 px-4 py-1 text-sm font-medium text-indigo-700">
            {user.role?.toUpperCase() || "USER"}
          </span>
        </div>
      </div>

      {/* ================= PROFILE INFO ================= */}
      <div className="rounded-2xl bg-white p-6 shadow space-y-4">
        <h2 className="text-lg font-semibold">Thông tin cá nhân</h2>

        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Tên hiển thị"
        />

        <input
          value={form.email}
          disabled
          className="w-full rounded-lg border bg-gray-100 px-3 py-2"
        />

        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-6 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Lưu thay đổi
        </button>
      </div>

      {/* ================= PASSWORD ================= */}
      <div className="rounded-2xl bg-white p-6 shadow space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bảo mật</h2>
          <button
            onClick={() => setShowPasswordForm(!showPasswordForm)}
            className="text-sm text-indigo-600 hover:underline"
          >
            {showPasswordForm ? "Ẩn" : "Đổi mật khẩu"}
          </button>
        </div>

        {showPasswordForm && (
          <>
            <input
              type="password"
              name="current"
              placeholder="Mật khẩu hiện tại"
              value={passwordForm.current}
              onChange={handlePasswordChange}
              className="w-full rounded-lg border px-3 py-2"
            />

            <input
              type="password"
              name="new"
              placeholder="Mật khẩu mới"
              value={passwordForm.new}
              onChange={handlePasswordChange}
              className="w-full rounded-lg border px-3 py-2"
            />

            <input
              type="password"
              name="new_confirmation"
              placeholder="Xác nhận mật khẩu mới"
              value={passwordForm.new_confirmation}
              onChange={handlePasswordChange}
              className="w-full rounded-lg border px-3 py-2"
            />

            <button
              onClick={handleChangePassword}
              disabled={saving}
              className="rounded-lg bg-red-600 px-6 py-2 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Đổi mật khẩu
            </button>
          </>
        )}
      </div>
    </div>
  )
}