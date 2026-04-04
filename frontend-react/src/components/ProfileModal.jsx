import { useState, useEffect, useRef } from "react"
import { getMe, updateProfile, changePassword } from "../services/api"

export default function ProfileModal({ onClose }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState("")
  const [success, setSuccess] = useState("")
  const [tab, setTab]         = useState("info") // "info" | "password"

  const [form, setForm] = useState({ name: "", email: "" })
  const [pwForm, setPwForm] = useState({ current: "", new: "", new_confirmation: "" })
  const [avatarFile, setAvatarFile]     = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    getMe()
      .then(res => {
        setUser(res.data)
        setForm({ name: res.data.name, email: res.data.email })
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false))
  }, [])

  const handleAvatarChange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setAvatarFile(f)
    setAvatarPreview(URL.createObjectURL(f))
  }

  const handleSave = async () => {
    setSaving(true); setError(""); setSuccess("")
    try {
      const fd = new FormData()
      fd.append("name", form.name)
      fd.append("email", form.email)
      if (avatarFile) fd.append("avatar", avatarFile)
      const res = await updateProfile(fd)
      setUser(prev => ({ ...prev, name: form.name, email: form.email, avatar_url: res.data.avatar_url || prev.avatar_url }))
      setAvatarFile(null)
      setSuccess("Profile updated successfully!")
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setSaving(true); setError(""); setSuccess("")
    try {
      await changePassword(pwForm)
      setSuccess("Password changed successfully!")
      setPwForm({ current: "", new: "", new_confirmation: "" })
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to change password")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: "100%", padding: "10px 14px", border: "1px solid #e5e7eb",
    borderRadius: 10, fontSize: 13, outline: "none",
    fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box",
  }
  const inputDisabledStyle = { ...inputStyle, background: "#f5f5f5", color: "#aaa" }

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)" }}
      onClick={onClose}
    >
      <div
        style={{ display:"flex", width:860, maxWidth:"95vw", height:520, borderRadius:16, overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,0.6)", position:"relative" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── LEFT: Avatar + info ── */}
        <div style={{ flex:1, background:"linear-gradient(135deg,#1a0e3a 0%,#0e1a3a 50%,#0a2a1a 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:"20%", left:"50%", transform:"translateX(-50%)", width:300, height:300, background:"radial-gradient(ellipse,rgba(124,110,245,0.2) 0%,transparent 70%)", pointerEvents:"none" }} />

          {/* Avatar */}
          <div style={{ position:"relative", marginBottom:16, cursor:"pointer" }} onClick={() => fileRef.current?.click()}>
            <img
              src={avatarPreview || user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name||"U")}&background=7c6ef5&color=fff&size=128`}
              style={{ width:96, height:96, borderRadius:"50%", objectFit:"cover", border:"3px solid rgba(124,110,245,0.5)" }}
            />
            <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", opacity:0, transition:"opacity 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.opacity=1}
              onMouseLeave={e => e.currentTarget.style.opacity=0}
            >
              <span style={{ fontSize:11, color:"#fff", fontFamily:"'DM Sans',sans-serif" }}>Change photo</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
          </div>

          <div style={{ fontSize:18, fontWeight:700, color:"#fff", fontFamily:"'DM Sans',sans-serif", marginBottom:6 }}>
            {user?.name || "—"}
          </div>
          <div style={{ fontSize:12, color:"#888", fontFamily:"'DM Sans',sans-serif", marginBottom:12 }}>
            {user?.email || "—"}
          </div>

          {/* Role badge */}
          <div style={{ background:"rgba(124,110,245,0.2)", border:"1px solid rgba(124,110,245,0.4)", borderRadius:99, padding:"4px 14px", fontSize:11, color:"#a89ff5", fontFamily:"'DM Sans',sans-serif", marginBottom:20 }}>
            {user?.role?.toUpperCase() || "USER"}
          </div>

          {/* Credits */}
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:99, padding:"8px 18px" }}>
            <span style={{ fontSize:16 }}>⚡</span>
            <span style={{ fontSize:14, fontWeight:600, color:"#fff", fontFamily:"'DM Sans',sans-serif" }}>{user?.tokens ?? 0}</span>
            <span style={{ fontSize:12, color:"#666", fontFamily:"'DM Sans',sans-serif" }}>credits</span>
          </div>
        </div>

        {/* ── RIGHT: Form ── */}
        <div style={{ width:340, background:"#fff", display:"flex", flexDirection:"column", justifyContent:"center", padding:"36px 32px", fontFamily:"'DM Sans',sans-serif" }}>

          {/* Tab toggle */}
          <div style={{ display:"flex", background:"#f3f3f3", borderRadius:99, padding:3, marginBottom:20, gap:2 }}>
            {[["info","Info"],["password","Password"]].map(([t,label]) => (
              <button key={t} onClick={() => { setTab(t); setError(""); setSuccess("") }}
                style={{ flex:1, padding:"7px 0", fontSize:12, fontWeight:500, border:"none", borderRadius:99, cursor:"pointer", background:tab===t?"#fff":"none", color:tab===t?"#111":"#888", boxShadow:tab===t?"0 1px 4px rgba(0,0,0,0.1)":"none", transition:"all 0.15s", fontFamily:"'DM Sans',sans-serif" }}
              >{label}</button>
            ))}
          </div>

          {/* Feedback */}
          {error && (
            <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#dc2626", marginBottom:14 }}>{error}</div>
          )}
          {success && (
            <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#16a34a", marginBottom:14 }}>{success}</div>
          )}

          {loading ? (
            <div style={{ textAlign:"center", color:"#aaa", fontSize:13 }}>Loading...</div>
          ) : tab === "info" ? (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:12, color:"#888", marginBottom:2 }}>Display name</div>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Display name"
                style={inputStyle}
              />
              <div style={{ fontSize:12, color:"#888", marginTop:4, marginBottom:2 }}>Email</div>
              <input value={form.email} disabled style={inputDisabledStyle} />
              <button onClick={handleSave} disabled={saving}
                style={{ marginTop:8, padding:"11px 0", borderRadius:99, background:"linear-gradient(135deg,#7c6ef5,#5650cc)", color:"#fff", fontSize:14, fontWeight:600, border:"none", cursor:saving?"not-allowed":"pointer", opacity:saving?0.7:1, fontFamily:"'DM Sans',sans-serif" }}
              >{saving ? "Saving..." : "Save changes"}</button>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[["current","Current password"],["new","New password"],["new_confirmation","Confirm new password"]].map(([k,ph]) => (
                <input key={k} type="password" placeholder={ph} value={pwForm[k]}
                  onChange={e => setPwForm({ ...pwForm, [k]: e.target.value })}
                  style={inputStyle}
                />
              ))}
              <button onClick={handleChangePassword} disabled={saving}
                style={{ marginTop:8, padding:"11px 0", borderRadius:99, background:"linear-gradient(135deg,#f87171,#dc2626)", color:"#fff", fontSize:14, fontWeight:600, border:"none", cursor:saving?"not-allowed":"pointer", opacity:saving?0.7:1, fontFamily:"'DM Sans',sans-serif" }}
              >{saving ? "Processing..." : "Change password"}</button>
            </div>
          )}
        </div>

        {/* Close */}
        <button onClick={onClose}
          style={{ position:"absolute", top:14, right:14, background:"rgba(0,0,0,0.3)", border:"none", color:"#fff", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}
        >✕</button>
      </div>
    </div>
  )
}
