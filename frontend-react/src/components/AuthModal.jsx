import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { login, register } from "../services/api"

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode]         = useState("login") // "login" | "register"
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [name, setName]         = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const navigate = useNavigate()

  const reset = () => { setError(""); setEmail(""); setPassword(""); setName(""); setConfirmPw("") }
  const switchMode = (m) => { setMode(m); reset() }

  const handleGoogleLogin = () => {
    window.location.href = import.meta.env.VITE_API_URL + "/auth/google/redirect"
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")

    if (mode === "register" && password !== confirmPw) {
      return setError("Passwords do not match")
    }

    setLoading(true)
    try {
      let res
      if (mode === "login") {
        res = await login({ email, password })
      } else {
        res = await register({ name, email, password })
      }

      if (!res.data?.access_token) throw new Error("No token received")
      localStorage.setItem("token", res.data.access_token)
      onSuccess?.()
      onClose()
      navigate("/dashboard")
    } catch (err) {
      setError(err.response?.data?.detail || (mode === "login" ? "Invalid email or password" : "Registration failed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)" }}
      onClick={onClose}
    >
      <div
        style={{ display:"flex", width:"860px", maxWidth:"95vw", height:"520px", borderRadius:16, overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,0.6)", position:"relative" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── LEFT: background image ── */}
        <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", inset:0, backgroundImage:"url(/bg_auth.jpg)", backgroundSize:"cover", backgroundPosition:"center", zIndex:0 }} />
          {/* Dark overlay */}
          <div style={{ position:"absolute", inset:0, background:"rgba(8,8,8,0.65)", zIndex:1 }} />
          {/* Glow */}
          <div style={{ position:"absolute", top:"30%", left:"50%", transform:"translateX(-50%)", width:300, height:300, background:"radial-gradient(ellipse,rgba(124,110,245,0.25) 0%,transparent 70%)", zIndex:2, pointerEvents:"none" }} />

          {/* Content */}
          <div style={{ position:"relative", zIndex:3, height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40 }}>
            <h2 style={{ fontSize:28, fontWeight:700, color:"#fff", lineHeight:1.2, textAlign:"center", marginBottom:16, fontFamily:"'DM Sans',sans-serif" }}>
              Your AI 3D<br />Workspace
            </h2>
            <div style={{ display:"flex", flexDirection:"column", gap:10, width:"100%" }}>
              {["High-Quality 3D Model Generator","AI Texturing","Smart Retopology"].map(f => (
                <div key={f} style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:99, padding:"8px 14px" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:"#7c6ef5", flexShrink:0, display:"inline-block" }} />
                  <span style={{ fontSize:12, color:"#aaa", fontFamily:"'DM Sans',sans-serif" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: form ── */}
        <div style={{ width:340, background:"#fff", display:"flex", flexDirection:"column", justifyContent:"center", padding:"36px 32px", fontFamily:"'DM Sans',sans-serif" }}>

          {/* Header */}
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <div style={{ fontSize:20, fontWeight:700, color:"#111", marginBottom:4 }}>
              {mode === "login" ? "Welcome back" : "Create account"}
            </div>
            <div style={{ fontSize:13, color:"#888" }}>
              {mode === "login" ? "Enter your email to continue" : "Start using Hunyuan3D"}
            </div>
          </div>

          {/* Login / Register toggle */}
          <div style={{ display:"flex", background:"#f3f3f3", borderRadius:99, padding:3, marginBottom:20, gap:2 }}>
            {[["login","Sign in"],["register","Sign up"]].map(([m,label]) => (
              <button key={m} onClick={() => switchMode(m)}
                style={{ flex:1, padding:"7px 0", fontSize:12, fontWeight:500, border:"none", borderRadius:99, cursor:"pointer", background:mode===m?"#fff":"none", color:mode===m?"#111":"#888", boxShadow:mode===m?"0 1px 4px rgba(0,0,0,0.1)":"none", transition:"all 0.15s", fontFamily:"'DM Sans',sans-serif" }}
              >{label}</button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#dc2626", marginBottom:14 }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {mode === "register" && (
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" required
                style={{ padding:"10px 14px", border:"1px solid #e5e7eb", borderRadius:10, fontSize:13, outline:"none", fontFamily:"'DM Sans',sans-serif" }}
              />
            )}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required
              style={{ padding:"10px 14px", border:"1px solid #e5e7eb", borderRadius:10, fontSize:13, outline:"none", fontFamily:"'DM Sans',sans-serif" }}
            />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required
              style={{ padding:"10px 14px", border:"1px solid #e5e7eb", borderRadius:10, fontSize:13, outline:"none", fontFamily:"'DM Sans',sans-serif" }}
            />
            {mode === "register" && (
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm password" required
                style={{ padding:"10px 14px", border:"1px solid #e5e7eb", borderRadius:10, fontSize:13, outline:"none", fontFamily:"'DM Sans',sans-serif" }}
              />
            )}

            <button type="submit" disabled={loading}
              style={{ padding:"11px 0", borderRadius:99, background:"linear-gradient(135deg,#f5c842,#e8a800)", color:"#111", fontSize:14, fontWeight:700, border:"none", cursor:loading?"not-allowed":"pointer", opacity:loading?0.7:1, fontFamily:"'DM Sans',sans-serif", marginTop:4 }}
            >
              {loading ? "Processing..." : mode === "login" ? "Sign in" : "Sign up"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display:"flex", alignItems:"center", gap:10, margin:"14px 0" }}>
            <div style={{ flex:1, height:1, background:"#e5e7eb" }} />
            <span style={{ fontSize:11, color:"#aaa" }}>Hoặc</span>
            <div style={{ flex:1, height:1, background:"#e5e7eb" }} />
          </div>

          {/* Google */}
          <button onClick={handleGoogleLogin}
            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"10px 0", border:"1px solid #e5e7eb", borderRadius:10, background:"#fff", color:"#333", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style={{ width:18, height:18 }} />
            Sign in with Google
          </button>
        </div>

        {/* Close btn */}
        <button onClick={onClose}
          style={{ position:"absolute", top:14, right:14, background:"rgba(0,0,0,0.3)", border:"none", color:"#fff", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}
        >✕</button>
      </div>
    </div>
  )
}
