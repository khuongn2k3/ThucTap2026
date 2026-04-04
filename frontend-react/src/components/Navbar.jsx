import { NavLink, Link, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { getMe } from "../services/api"
import AuthModal from "./AuthModal"
import ProfileModal from "./ProfileModal"

const MENU_BY_ROLE = {
  admin: [
    { label: "Home", to: "/" },
    { label: "Convert", to: "/convert" },
    { label: "Assets", to: "/history" },
    { label: "Admin", to: "/admin" },
  ],
  user: [
    { label: "Home", to: "/" },
    { label: "Convert", to: "/convert" },
    { label: "Assets", to: "/history" },
  ],
}

export default function Navbar() {
  const navigate = useNavigate()
  const [user, setUser]         = useState(null)
  const [open, setOpen]           = useState(false)
  const [showAuth, setShowAuth]   = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const isLoggedIn = !!localStorage.getItem("token")

  useEffect(() => {
    if (!isLoggedIn) return
    getMe()
      .then(res => setUser(res.data))
      .catch(() => { localStorage.removeItem("token"); setUser(null) })
  }, [])

  useEffect(() => {
    const handler = () => setShowAuth(true)
    window.addEventListener("open-auth-modal", handler)
    return () => window.removeEventListener("open-auth-modal", handler)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("token")
    setUser(null)
    navigate("/")
  }

  const menus = MENU_BY_ROLE[user?.role] ?? MENU_BY_ROLE.user

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <nav style={{
        height: 56, background: "rgba(8,8,8,0.92)", backdropFilter: "blur(14px)",
        borderBottom: "1px solid #161616", display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 24px",
        position: "sticky", top: 0, zIndex: 100,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {/* LEFT */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: "#fff", letterSpacing: "-0.03em" }}>
              FORMA<span style={{ color: "#7c6ef5" }}>.</span>
            </span>
          </Link>
          <div style={{ display: "flex", gap: 4 }}>
            {menus.map(menu => (
              <NavLink key={menu.to} to={menu.to} end
                style={({ isActive }) => ({
                  fontSize: 13, fontWeight: 400,
                  color: isActive ? "#fff" : "#555",
                  textDecoration: "none", padding: "4px 10px",
                  borderRadius: 8, transition: "color 0.15s",
                })}
              >{menu.label}</NavLink>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isLoggedIn && user ? (
            <>
              {/* Credits */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 99, padding: "5px 12px" }}>
                <span style={{ fontSize: 13 }}>⚡</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{user.tokens ?? 0}</span>
              </div>

              {/* Upgrade */}
              <button style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "linear-gradient(135deg, #7c6ef5, #5650cc)",
                border: "none", borderRadius: 99, padding: "5px 14px",
                fontSize: 13, fontWeight: 500, color: "#fff", cursor: "default",
                fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                Upgrade
              </button>

              {/* Avatar dropdown */}
              <div style={{ position: "relative" }}>
              <button onClick={() => setOpen(o => !o)} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "none", border: "none", cursor: "pointer",
                padding: "4px 8px", borderRadius: 8,
              }}>
                {user.avatar_url
                  ? <img src={user.avatar_url} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} alt={user.name} />
                  : <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c6ef5,#34d399)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
                      {(user.name || "U").slice(0, 2).toUpperCase()}
                    </div>
                }
                <span style={{ fontSize: 13, color: "#aaa" }}>{user.name}</span>
                <span style={{ fontSize: 9, color: "#444" }}>▾</span>
              </button>

              {open && (
                <>
                  <style>{`
                    .nb-item:hover { background: #1a1a1a !important; color: #fff !important; }
                    .nb-logout:hover { background: rgba(248,113,113,0.08) !important; color: #fca5a5 !important; }
                  `}</style>
                  <div style={{
                    position: "absolute", right: 0, top: "calc(100% + 8px)",
                    width: 200, background: "#111", border: "1px solid #1e1e1e",
                    borderRadius: 12, overflow: "hidden",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.6)", zIndex: 200,
                    padding: "4px 0",
                  }}>
                    {/* Header */}
                    <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #1a1a1a", marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#ccc", fontFamily: "'DM Sans',sans-serif" }}>{user?.name}</div>
                      <div style={{ fontSize: 11, color: "#444", marginTop: 2, fontFamily: "'DM Sans',sans-serif" }}>{user?.email}</div>
                    </div>

                    {/* Personal Info */}
                    <button className="nb-item" onClick={() => { setOpen(false); setShowProfile(true) }} style={{
                      display: "flex", alignItems: "center", gap: 9, width: "100%",
                      padding: "9px 14px", fontSize: 13, color: "#bbb",
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                      </svg>
                      Personal Info
                    </button>

                    {/* Dashboard */}
                    <Link to="/dashboard" onClick={() => setOpen(false)} className="nb-item" style={{
                      display: "flex", alignItems: "center", gap: 9,
                      padding: "9px 14px", fontSize: 13, color: "#bbb",
                      textDecoration: "none", transition: "all 0.15s",
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                      </svg>
                      Dashboard
                    </Link>

                    <div style={{ height: 1, background: "#1a1a1a", margin: "4px 0" }} />

                    {/* Logout */}
                    <button className="nb-item nb-logout" onClick={handleLogout} style={{
                      display: "flex", alignItems: "center", gap: 9, width: "100%",
                      padding: "9px 14px", fontSize: 13, color: "#f87171",
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
            </>
          ) : (
            <>
              <button onClick={() => setShowAuth(true)} style={{
                fontSize: 13, color: "#666", border: "1px solid #1e1e1e",
                background: "none", padding: "6px 16px", borderRadius: 99,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}>Sign in</button>
              <button onClick={() => setShowAuth(true)} style={{
                fontSize: 13, color: "#fff",
                background: "linear-gradient(135deg, #7c6ef5, #5650cc)",
                border: "none", padding: "6px 16px", borderRadius: 99,
                cursor: "pointer", fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
              }}>Get started free</button>
            </>
          )}
        </div>
      </nav>

      {/* Auth Modal */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => { setShowAuth(false); window.location.reload() }}
        />
      )}

      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}
    </>
  )
}
