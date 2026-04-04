import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import api from "../services/api"
import ModelViewer3D from "../components/ModelViewer3D"

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const CATEGORIES = ["Featured","Character","Vehicle","Animal","Architecture","Furniture","Props","Weapon","Clothing","Food","Nature","Abstract","Machine"]
const ALL_CATS   = ["Character","Vehicle","Animal","Architecture","Furniture","Props","Weapon","Clothing","Food","Nature","Abstract","Machine"]

const CAT_ICON = {
  "All": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
    </svg>
  ),
  "Featured": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
    </svg>
  ),
  "Character": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>
    </svg>
  ),
  "Vehicle": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h11l4 4 1 3H5z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
    </svg>
  ),
  "Animal": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5"/><path d="M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.344-2.5"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75z"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444c0-1.061-.162-2.2-.493-3.309m-9.243-6.082A8.801 8.801 0 0 1 12 5c.78 0 1.5.108 2.161.306"/>
    </svg>
  ),
  "Architecture": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M9 21V7l3-4 3 4v14"/><path d="M9 21H3V10l6-7"/><path d="M15 21h6V10l-6-7"/><line x1="12" y1="12" x2="12" y2="12"/>
    </svg>
  ),
  "Furniture": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z"/><line x1="6" y1="18" x2="6" y2="22"/><line x1="18" y1="18" x2="18" y2="22"/>
    </svg>
  ),
  "Props": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  ),
  "Weapon": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/>
    </svg>
  ),
  "Clothing": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>
    </svg>
  ),
  "Food": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  ),
  "Nature": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 8C8 10 5.9 16.17 3.82 19.5c-.7 1.13-.15 2.5 1.18 2.5.87 0 1.52-.53 2-1.5 1.35-2.79 3.91-5.73 10-6.5"/><path d="M21 5c-1.5 1-3.5 2-7 2-3.5 0-6-2-7-3 0 4 3 7 7 7s7-3 7-7z"/>
    </svg>
  ),
  "Abstract": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5"/>
    </svg>
  ),
  "Machine": (c) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07"/>
    </svg>
  ),
}

/* ─────────────────────────────────────────────
   MAIN
───────────────────────────────────────────── */
export default function Gallery() {
  const [activeType, setActiveType]         = useState("All")
  const [activeCategory, setActiveCategory] = useState("Featured")
  const [activeSort, setActiveSort]         = useState("Recommended")
  const [showFilter, setShowFilter]         = useState(false)
  const [models, setModels]                 = useState([])
  const [loading, setLoading]               = useState(false)
  const [selectedModel, setSelectedModel]   = useState(null)
  const [showFeature, setShowFeature]       = useState(false)
  const isLoggedIn = useMemo(() => !!localStorage.getItem("token"), [])
  const { slug } = useParams()
  const navigate = useNavigate()

  const handleSelect = useCallback((m) => {
    setSelectedModel(m)
    const s = `${m.model_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${m.uuid}`
    navigate(`/3d-model/${s}`, { replace: true })
  }, [navigate])

  useEffect(() => {
    setLoading(true)
    api.get("/gallery", { params: {
      category: activeCategory === "Featured" ? undefined : activeCategory.toLowerCase(),
      sort: activeSort === "Recommended" ? undefined : activeSort.toLowerCase().replace(" ","_"),
    }})
      .then(res => {
        const list = res.data?.models ?? []
        setModels(list)
        // Nếu vào từ link /3d-model/ten-model-uuid → tự mở modal
        if (slug && !selectedModel) {
          const uuid = slug.slice(-36)
          const found = list.find(m => m.uuid === uuid)
          if (found) setSelectedModel(found)
        }
      })
      .catch(() => setModels([]))
      .finally(() => setLoading(false))
  }, [activeCategory, activeSort])

  return (
    <>
    <div style={{ position:"relative", minHeight:"100vh", color:"#e0e0e0", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* ══ VIDEO BACKGROUND ══ */}
      <video
        autoPlay
        loop
        muted
        playsInline
        style={{ position:"fixed", inset:0, width:"100%", height:"100%", objectFit:"cover", zIndex:0, pointerEvents:"none" }}
      >
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>
      {/* Overlay tối để content dễ đọc */}
      <div style={{ position:"fixed", inset:0, background:"rgba(8,8,8,0.75)", zIndex:1, pointerEvents:"none" }} />

      {/* Tất cả content nằm trên video */}
      <div style={{ position:"relative", zIndex:2 }}>

      {/* ══ HERO ══ */}
      <section style={{ position:"relative", padding:"80px 24px 64px", overflow:"hidden", textAlign:"center" }}>
        <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
          <div style={{ position:"absolute", top:-140, left:"50%", transform:"translateX(-50%)", width:720, height:420, background:"radial-gradient(ellipse, rgba(108,92,231,0.16) 0%, transparent 70%)" }} />
        </div>
        <div style={{ maxWidth:680, margin:"0 auto", position:"relative" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(108,92,231,0.12)", border:"1px solid rgba(108,92,231,0.3)", borderRadius:99, padding:"5px 16px", marginBottom:28 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#7c6ef5", display:"inline-block" }} />
            <span style={{ fontSize:11, color:"#a08ef5", letterSpacing:"0.07em", fontWeight:500 }}>FORMA · AI 3D GENERATOR</span>
          </div>
          <h1 style={{ fontSize:"clamp(32px,5.5vw,56px)", fontWeight:600, lineHeight:1.08, letterSpacing:"-0.025em", color:"#fff", marginBottom:18 }}>
            Generate{" "}
            <span style={{ background:"linear-gradient(120deg,#a78bfa 10%,#60a5fa 90%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>Anything</span>
            {" "}in 3D
          </h1>
          <p style={{ fontSize:15, color:"#4a4a4a", marginBottom:44, lineHeight:1.7 }}>Your All-in-One AI 3D Workspace</p>

          <div style={{ margin:"0 auto 20px" }}>
            <Link to="/convert" style={{ display:"inline-block", background:"linear-gradient(135deg,#7c6ef5 0%,#5650cc 100%)", color:"#fff", padding:"12px 32px", borderRadius:99, fontSize:14, fontWeight:500, textDecoration:"none", whiteSpace:"nowrap" }}>Generate Model</Link>
          </div>

          <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:8 }}>
            {["✓ Image to 3D","✓ One-Click Texturing","✓ Free Credits Monthly"].map(f => (
              <span key={f} style={{ fontSize:12, color:"#3a3a3a", background:"#0c0c0c", border:"1px solid #1a1a1a", borderRadius:99, padding:"4px 14px" }}>{f}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ══ GALLERY ══ */}
      <section style={{ padding:"0 20px 80px" }}>
        <div style={{ maxWidth:1400, margin:"0 auto", position:"relative" }}>

        {/* Filters */}
        <style>{`
          .tags-scroll::-webkit-scrollbar { height: 5px; }
          .tags-scroll::-webkit-scrollbar-track { background: transparent; }
          .tags-scroll::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 99px; }
          .tags-scroll::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }
          .panel-scroll::-webkit-scrollbar { display: none; }
          .panel-scroll { -ms-overflow-style: none; scrollbar-width: none; }
          @keyframes cardShimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28, gap:10 }}>

          {/* Left: Filter button (fixed) + scrollable tags */}
          <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0, flex:1 }}>

            {/* Filter button — không cuộn */}
            <button onClick={() => setShowFilter(p => !p)} style={{ flexShrink:0, display:"flex", alignItems:"center", gap:6, fontSize:12, color:showFilter?"#a89ff5":"#888", background:showFilter?"rgba(124,110,245,0.12)":"#0f0f0f", border:`1px solid ${showFilter?"rgba(124,110,245,0.4)":"#1e1e1e"}`, borderRadius:99, padding:"6px 14px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s", whiteSpace:"nowrap" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              Filter ▾
            </button>

            <div style={{ flexShrink:0, width:1, height:18, background:"#1e1e1e" }} />

            {/* All — cố định, không cuộn */}
            <FilterTag label="All"
              active={activeCategory === "Featured"}
              onClick={() => setActiveCategory("Featured")} />

            <div style={{ flexShrink:0, width:1, height:18, background:"#1e1e1e" }} />

            {/* Categories — chỉ vùng này cuộn */}
            <div className="tags-scroll" style={{ display:"flex", alignItems:"center", gap:6, overflowX:"auto", minWidth:0 }}>
              {CATEGORIES.filter(c => c !== "Featured").map(c => (
                <FilterTag key={c} label={c}
                  active={activeCategory === c}
                  onClick={() => setActiveCategory(c)} />
              ))}
            </div>
          </div>

          {/* Feature My Model — right, không cuộn */}
          <button onClick={() => isLoggedIn ? setShowFeature(true) : window.dispatchEvent(new CustomEvent("open-auth-modal"))}
            style={{ flexShrink:0, fontSize:12, color:"#7c6ef5", border:"1px solid rgba(124,110,245,0.3)", borderRadius:99, padding:"6px 16px", background:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap" }}
          >+ Feature My Model</button>
        </div>

        {/* Filter panel — Sort (overlay, không đẩy content) */}
        {showFilter && (
          <div style={{ position:"absolute", top:52, left:0, zIndex:50 }}>
            <div style={{ background:"#111", border:"1px solid #1e1e1e", borderRadius:14, padding:20, width:280, boxShadow:"0 16px 40px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:500, color:"#fff" }}>Sort by</span>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <button onClick={() => setActiveSort("Recommended")}
                    style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>↺ Reset</button>
                  <button onClick={() => setShowFilter(false)}
                    style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:14 }}>✕</button>
                </div>
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {["Recommended","Most Likes","Newest"].map(s => (
                  <FilterTag key={s} label={s} active={activeSort===s} onClick={() => { setActiveSort(s); setShowFilter(false) }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {loading ? <SkeletonGrid /> : models.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"#333" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🗂</div>
            <div style={{ fontSize:14 }}>Chưa có model nào</div>
          </div>
        ) : <MasonryGrid models={models} onSelect={handleSelect} />}
        </div>
      </section>

      </div>{/* end zIndex:2 content wrapper */}
    </div>

      {/* ══ MODEL DETAIL MODAL ══ — ngoài stacking context zIndex:2 để đè được navbar */}
      {selectedModel && (
        <ModelModal model={selectedModel} onClose={() => {
          setSelectedModel(null)
          navigate("/", { replace: true })
        }} onSelect={handleSelect} />
      )}

      {/* ══ FEATURE MY MODEL POPUP ══ */}
      {showFeature && (
        <FeatureModal onClose={() => setShowFeature(false)} />
      )}
    </>
  )
}

/* ─────────────────────────────────────────────
   FILTER TAG
───────────────────────────────────────────── */
function FilterTag({ label, active, onClick }) {
  const [hov, setHov] = useState(false)
  const iconFn = CAT_ICON[label]
  const iconColor = active ? "#fff" : hov ? "#ccc" : "#555"
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontSize:12, color:active?"#fff":hov?"#ccc":"#555", background:active?"#7c6ef5":hov?"#161616":"#0f0f0f", border:`1px solid ${active?"#7c6ef5":"#1e1e1e"}`, borderRadius:99, padding:"5px 14px", cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.15s", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:5 }}
    >
      {iconFn && iconFn(iconColor)}
      {label}
    </button>
  )
}

/* ─────────────────────────────────────────────
   MASONRY GRID
───────────────────────────────────────────── */
const MasonryGrid = memo(function MasonryGrid({ models, onSelect }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
      {models.map(m => <ModelCard key={m.id} model={m} onSelect={onSelect} />)}
    </div>
  )
})

/* ─────────────────────────────────────────────
   MODEL CARD
   Gallery dùng ảnh thumbnail (như Tripo3D) — 3D chỉ load trong modal
   Smooth, không lag, chuyên nghiệp
───────────────────────────────────────────── */
const ModelCard = memo(function ModelCard({ model, onSelect }) {
  const [hov, setHov]     = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [liked, setLiked] = useState(model.user_liked ?? false)
  const [count, setCount] = useState(model.likes ?? 0)
  const isLoggedIn = useMemo(() => !!localStorage.getItem("token"), [])
  const pendingRef = useRef(false)
  const cardRef    = useRef(null)

  const toggleLike = useCallback(async (e) => {
    e.stopPropagation()
    if (pendingRef.current) return
    if (!isLoggedIn) { window.dispatchEvent(new CustomEvent("open-auth-modal")); return }
    pendingRef.current = true
    const next = !liked
    setLiked(next)
    setCount(c => next ? c + 1 : Math.max(0, c - 1))
    try {
      if (next) await api.post(`/gallery/${model.id}/like`)
      else      await api.delete(`/gallery/${model.id}/like`)
    } catch {
      setLiked(!next)
      setCount(c => next ? Math.max(0, c - 1) : c + 1)
    } finally {
      pendingRef.current = false
    }
  }, [isLoggedIn, liked, model.id])

  const avatarInitials = useMemo(() =>
    (model.avatar || model.user || "A").slice(0, 2).toUpperCase()
  , [model.avatar, model.user])

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onSelect(model)}
      style={{
        borderRadius: 14,
        overflow: "hidden",
        background: "#1a1a1a",
        border: `1px solid ${hov ? "#333" : "#222"}`,
        cursor: "pointer",
        transition: "border-color 0.18s, box-shadow 0.18s, transform 0.18s",
        transform: hov ? "translateY(-4px) scale(1.01)" : "translateY(0) scale(1)",
        boxShadow: hov ? "0 12px 40px rgba(0,0,0,0.6)" : "0 2px 8px rgba(0,0,0,0.4)",
        willChange: "transform",
      }}
    >
      {/* ── Thumbnail area ── */}
      <div style={{
        position: "relative",
        aspectRatio: "1",
        background: "radial-gradient(ellipse at 50% 40%, #3a3a3a 0%, #1a1a1a 60%, #0d0d0d 100%)",
        overflow: "hidden",
      }}>
        {!imgLoaded && (
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(110deg, #1a1a1a 30%, #252525 50%, #1a1a1a 70%)",
            backgroundSize: "200% 100%",
            animation: "cardShimmer 1.4s ease infinite",
          }} />
        )}

        {/* Ảnh thumbnail — lazy load, không dùng WebGL */}
        {/* Thumbnail render từ 3D — dùng cho gallery card */}
        {model.thumbnail_url ? (
          <img
            src={model.thumbnail_url}
            alt={model.model_name}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            style={{
              width: "100%", height: "100%",
              objectFit: "cover", display: "block",
              opacity: imgLoaded ? 1 : 0,
              transition: "opacity 0.3s",
            }}
          />
        ) : model.image_url ? (
          // Fallback: ảnh user upload nếu chưa có thumbnail render
          <img
            src={model.image_url}
            alt={model.model_name}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            style={{
              width: "100%", height: "100%",
              objectFit: "cover", display: "block",
              opacity: imgLoaded ? 1 : 0,
              transition: "opacity 0.3s",
            }}
          />
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", fontSize:48, opacity:0.3 }}>🗂</div>
        )}

        {/* Hover overlay gradient */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)",
          opacity: hov ? 1 : 0,
          transition: "opacity 0.2s",
          pointerEvents: "none",
        }} />

        {/* Model name hiện khi hover — giống Tripo */}
        {hov && model.model_name && (
          <div style={{
            position: "absolute", bottom: 8, left: 10, right: 44,
            fontSize: 11, color: "#eee", fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          }}>
            {model.model_name}
          </div>
        )}

        {/* Like button */}
        <button
          onClick={toggleLike}
          style={{
            position: "absolute", top: 8, right: 8,
            background: liked ? "rgba(248,113,113,0.15)" : "rgba(0,0,0,0.55)",
            border: `1px solid ${liked ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 99, padding: "5px 11px",
            color: liked ? "#f87171" : "#aaa",
            fontSize: 11, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
            opacity: hov || liked ? 1 : 0,
            transition: "opacity 0.18s, background 0.18s, color 0.18s",
            fontFamily: "'DM Sans',sans-serif",
            backdropFilter: "blur(4px)",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill={liked?"#f87171":"none"} stroke={liked?"#f87171":"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          {count}
        </button>
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: "9px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderTop: "1px solid #222",
        background: "#1a1a1a",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
          {/* Avatar */}
          {model.avatar_url
            ? <img src={model.avatar_url} alt="" style={{ width:22, height:22, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
            : <div style={{ width:22, height:22, borderRadius:"50%", background:"linear-gradient(135deg,#7c6ef5,#34d399)", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#fff", fontWeight:600 }}>
                {avatarInitials}
              </div>
          }
          <span style={{ fontSize:11, color:"#ccc", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {model.user || "Anonymous"}
          </span>
        </div>

        {/* Like count luôn hiện */}
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color: liked ? "#f87171" : "#333", flexShrink:0 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill={liked?"#f87171":"#333"} stroke="none">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span>{count}</span>
        </div>
      </div>
    </div>
  )
})

/* ─────────────────────────────────────────────
   MODEL DETAIL MODAL
───────────────────────────────────────────── */
export function ModelModal({ model, onClose, onSelect }) {
  const [showExport, setShowExport]     = useState(false)
  const [showShare, setShowShare]       = useState(false)
  const [showViewSettings, setShowViewSettings] = useState(false)
  const [detailOpen, setDetailOpen]     = useState(false)
  const [collected, setCollected]         = useState(model.user_collected ?? false)
  const collectPendingRef = useRef(false)
  const [baseView, setBaseView]           = useState("default")   // "default" | "solid"
  const [overlayStyle, setOverlayStyle]   = useState(null)         // null | "unlit" | "normal" | "cartoon" | "sketch" | "hologram"
  const renderStyle = overlayStyle ?? baseView
  const [hasSkeleton, setHasSkeleton]     = useState(false)
  const [texResolution, setTexResolution] = useState(null)
  const [hasPbr, setHasPbr]               = useState(false)
  const [meshFaces, setMeshFaces]         = useState(null)
  const [meshVertices, setMeshVertices]   = useState(null)
  const [shading, setShading]             = useState("smooth")
  const [pbr, setPbr]                     = useState(true)
  const [wireframe, setWireframe]         = useState(false)
  const [metallic, setMetallic]           = useState(0)
  const [roughness, setRoughness]         = useState(1)
  const [autoRotate, setAutoRotate] = useState(true)
  const [showEnvSettings, setShowEnvSettings] = useState(false)
  const [envSurrounding, setEnvSurrounding]   = useState("studio")
  const [envStrength, setEnvStrength]         = useState(1)
  const [envRotation, setEnvRotation]         = useState(0)
  const [envAutoRotate, setEnvAutoRotate]     = useState(false)

  useEffect(() => {
    if (!envAutoRotate) return
    const id = setInterval(() => {
      setEnvRotation(r => (r + 1) % 361)
    }, 50)
    return () => clearInterval(id)
  }, [envAutoRotate])
  const cameraQuatRef = useRef({ x:0, y:0, z:0, w:1 })
  const [relatedModels, setRelatedModels] = useState([])

  // Fetch related models theo category đầu tiên, loại trừ model hiện tại
  useEffect(() => {
    const cat = model.categories?.[0]
    if (!cat) return
    import("../services/api").then(({ default: apiMod }) => {
      apiMod.get("/gallery", { params: { category: cat.toLowerCase(), limit: 6 } })
        .then(res => {
          const others = (res.data?.models ?? []).filter(m => m.id !== model.id)
          setRelatedModels(others.slice(0, 4))
        })
        .catch(() => {})
    })
  }, [model.id])

  // Parse model info: vertices, faces, texture resolution, skeleton
  // Hỗ trợ GLB, OBJ, STL
  useEffect(() => {
    if (!model.model_url) return
    const url = model.model_url
    const ext = url.split("?")[0].split(".").pop().toLowerCase()

    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => {

        // ── GLB ─────────────────────────────────────────────────────────────
        if (ext === "glb") {
          const view = new DataView(buf)
          if (view.getUint32(0, true) !== 0x46546C67) return
          const jsonLen = view.getUint32(12, true)
          const jsonStr = new TextDecoder().decode(buf.slice(20, 20 + jsonLen))
          const json = JSON.parse(jsonStr)
          if (json.skins && json.skins.length > 0) setHasSkeleton(true)

          // Detect PBR
          if (json.materials?.some(m => m.pbrMetallicRoughness)) setHasPbr(true)

          // Count vertices and faces from GLTF accessors
          if (json.meshes && json.accessors) {
            let totalVertices = 0
            let totalFaces = 0
            json.meshes.forEach(mesh => {
              mesh.primitives?.forEach(prim => {
                if (prim.attributes?.POSITION !== undefined)
                  totalVertices += json.accessors[prim.attributes.POSITION]?.count || 0
                if (prim.indices !== undefined)
                  totalFaces += Math.floor((json.accessors[prim.indices]?.count || 0) / 3)
                else if (prim.attributes?.POSITION !== undefined)
                  totalFaces += Math.floor((json.accessors[prim.attributes.POSITION]?.count || 0) / 3)
              })
            })
            if (totalVertices > 0) setMeshVertices(totalVertices)
            if (totalFaces > 0) setMeshFaces(totalFaces)
          }

          // Texture resolution từ ảnh đầu tiên embed trong GLB
          if (json.images && json.images.length > 0 && json.bufferViews) {
            const binOffset = 12 + 8 + jsonLen + 8
            const imgRef = json.images[0]
            if (imgRef.bufferView !== undefined) {
              const bv = json.bufferViews[imgRef.bufferView]
              const imgBytes = buf.slice(binOffset + bv.byteOffset, binOffset + bv.byteOffset + bv.byteLength)
              const blob = new Blob([imgBytes], { type: imgRef.mimeType || "image/png" })
              const blobUrl = URL.createObjectURL(blob)
              const img = new Image()
              img.onload = () => {
                const maxDim = Math.max(img.width, img.height)
                if (maxDim <= 512) setTexResolution("512")
                else if (maxDim <= 1024) setTexResolution("1k")
                else if (maxDim <= 2048) setTexResolution("2k")
                else setTexResolution("4k")
                URL.revokeObjectURL(blobUrl)
              }
              img.src = blobUrl
            }
          }
          return
        }

        // ── OBJ ─────────────────────────────────────────────────────────────
        if (ext === "obj") {
          const text = new TextDecoder().decode(buf)
          let vCount = 0
          let fTris  = 0
          let mtlFile = null   // tên file .mtl được reference trong OBJ

          for (const line of text.split("\n")) {
            const t = line.trimStart()
            if (t.startsWith("v "))         { vCount++ }
            else if (t.startsWith("f ")) {
              const verts = t.slice(2).trim().split(/\s+/).length
              fTris += Math.max(0, verts - 2)
            }
            else if (t.startsWith("mtllib ") && !mtlFile) {
              // "mtllib model.mtl" → lấy tên file MTL
              mtlFile = t.slice(7).trim().split(/\s+/)[0]
            }
          }
          if (vCount > 0) setMeshVertices(vCount)
          if (fTris  > 0) setMeshFaces(fTris)

          // Parse MTL để tìm texture và detect PBR
          if (mtlFile) {
            const mtlUrl = url.replace(/\/[^/]+(\?.*)?$/, `/${mtlFile}`)
            fetch(mtlUrl)
              .then(r => r.ok ? r.text() : Promise.reject())
              .then(mtlText => {
                // Detect PBR từ MTL: các keyword của PBR extension
                const hasPbrKeywords = /^\s*(Pr|Pm|map_Pr|map_Pm|norm|map_Bump)\s/m.test(mtlText)
                if (hasPbrKeywords) setHasPbr(true)

                // Tìm texture map đầu tiên (map_Kd, map_Pr, map_d, ...)
                const mapMatch = mtlText.match(/^\s*map_\w+\s+(\S+)/m)
                if (!mapMatch) return
                const texFile = mapMatch[1].trim().replace(/\\/g, "/").split("/").pop()
                const texUrl  = url.replace(/\/[^/]+(\?.*)?$/, `/${texFile}`)

                // Fetch texture → đo kích thước
                return fetch(texUrl)
                  .then(r => r.ok ? r.blob() : Promise.reject())
                  .then(blob => new Promise((res, rej) => {
                    const blobUrl = URL.createObjectURL(blob)
                    const img = new Image()
                    img.onload = () => {
                      const maxDim = Math.max(img.width, img.height)
                      if (maxDim <= 512)       setTexResolution("512")
                      else if (maxDim <= 1024) setTexResolution("1k")
                      else if (maxDim <= 2048) setTexResolution("2k")
                      else                     setTexResolution("4k")
                      URL.revokeObjectURL(blobUrl)
                      res()
                    }
                    img.onerror = rej
                    img.src = blobUrl
                  }))
              })
              .catch(() => {})
          }
          return
        }

        // ── STL ─────────────────────────────────────────────────────────────
        if (ext === "stl") {
          setTexResolution("none")
          // Phân biệt binary STL và ASCII STL
          // Binary STL: 80 bytes header + 4 bytes triangle count + 50 bytes/triangle
          const text80 = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 80))
          const isAscii = text80.trimStart().toLowerCase().startsWith("solid")
            && buf.byteLength < 500_000  // file nhỏ thì thử ASCII trước

          if (isAscii) {
            // ASCII STL: đếm số "facet normal"
            const fullText = new TextDecoder().decode(buf)
            const faceCount = (fullText.match(/^\s*facet\s+normal/gm) || []).length
            if (faceCount > 0) {
              setMeshFaces(faceCount)
              setMeshVertices(faceCount * 3)   // mỗi facet = 1 tam giác = 3 vertices
            }
          } else {
            // Binary STL: 4 bytes tại offset 80 = số triangle
            if (buf.byteLength >= 84) {
              const faceCount = new DataView(buf).getUint32(80, true)
              if (faceCount > 0) {
                setMeshFaces(faceCount)
                setMeshVertices(faceCount * 3)
              }
            }
          }
          return
        }

      })
      .catch(() => {})
  }, [model.model_url])

  const handleCollect = async () => {
    if (collectPendingRef.current) return
    const isLoggedIn = !!localStorage.getItem("token")
    if (!isLoggedIn) { window.dispatchEvent(new CustomEvent("open-auth-modal")); return }
    collectPendingRef.current = true
    const next = !collected
    setCollected(next)
    try {
      const apiMod = (await import("../services/api")).default
      await (next
        ? apiMod.post(`/gallery/${model.id}/collect`)
        : apiMod.delete(`/gallery/${model.id}/collect`)
      )
    } catch {
      setCollected(!next)
    } finally {
      collectPendingRef.current = false
    }
  }

  const HDRI_ENVS = [
    { key:"beach",    label:"Beach" },
    { key:"desert",   label:"Desert" },
    { key:"forest",   label:"Forest" },
    { key:"interior", label:"Interior" },
    { key:"night",    label:"Night" },
    { key:"studio",   label:"Studio" },
  ]
  const currentEnv = HDRI_ENVS.find(e => e.key === envSurrounding) ?? HDRI_ENVS[5]

  // SVG panorama previews — equirectangular style
  const ENV_PREVIEWS = {
    beach: (
      <svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
        <defs>
          <linearGradient id="b-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1a6aaa"/><stop offset="50%" stopColor="#5aabdd"/><stop offset="80%" stopColor="#aaddee"/><stop offset="100%" stopColor="#ddf0f8"/></linearGradient>
          <radialGradient id="b-sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fffff8"/><stop offset="25%" stopColor="#ffee88"/><stop offset="100%" stopColor="#5aabdd" stopOpacity="0"/></radialGradient>
          <filter id="b-glow"><feGaussianBlur stdDeviation="5"/></filter>
        </defs>
        <rect width="280" height="110" fill="url(#b-sky)"/>
        <ellipse cx="210" cy="28" rx="32" ry="32" fill="url(#b-sun)" filter="url(#b-glow)"/>
        <circle cx="210" cy="28" r="10" fill="#fffff8" opacity="0.98"/>
        <ellipse cx="55" cy="22" rx="32" ry="10" fill="#ffffff" opacity="0.8"/>
        <ellipse cx="75" cy="18" rx="22" ry="8" fill="#ffffff" opacity="0.85"/>
        <ellipse cx="38" cy="20" rx="18" ry="7" fill="#ffffff" opacity="0.75"/>
        <ellipse cx="155" cy="16" rx="25" ry="9" fill="#ffffff" opacity="0.65"/>
        <rect x="0" y="65" width="280" height="45" fill="#1a7aaa"/>
        <rect x="0" y="63" width="280" height="8" fill="#3a9acc" opacity="0.7"/>
        <path d="M0 70 Q35 66 70 70 Q105 74 140 70 Q175 66 210 70 Q245 74 280 70" stroke="#5ab8dd" strokeWidth="1.5" fill="none" opacity="0.6"/>
        <path d="M0 78 Q40 74 80 78 Q120 82 160 78 Q200 74 240 78 Q260 80 280 78" stroke="#4aa8cc" strokeWidth="1" fill="none" opacity="0.4"/>
        <rect x="0" y="82" width="280" height="28" fill="#e8c87a"/>
        <ellipse cx="140" cy="82" rx="140" ry="6" fill="#d4b060" opacity="0.5"/>
        <ellipse cx="60" cy="90" rx="30" ry="3" fill="#c8a850" opacity="0.3"/>
        <ellipse cx="200" cy="95" rx="40" ry="3" fill="#c8a850" opacity="0.25"/>
      </svg>
    ),
    desert: (
      <svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
        <defs>
          <linearGradient id="d-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#cc6600"/><stop offset="30%" stopColor="#ee8822"/><stop offset="60%" stopColor="#ffaa44"/><stop offset="100%" stopColor="#ffcc88"/></linearGradient>
          <radialGradient id="d-sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffffcc"/><stop offset="20%" stopColor="#ffdd44"/><stop offset="100%" stopColor="#ee8822" stopOpacity="0"/></radialGradient>
          <filter id="d-glow"><feGaussianBlur stdDeviation="6"/></filter>
          <filter id="d-blur"><feGaussianBlur stdDeviation="2"/></filter>
        </defs>
        <rect width="280" height="110" fill="url(#d-sky)"/>
        <ellipse cx="160" cy="22" rx="35" ry="35" fill="url(#d-sun)" filter="url(#d-glow)"/>
        <circle cx="160" cy="22" r="11" fill="#ffffdd" opacity="0.98"/>
        <rect x="0" y="62" width="280" height="6" fill="#ffbb66" opacity="0.4" filter="url(#d-blur)"/>
        <path d="M0 75 Q50 55 100 68 Q150 80 200 62 Q240 50 280 65 L280 110 L0 110 Z" fill="#cc9944"/>
        <path d="M0 80 Q60 65 120 75 Q180 85 240 70 Q260 65 280 72 L280 110 L0 110 Z" fill="#ddaa55"/>
        <path d="M0 90 Q70 80 140 88 Q200 95 280 85 L280 110 L0 110 Z" fill="#e8bb66"/>
        <path d="M20 95 Q60 92 100 95 Q140 98 180 95 Q220 92 260 95" stroke="#cc9944" strokeWidth="0.8" fill="none" opacity="0.5"/>
        <rect x="48" y="55" width="4" height="18" fill="#885522" opacity="0.7"/>
        <rect x="42" y="60" width="10" height="3" rx="1" fill="#885522" opacity="0.7"/>
        <rect x="230" y="52" width="4" height="16" fill="#885522" opacity="0.6"/>
        <rect x="224" y="57" width="10" height="3" rx="1" fill="#885522" opacity="0.6"/>
      </svg>
    ),
    forest: (
      <svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
        <defs>
          <linearGradient id="f-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1a3a1a"/><stop offset="50%" stopColor="#2d5a20"/><stop offset="100%" stopColor="#1a2a10"/></linearGradient>
          <radialGradient id="f-sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ccffaa" stopOpacity="0.8"/><stop offset="100%" stopColor="#44aa22" stopOpacity="0"/></radialGradient>
          <filter id="f-blur"><feGaussianBlur stdDeviation="3"/></filter>
        </defs>
        <rect width="280" height="110" fill="url(#f-sky)"/>
        <ellipse cx="80" cy="20" rx="40" ry="25" fill="url(#f-sun)" filter="url(#f-blur)"/>
        <ellipse cx="200" cy="15" rx="30" ry="20" fill="url(#f-sun)" filter="url(#f-blur)"/>
        {[15,45,75,100,130,160,190,220,255].map((x,i) => (
          <rect key={x} x={x} y={30+i%2*15} width={8+i%3*3} height={80} fill={i%2?"#1a1200":"#111a00"}/>
        ))}
        <ellipse cx="140" cy="10" rx="140" ry="30" fill="#1a3310" opacity="0.9"/>
        <ellipse cx="40" cy="5" rx="60" ry="22" fill="#223315" opacity="0.8"/>
        <ellipse cx="240" cy="8" rx="55" ry="20" fill="#1e3010" opacity="0.8"/>
        <rect x="0" y="80" width="280" height="30" fill="#111a08"/>
        <ellipse cx="140" cy="80" rx="140" ry="8" fill="#1a2a0a"/>
        <ellipse cx="90" cy="90" rx="20" ry="6" fill="#3a5520" opacity="0.5"/>
        <ellipse cx="180" cy="95" rx="15" ry="5" fill="#3a5520" opacity="0.4"/>
      </svg>
    ),
    interior: (
      <svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
        <defs>
          <linearGradient id="i-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2a2218"/><stop offset="100%" stopColor="#1a1510"/></linearGradient>
          <radialGradient id="i-lamp1" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffeeaa"/><stop offset="40%" stopColor="#ffcc66" stopOpacity="0.6"/><stop offset="100%" stopColor="#cc8800" stopOpacity="0"/></radialGradient>
          <radialGradient id="i-lamp2" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffeedd" stopOpacity="0.9"/><stop offset="50%" stopColor="#ffaa44" stopOpacity="0.4"/><stop offset="100%" stopColor="#cc7700" stopOpacity="0"/></radialGradient>
          <filter id="i-glow"><feGaussianBlur stdDeviation="5"/></filter>
        </defs>
        <rect width="280" height="110" fill="url(#i-wall)"/>
        <rect x="0" y="0" width="280" height="18" fill="#1e1810"/>
        <rect x="0" y="85" width="280" height="25" fill="#150f08"/>
        <line x1="140" y1="85" x2="0" y2="110" stroke="#1a1208" strokeWidth="0.8" opacity="0.4"/>
        <line x1="140" y1="85" x2="70" y2="110" stroke="#1a1208" strokeWidth="0.8" opacity="0.4"/>
        <line x1="140" y1="85" x2="210" y2="110" stroke="#1a1208" strokeWidth="0.8" opacity="0.4"/>
        <line x1="140" y1="85" x2="280" y2="110" stroke="#1a1208" strokeWidth="0.8" opacity="0.4"/>
        <rect x="12" y="22" width="50" height="58" rx="2" fill="#88aabb" opacity="0.15"/>
        <ellipse cx="37" cy="51" rx="40" ry="35" fill="url(#i-lamp1)" filter="url(#i-glow)" opacity="0.5"/>
        <rect x="12" y="22" width="50" height="58" rx="2" fill="none" stroke="#3a2a1a" strokeWidth="2"/>
        <line x1="37" y1="22" x2="37" y2="80" stroke="#3a2a1a" strokeWidth="1.5"/>
        <line x1="12" y1="51" x2="62" y2="51" stroke="#3a2a1a" strokeWidth="1.5"/>
        <line x1="140" y1="0" x2="140" y2="18" stroke="#2a2010" strokeWidth="2"/>
        <ellipse cx="140" cy="20" rx="14" ry="6" fill="#2a1a08"/>
        <ellipse cx="140" cy="22" rx="50" ry="30" fill="url(#i-lamp1)" filter="url(#i-glow)"/>
        <circle cx="140" cy="22" r="5" fill="#ffeeaa" opacity="0.95"/>
        <rect x="220" y="55" width="3" height="28" fill="#2a1a08"/>
        <ellipse cx="221" cy="55" rx="12" ry="8" fill="#2a1808" opacity="0.8"/>
        <ellipse cx="221" cy="55" rx="35" ry="28" fill="url(#i-lamp2)" filter="url(#i-glow)"/>
        <circle cx="221" cy="56" r="4" fill="#ffddaa" opacity="0.9"/>
        <rect x="0" y="83" width="280" height="3" fill="#221810"/>
        <rect width="280" height="110" fill="#ffaa44" opacity="0.04"/>
      </svg>
    ),
    night: (
      <svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
        <defs>
          <linearGradient id="n-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#020410"/><stop offset="60%" stopColor="#0a0f28"/><stop offset="100%" stopColor="#050818"/></linearGradient>
          <radialGradient id="n-moon" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#eeeeff"/><stop offset="60%" stopColor="#aabbdd" stopOpacity="0.5"/><stop offset="100%" stopColor="#223366" stopOpacity="0"/></radialGradient>
          <filter id="n-blur"><feGaussianBlur stdDeviation="2"/></filter>
          <filter id="n-glow"><feGaussianBlur stdDeviation="5"/></filter>
        </defs>
        <rect width="280" height="110" fill="url(#n-sky)"/>
        <ellipse cx="200" cy="22" rx="20" ry="20" fill="url(#n-moon)" filter="url(#n-glow)"/>
        <circle cx="200" cy="22" r="9" fill="#e8eeff" opacity="0.95"/>
        <circle cx="204" cy="19" r="7" fill="#c8d0ee" opacity="0.3"/>
        {[[30,8],[60,15],[100,6],[140,12],[170,5],[220,10],[250,16],[20,25],[80,22],[130,28],[170,20],[240,28],[45,35],[110,30],[190,33],[260,8]].map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r={i%3===0?1.2:0.7} fill="#ccd8ff" opacity={0.5+i%3*0.2}/>
        ))}
        <ellipse cx="100" cy="40" rx="120" ry="12" fill="#223366" opacity="0.15" filter="url(#n-glow)"/>
        <rect x="0" y="75" width="280" height="35" fill="#0a0a18"/>
        <ellipse cx="140" cy="75" rx="140" ry="10" fill="#223366" opacity="0.3" filter="url(#n-blur)"/>
        <rect x="0" y="78" width="280" height="32" fill="#050810"/>
        {[0,40,80,120,160,200,240].map((x,i) => <rect key={x} x={x} y={60+i%3*8} width={30+i%2*10} height={50} fill="#050810"/>)}
      </svg>
    ),
    studio: (
      <svg viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
        <defs>
          <radialGradient id="s-bg" cx="50%" cy="60%" r="70%"><stop offset="0%" stopColor="#2a2a2a"/><stop offset="100%" stopColor="#0a0a0a"/></radialGradient>
          <radialGradient id="s-l1" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffffff"/><stop offset="40%" stopColor="#eeeeee" stopOpacity="0.9"/><stop offset="100%" stopColor="#cccccc" stopOpacity="0"/></radialGradient>
          <radialGradient id="s-l2" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/><stop offset="50%" stopColor="#dddddd" stopOpacity="0.5"/><stop offset="100%" stopColor="#aaaaaa" stopOpacity="0"/></radialGradient>
          <filter id="s-blur"><feGaussianBlur stdDeviation="3"/></filter>
        </defs>
        <rect width="280" height="110" fill="url(#s-bg)"/>
        <ellipse cx="140" cy="95" rx="120" ry="18" fill="#1a1a1a" opacity="0.6"/>
        <rect x="18" y="10" width="52" height="38" rx="3" fill="#111" stroke="#333" strokeWidth="0.5"/>
        <rect x="20" y="12" width="48" height="34" rx="2" fill="url(#s-l1)"/>
        <ellipse cx="44" cy="29" rx="28" ry="20" fill="url(#s-l1)" filter="url(#s-blur)"/>
        <ellipse cx="44" cy="29" rx="55" ry="35" fill="#ffffff" opacity="0.08" filter="url(#s-blur)"/>
        <rect x="210" y="8" width="44" height="32" rx="3" fill="#111" stroke="#333" strokeWidth="0.5"/>
        <rect x="212" y="10" width="40" height="28" rx="2" fill="url(#s-l2)"/>
        <ellipse cx="232" cy="24" rx="22" ry="16" fill="url(#s-l2)" filter="url(#s-blur)"/>
        <ellipse cx="232" cy="24" rx="45" ry="28" fill="#ffffff" opacity="0.07" filter="url(#s-blur)"/>
        <rect x="80" y="2" width="120" height="8" rx="2" fill="#555" opacity="0.4"/>
        <rect x="82" y="2" width="116" height="6" rx="1" fill="#ffffff" opacity="0.25"/>
        <circle cx="248" cy="18" r="8" fill="#fff" opacity="0.7"/>
        <circle cx="248" cy="18" r="5" fill="#ffffff"/>
        <ellipse cx="248" cy="18" rx="18" ry="14" fill="#ffffff" opacity="0.1" filter="url(#s-blur)"/>
        <ellipse cx="140" cy="85" rx="60" ry="12" fill="#333" opacity="0.3"/>
      </svg>
    ),
  }

  const BASE_VIEWS = [
    { key:"default", label:"Textured View" },
    { key:"solid",   label:"Solid View" },
  ]
  const OVERLAY_STYLES = [
    { key:"unlit",    label:"Unlit" },
    { key:"normal",   label:"Normal" },
    { key:"cartoon",  label:"Cartoon Style" },
    { key:"sketch",   label:"Sketch Style" },
    { key:"hologram", label:"Hologram Style" },
  ]

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex" }} onClick={onClose}>
      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)" }} />

      <div style={{ position:"relative", margin:"auto", width:"95vw", maxWidth:1200, height:"90vh", display:"flex", borderRadius:16, background:"#111", border:"1px solid #222" }} onClick={e => e.stopPropagation()}>
        {/* ── LEFT: 3D Viewer ── */}
        <div style={{ flex:1, position:"relative", background:"radial-gradient(ellipse at 50% 40%, #606060 0%, #505050 15%, #404040 28%, #303030 42%, #222222 57%, #171717 72%, #101010 86%, #0c0c0c 100%)", display:"flex", alignItems:"center", justifyContent:"center", minHeight:0, isolation:"isolate", overflow:"hidden", borderRadius:"16px 0 0 16px" }}>

          {/* Viewer */}
          {model.model_url ? (
            <ModelViewer3D
              src={model.model_url}
              style={renderStyle}
              autoRotate={autoRotate}
              interactive={true}
              cameraQuatRef={cameraQuatRef}
              wireframe={wireframe}
              shading={shading}
              pbr={pbr}
              metallic={metallic}
              roughness={roughness}
              environment={envSurrounding}
              envStrength={envStrength}
              envRotation={envRotation}
              envAutoRotate={envAutoRotate}
            />
          ) : (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:80, opacity:0.4 }}>🗂</div>
              <div style={{ fontSize:13, color:"#333", marginTop:12 }}>No model</div>
            </div>
          )}

          {/* Bottom toolbar */}
          <div style={{ position:"absolute", bottom:20, left:"50%", transform:"translateX(-50%)", display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>

            {/* Row 1: view modes + render styles */}
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(0,0,0,0.75)", borderRadius:99, padding:"7px 14px", border:"1px solid #2a2a2a", flexWrap:"nowrap", overflowX:"auto", maxWidth:"90vw" }}>

              {/* LEFT: Solid View / Textured View / View Settings */}
              {BASE_VIEWS.map(s => (
                <button key={s.key} onClick={() => {
                  setBaseView(s.key)
                  if (s.key === "solid") setOverlayStyle(null)
                }}
                  style={{ fontSize:11, padding:"4px 10px", borderRadius:99, whiteSpace:"nowrap",
                    border:`1px solid ${s.key==="solid" ? (baseView==="solid"?"#7c6ef5":"transparent") : (baseView==="default"||overlayStyle)?"#7c6ef5":"transparent"}`,
                    background: s.key==="solid" ? (baseView==="solid"?"rgba(124,110,245,0.2)":"none") : (baseView==="default"||overlayStyle)?"rgba(124,110,245,0.2)":"none",
                    color: s.key==="solid" ? (baseView==="solid"?"#a89ff5":"#555") : (baseView==="default"||overlayStyle)?"#a89ff5":"#555",
                    cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s" }}
                >{s.label}</button>
              ))}

              {/* SEPARATOR */}
              <div style={{ width:1, height:14, background:"#2a2a2a", margin:"0 4px" }} />

              {/* RIGHT: Overlay styles */}
              {OVERLAY_STYLES.map(s => (
                <button key={s.key} onClick={() => { setBaseView("default"); setOverlayStyle(p => p===s.key ? null : s.key) }}
                  style={{ fontSize:11, padding:"4px 10px", borderRadius:99, whiteSpace:"nowrap",
                    border:`1px solid ${overlayStyle===s.key?"#7c6ef5":"transparent"}`,
                    background: overlayStyle===s.key?"rgba(124,110,245,0.2)":"none",
                    color: overlayStyle===s.key?"#a89ff5":"#555",
                    cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s" }}
                >{s.label}</button>
              ))}
            </div>

            {/* Row 2: collect, share, export */}
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <button onClick={handleCollect} title="Collect"
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:collected?"#f5c842":"#555", transition:"color 0.2s" }}
              >★</button>

              <button onClick={() => setShowShare(p => !p)} title="Share"
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:showShare?"#7c6ef5":"#555", transition:"color 0.2s" }}
              >↗</button>

              {/* Auto-rotate toggle */}
              <button onClick={() => setAutoRotate(p => !p)} title={autoRotate ? "Dừng xoay" : "Xoay tự động"}
                style={{ background:autoRotate?"rgba(124,110,245,0.15)":"rgba(255,255,255,0.05)", border:`1px solid ${autoRotate?"rgba(124,110,245,0.4)":"#2a2a2a"}`, borderRadius:99, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:"4px 12px", transition:"all 0.2s" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={autoRotate?"#a89ff5":"#555"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {autoRotate
                    ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                    : <polygon points="5,3 19,12 5,21"/>
                  }
                </svg>
                <span style={{ fontSize:11, color:autoRotate?"#a89ff5":"#555", fontFamily:"'DM Sans',sans-serif" }}>{autoRotate?"Pause":"Play"}</span>
              </button>

              <ActionBtn label="Export" icon="⬇" yellow onClick={() => setShowExport(true)} />
            </div>
          </div>

          {/* Share popup */}
          {showShare && (
            <SharePopup
              url={`${window.location.origin}/3d-model/${model.model_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${model.uuid}`}
              onClose={() => setShowShare(false)}
            />
          )}
        </div>

        {/* ── RIGHT: Info Panel ── */}
        <div className="panel-scroll" style={{ width:300, background:"#0f0f0f", borderLeft:"1px solid #1a1a1a", overflowY:"auto", flexShrink:0, borderRadius:"0 16px 16px 0" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:"1px solid #1a1a1a" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,#7c6ef5,#34d399)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:600, color:"#fff" }}>
                {(model.avatar||"A").slice(0,2).toUpperCase()}
              </div>
              <span style={{ fontSize:13, color:"#ccc", fontWeight:500 }}>{model.user}</span>
            </div>
            <span style={{ fontSize:11, color:"#444" }}>{model.created_at}</span>
          </div>

          <div style={{ padding:"16px" }}>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#444", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.08em" }}>Model Name</div>
              <div style={{ fontSize:14, color:"#ccc" }}>{model.model_name || "Untitled"}</div>
            </div>

            {model.tags && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:"#444", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Tags</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {model.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} style={{ fontSize:11, color:"#888", background:"#1a1a1a", border:"1px solid #222", borderRadius:6, padding:"3px 10px" }}>{t}</span>
                  ))}
                </div>
              </div>
            )}

            {model.categories?.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:"#444", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Category</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {model.categories.map(c => (
                    <span key={c} style={{ fontSize:11, color:"#7c6ef5", background:"rgba(124,110,245,0.1)", border:"1px solid rgba(124,110,245,0.2)", borderRadius:6, padding:"3px 10px" }}>{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Input image */}
            {model.image_url && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:"#444", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Input</div>
                <img src={model.image_url} alt="input" style={{ width:"100%", borderRadius:8, border:"1px solid #222", objectFit:"cover", maxHeight:160 }} />
              </div>
            )}

            <div style={{ borderTop:"1px solid #1a1a1a", paddingTop:14, marginTop:4 }}>
              <button onClick={() => setDetailOpen(p => !p)}
                style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"'DM Sans',sans-serif" }}>
                <span style={{ fontSize:13, color:"#ccc", fontWeight:500 }}>Detailed Info</span>
                <span style={{ fontSize:11, color:"#444" }}>{detailOpen ? "∧" : "∨"}</span>
              </button>
              {detailOpen && (() => {
                const fmt = model.model_url ? model.model_url.split("?")[0].split(".").pop().toLowerCase() : ""
                const isStl = fmt === "stl"
                const isObj = fmt === "obj"
                const rows = [
                  // Texture: hiện cho GLB (có value) và OBJ (đợi parse), ẩn cho STL
                  !isStl && ["Texture", texResolution
                    ? texResolution
                    : isObj ? "Đang đọc..." : "—"],
                  // Skeleton: chỉ meaningful với GLB
                  !isStl && !isObj && ["Skeleton", hasSkeleton ? "✓" : "—"],
                  // PBR: GLB và OBJ có thể có
                  !isStl && ["PBR", hasPbr ? "✓" : "—"],
                  ["Format",   fmt.toUpperCase() || "—"],
                  ["Platform", "FORMA"],
                ].filter(Boolean)

                return (
                  <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:8 }}>
                    {rows.map(([k, v]) => (
                      <div key={k} style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:12, color:"#555" }}>{k}</span>
                        <span style={{ fontSize:12, color: v === "Đang đọc..." ? "#444" : "#888",
                          fontStyle: v === "Đang đọc..." ? "italic" : "normal" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Related Models */}
            {relatedModels.length > 0 && (
              <div style={{ borderTop:"1px solid #1a1a1a", paddingTop:14, marginTop:14 }}>
                <div style={{ fontSize:11, color:"#444", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>Related Models</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {relatedModels.map(m => (
                    <div key={m.id} onClick={() => onSelect(m)}
                      style={{ borderRadius:8, overflow:"hidden", background:"radial-gradient(ellipse at 50% 55%, #3a3a3a 0%, #1a1a1a 100%)", border:"1px solid #1e1e1e", cursor:"pointer", aspectRatio:"1", position:"relative" }}>
                      {m.model_url
                        ? <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
                            <ModelViewer3D src={m.model_url} style="default" autoRotate={true} interactive={false} />
                          </div>
                        : m.image_url
                        ? <img src={m.image_url} alt={m.model_name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, opacity:0.3 }}>🗂</div>
                      }
                      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"4px 6px", background:"rgba(0,0,0,0.75)", fontSize:10, color:"#aaa", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.model_name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── TOP RIGHT: Topology + Gizmo + Icon Buttons ── */}
        <div style={{ position:"absolute", top:16, right:316, zIndex:20, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:10, pointerEvents:"auto" }}>

          {/* Row 1: Topology LEFT + Gizmo RIGHT */}
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ textAlign:"right" }}>
              {[["Topology","Triangle"],["Faces", meshFaces != null ? meshFaces.toLocaleString() : (model.faces||0).toLocaleString()],["Vertices", meshVertices != null ? meshVertices.toLocaleString() : (model.vertices||0).toLocaleString()]].map(([k,v]) => (
                <div key={k} style={{ display:"flex", gap:12, justifyContent:"flex-end", marginBottom:3 }}>
                  <span style={{ fontSize:12, color:"#555" }}>{k}</span>
                  <span style={{ fontSize:12, color:"#ccc", fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </div>
            <ViewerGizmo cameraQuatRef={cameraQuatRef} />
          </div>

          {/* Icon buttons + popups — wrapper position:relative để popup absolute ra trái */}
          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:1, background:"rgba(0,0,0,0.6)", border:"1px solid #2a2a2a", borderRadius:10, overflow:"hidden" }}>
              <button
                onClick={() => { setShowEnvSettings(p => !p); setShowViewSettings(false) }}
                title="Environment Settings"
                style={{ width:36, height:36, background:showEnvSettings?"rgba(124,110,245,0.25)":"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:showEnvSettings?"#a89ff5":"#666", transition:"all 0.15s" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              </button>
              <div style={{ height:1, background:"#222" }} />
              <button
                onClick={() => { setShowViewSettings(p => !p); setShowEnvSettings(false) }}
                title="View Settings"
                style={{ width:36, height:36, background:showViewSettings?"rgba(124,110,245,0.25)":"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:showViewSettings?"#a89ff5":"#666", transition:"all 0.15s" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
                  <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>
                </svg>
              </button>
              <div style={{ height:1, background:"#222" }} />
              <button
                onClick={() => setWireframe(p => !p)}
                title="Wireframe"
                style={{ width:36, height:36, background:wireframe?"rgba(124,110,245,0.25)":"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:wireframe?"#a89ff5":"#666", transition:"all 0.15s" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
              </button>
            </div>

            {/* Environment Settings popup — absolute bên trái icon buttons */}
            {showEnvSettings && (
              <div style={{ position:"absolute", top:0, right:44, background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:20, width:280, zIndex:30 }} onClick={e => e.stopPropagation()}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <span style={{ fontSize:14, fontWeight:500, color:"#fff" }}>Environment Settings</span>
                  <button onClick={() => setShowEnvSettings(false)} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:14 }}>✕</button>
                </div>

                {/* HDRI preview */}
                <div style={{ fontSize:11, color:"#555", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>HDRI</div>
                <div style={{ borderRadius:8, overflow:"hidden", marginBottom:16, height:110, background:"#111", border:"1px solid #2a2a2a", position:"relative" }}>
                  {ENV_PREVIEWS[currentEnv.key]}
                </div>

                {/* Surrounding dropdown */}
                <div style={{ fontSize:11, color:"#555", marginBottom:6 }}>Surrounding</div>
                <div style={{ position:"relative", marginBottom:16 }}>
                  <select
                    value={envSurrounding}
                    onChange={e => setEnvSurrounding(e.target.value)}
                    style={{ width:"100%", padding:"8px 12px", borderRadius:8, background:"#111", border:"1px solid #2a2a2a", color:"#ccc", fontSize:13, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", appearance:"none", outline:"none" }}
                  >
                    {HDRI_ENVS.map(env => (
                      <option key={env.key} value={env.key}>{env.label}</option>
                    ))}
                  </select>
                  <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"#555" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>

                {/* Strength */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:12, color:"#888" }}>Strength</span>
                    <span style={{ fontSize:12, color:"#ccc", background:"#111", border:"1px solid #2a2a2a", borderRadius:6, padding:"1px 8px", minWidth:36, textAlign:"center" }}>{envStrength.toFixed(1)}</span>
                  </div>
                  <input type="range" min="0" max="3" step="0.1" value={envStrength} onChange={e => setEnvStrength(+e.target.value)} style={{ width:"100%", accentColor:"#7c6ef5" }} />
                </div>

                {/* Rotation */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:12, color:"#888" }}>Rotation</span>
                    <span style={{ fontSize:12, color:"#ccc", background:"#111", border:"1px solid #2a2a2a", borderRadius:6, padding:"1px 8px", minWidth:36, textAlign:"center" }}>{envRotation}</span>
                  </div>
                  <input type="range" min="0" max="360" step="1" value={envRotation} onChange={e => setEnvRotation(+e.target.value)} style={{ width:"100%", accentColor:"#7c6ef5" }} />
                </div>

                {/* Auto Rotate */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:13, color:"#ccc" }}>Auto Rotate</span>
                  <div onClick={() => setEnvAutoRotate(p => !p)} style={{ width:36, height:20, borderRadius:99, background:envAutoRotate?"#7c6ef5":"#2a2a2a", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                    <div style={{ width:14, height:14, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left:envAutoRotate?19:3, transition:"left 0.2s" }} />
                  </div>
                </div>
              </div>
            )}

            {/* View Settings popup — absolute bên trái icon buttons, offset xuống theo vị trí nút */}
            {showViewSettings && (
              <div style={{ position:"absolute", top:37, right:44, background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:20, width:260, zIndex:30 }} onClick={e => e.stopPropagation()}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <span style={{ fontSize:14, fontWeight:500, color:"#fff" }}>View Settings</span>
                  <button onClick={() => setShowViewSettings(false)} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:14 }}>✕</button>
                </div>
                <div style={{ fontSize:11, color:"#555", marginBottom:8 }}>Shading</div>
                <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                  {["flat","smooth"].map(s => (
                    <button key={s} onClick={() => setShading(s)}
                      style={{ flex:1, padding:"8px 0", fontSize:12, borderRadius:8, border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                        background: shading===s ? "#7c6ef5" : "#2a2a2a",
                        color: shading===s ? "#fff" : "#888",
                        fontWeight: shading===s ? 600 : 400
                      }}
                    >{s.charAt(0).toUpperCase()+s.slice(1)}</button>
                  ))}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <span style={{ fontSize:13, color:"#ccc" }}>PBR</span>
                  <div onClick={() => setPbr(p => !p)} style={{ width:36, height:20, borderRadius:99, background:pbr?"#7c6ef5":"#2a2a2a", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                    <div style={{ width:14, height:14, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left:pbr?19:3, transition:"left 0.2s" }} />
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:12, color:"#888" }}>Metallic</span><span style={{ fontSize:12, color:"#ccc" }}>{metallic}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={metallic} onChange={e => setMetallic(+e.target.value)} style={{ width:"100%", accentColor:"#7c6ef5" }} />
                </div>
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:12, color:"#888" }}>Roughness</span><span style={{ fontSize:12, color:"#ccc" }}>{roughness}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={roughness} onChange={e => setRoughness(+e.target.value)} style={{ width:"100%", accentColor:"#7c6ef5" }} />
                </div>
              </div>
            )}
          </div>
        </div>



        {/* Close — top-left */}
        <button onClick={onClose}
          style={{ position:"absolute", top:14, left:14, background:"rgba(0,0,0,0.6)", border:"1px solid #333", color:"#888", width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", zIndex:25 }}
        >✕</button>
      </div>

      {showExport && <ExportModal model={model} hasSkeleton={hasSkeleton} texResolution={texResolution} onClose={() => setShowExport(false)} />}
    </div>
  )
}

/* ─────────────────────────────────────────────
   SHARE POPUP
───────────────────────────────────────────── */
function SharePopup({ url, onClose }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ position:"absolute", bottom:130, left:"50%", transform:"translateX(-50%)", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:20, width:300, zIndex:20 }} onClick={e => e.stopPropagation()}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <span style={{ fontSize:14, fontWeight:500, color:"#fff" }}>Share</span>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:14 }}>✕</button>
      </div>

      <div style={{ fontSize:11, color:"#555", marginBottom:8 }}>Share Link</div>
      <div style={{ display:"flex", gap:8 }}>
        <div style={{ flex:1, background:"#111", border:"1px solid #222", borderRadius:8, padding:"9px 12px", fontSize:12, color:"#666", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {url}
        </div>
        <button onClick={copy}
          style={{ flexShrink:0, padding:"9px 16px", borderRadius:8, border:"none", background:copied?"#34d399":"linear-gradient(135deg,#f5c842,#e8a800)", color:"#111", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"background 0.2s" }}
        >{copied ? "✓" : "Copy"}</button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   ACTION BUTTON
───────────────────────────────────────────── */
function ActionBtn({ label, icon, yellow, onClick }) {
  return (
    <button onClick={onClick}
      style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:99, border:`1px solid ${yellow?"#f5c842":"#2a2a2a"}`, background:yellow?"linear-gradient(135deg,#f5c842,#e8a800)":"rgba(0,0,0,0.6)", color:yellow?"#111":"#ccc", fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

/* ─────────────────────────────────────────────
   EXPORT MODAL
───────────────────────────────────────────── */
const FORMATS  = ["GLB", "OBJ", "STL"]
const TEX_RES  = ["512", "1k", "2k", "4k"]

/** Lấy extension gốc của model từ URL, vd "glb" | "obj" | "stl" */
function getSrcFormat(modelUrl) {
  if (!modelUrl) return "glb"
  const ext = modelUrl.split("?")[0].split(".").pop().toLowerCase()
  return ext || "glb"
}

function ExportModal({ model, hasSkeleton, texResolution, onClose }) {
  const srcFormat = getSrcFormat(model.model_url)   // "glb" | "obj" | "stl"

  const [format, setFormat]           = useState(srcFormat.toUpperCase() === "OBJ" ? "OBJ" : "GLB")
  const [texRes, setTexRes]           = useState(texResolution || "4k")
  const [skeleton, setSkeleton]       = useState(hasSkeleton)
  const [pivot, setPivot]             = useState(false)
  const [fileName, setFileName]       = useState(model.model_name || "model")
  const [downloading, setDownloading] = useState(false)

  // Map resolution sang số pixel để so sánh
  const RES_ORDER = { "512":512, "1k":1024, "2k":2048, "4k":4096 }
  const maxRes = RES_ORDER[texResolution] || 4096

  // Set default texRes về resolution gốc khi biết
  useEffect(() => {
    if (texResolution) setTexRes(texResolution)
  }, [texResolution])

  // GLB→OBJ là trường hợp duy nhất trả về .zip (vì có textures)
  // STL→OBJ chỉ trả .obj (STL không có material)
  const downloadExt  = (format === "OBJ" && srcFormat === "glb") ? "zip" : format.toLowerCase()
  const needsConvert = format.toLowerCase() !== srcFormat

  const handleExport = async () => {
    if (!model.model_url) { onClose(); return }
    setDownloading(true)
    try {
      const apiMod = (await import("../services/api")).default

      // ── Private asset (chưa publish) → gọi /my-jobs/{job_id}/export ───────
      if (model._privateAsset) {
        const params = {
          format: format.toLowerCase(),
          ...(!skeleton && { include_skeleton: false }),
          ...(pivot && { bottom_center_pivot: true }),
          ...(texResolution !== "none" && RES_ORDER[texRes] < (texResolution ? RES_ORDER[texResolution] : RES_ORDER["4k"]) && { tex_res: texRes }),
        }
        const res = await apiMod.get(`/my-jobs/${model.id}/export`, { params, responseType: "blob" })
        const url = URL.createObjectURL(res.data)
        const a   = document.createElement("a")
        a.href    = url
        a.download = `${fileName}.${downloadExt}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        onClose(); return
      }

      if (needsConvert) {
        // ── Cần convert (OBJ→GLB hoặc GLB→OBJ) → luôn gọi API ──────────────
        const res = await apiMod.get(`/gallery/${model.id}/export`, {
          params: { format: format.toLowerCase(), ...(!skeleton && { include_skeleton: false }), ...(pivot && { bottom_center_pivot: true }) },
          responseType: "blob",
        })
        const url = URL.createObjectURL(res.data)
        const a   = document.createElement("a")
        a.href    = url
        a.download = `${fileName}.${downloadExt}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)

      } else if (texResolution !== "none" && RES_ORDER[texRes] < (texResolution ? RES_ORDER[texResolution] : RES_ORDER["4k"])) {
        // ── Cùng format nhưng cần downscale texture → gọi API ───────────────
        const res = await apiMod.get(`/gallery/${model.id}/export`, {
          params: { tex_res: texRes, format: format.toLowerCase(), ...(!skeleton && { include_skeleton: false }), ...(pivot && { bottom_center_pivot: true }) },
          responseType: "blob",
        })
        const url = URL.createObjectURL(res.data)
        const a   = document.createElement("a")
        a.href    = url
        a.download = `${fileName}.${downloadExt}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)

      } else if (skeleton || pivot) {
        // ── Cùng format, không downscale, nhưng có skeleton/pivot → gọi API ─
        const res = await apiMod.get(`/gallery/${model.id}/export`, {
          params: { format: format.toLowerCase(), ...(!skeleton && { include_skeleton: false }), ...(pivot && { bottom_center_pivot: true }) },
          responseType: "blob",
        })
        const url = URL.createObjectURL(res.data)
        const a   = document.createElement("a")
        a.href    = url
        a.download = `${fileName}.${downloadExt}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)

      } else {
        // ── Cùng format, không downscale → download thẳng file gốc ──────────
        // OBJ gốc: trả về URL của file .obj, browser tải trực tiếp
        const res = await fetch(model.model_url)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a   = document.createElement("a")
        a.href    = url
        a.download = `${fileName}.${downloadExt}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      onClose()
    } catch {
      window.open(model.model_url, "_blank")
      onClose()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"#141414", border:"1px solid #222", borderRadius:14, width:340, padding:24, position:"relative" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontSize:15, fontWeight:500, color:"#fff" }}>Export</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:16 }}>✕</button>
        </div>

        {/* File Name */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>File Name</div>
          <input value={fileName} onChange={e => setFileName(e.target.value)}
            style={{ width:"100%", background:"#1a1a1a", border:"1px solid #222", borderRadius:8, padding:"10px 12px", color:"#ccc", fontSize:13, outline:"none", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" }} />
        </div>

        {/* Format */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:12, color:"#555" }}>Format</span>
            <span style={{ fontSize:11, color:"#444" }}>Gốc: <span style={{ color:"#888" }}>.{srcFormat.toUpperCase()}</span></span>
          </div>
          <div style={{ position:"relative" }}>
            <select value={format} onChange={e => setFormat(e.target.value)}
              style={{ width:"100%", background:"#1a1a1a", border:`1px solid ${needsConvert?"#f5a623":"#222"}`, borderRadius:8, padding:"10px 12px", color:"#ccc", fontSize:13, outline:"none", cursor:"pointer", appearance:"none", fontFamily:"'DM Sans',sans-serif" }}
            >
              {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", color:"#555", pointerEvents:"none" }}>∨</span>
          </div>
          {needsConvert && format === "OBJ" && srcFormat === "glb" && (
            <div style={{ fontSize:11, color:"#f5a623", marginTop:6 }}>
              ⚠ GLB → OBJ sẽ tải về dạng <strong>.zip</strong> (gồm .obj + .mtl + textures)
            </div>
          )}
          {needsConvert && format === "OBJ" && srcFormat === "stl" && (
            <div style={{ fontSize:11, color:"#888", marginTop:6 }}>
              STL → OBJ sẽ tải về file <strong>.obj</strong> (không có material)
            </div>
          )}
          {needsConvert && format === "GLB" && (
            <div style={{ fontSize:11, color:"#f5a623", marginTop:6 }}>
              ⚠ {srcFormat.toUpperCase()} → GLB sẽ được convert tự động (có thể mất vài giây)
            </div>
          )}
          {needsConvert && format === "STL" && (
            <div style={{ fontSize:11, color:"#888", marginTop:6 }}>
              ⚠ STL không lưu màu/texture — chỉ giữ lại geometry
            </div>
          )}
        </div>

        {/* Texture Resolution */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:12, color:"#555" }}>Texture Resolution</span>
            {texResolution === "none"
              ? <span style={{ fontSize:11, color:"#444" }}>Không có texture</span>
              : texResolution
              ? <span style={{ fontSize:11, color:"#7c6ef5" }}>Gốc: {texResolution}</span>
              : <span style={{ fontSize:11, color:"#444", fontStyle:"italic" }}>Đang đọc...</span>
            }
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {TEX_RES.map(r => {
              const tooHigh = RES_ORDER[r] > maxRes
              const active = texRes === r
              return (
                <button key={r}
                  onClick={() => !tooHigh && setTexRes(r)}
                  disabled={tooHigh}
                  title={tooHigh ? `Model chỉ có ${texResolution}` : r}
                  style={{ flex:1, padding:"8px 0", fontSize:12,
                    border:`1px solid ${active?"#7c6ef5":"#222"}`,
                    borderRadius:8,
                    background: active?"rgba(124,110,245,0.15)":"#1a1a1a",
                    color: tooHigh?"#2a2a2a": active?"#a89ff5":"#555",
                    cursor: tooHigh?"not-allowed":"pointer",
                    fontFamily:"'DM Sans',sans-serif",
                    position:"relative",
                    textDecoration: tooHigh?"line-through":"none"
                  }}
                >{r}</button>
              )
            })}
          </div>
          {texRes !== texResolution && texResolution && (
            <div style={{ fontSize:11, color:"#f5a623", marginTop:6 }}>
              ↓ Sẽ downscale từ {texResolution} xuống {texRes}
            </div>
          )}
        </div>

        {/* Export Skeleton */}
        {hasSkeleton && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <span style={{ fontSize:13, color:"#888" }}>Export Skeleton</span>
            <div onClick={() => setSkeleton(p => !p)}
              style={{ width:36, height:20, borderRadius:99, background:skeleton?"#7c6ef5":"#2a2a2a", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
              <div style={{ width:14, height:14, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left:skeleton?19:3, transition:"left 0.2s" }} />
            </div>
          </div>
        )}

        {/* Bottom Center Pivot */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <span style={{ fontSize:13, color:"#888" }}>Bottom Center Pivot</span>
          <div onClick={() => setPivot(p => !p)}
            style={{ width:36, height:20, borderRadius:99, background:pivot?"#7c6ef5":"#2a2a2a", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
            <div style={{ width:14, height:14, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left:pivot?19:3, transition:"left 0.2s" }} />
          </div>
        </div>

        {/* Export button */}
        <button onClick={handleExport} disabled={downloading}
          style={{ width:"100%", padding:"12px 0", borderRadius:99, background:downloading?"#2a2a2a":"linear-gradient(135deg,#f5c842,#e8a800)", color:downloading?"#555":"#111", fontSize:14, fontWeight:600, border:"none", cursor:downloading?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"'DM Sans',sans-serif" }}
        >
          <span>⬇</span> {downloading ? "Đang tải..." : `Export .${downloadExt.toUpperCase()}`}
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   FEATURE MY MODEL MODAL
───────────────────────────────────────────── */
function FeatureModal({ onClose }) {
  const [modelName, setModelName]   = useState("")
  const [tags, setTags]             = useState("")
  const [selectedCats, setSelectedCats] = useState([])
  const [imageFile, setImageFile]   = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [modelFile, setModelFile]   = useState(null)
  const [mtlFile, setMtlFile]       = useState(null)      // File .mtl
  const [textureFiles, setTextureFiles] = useState([])    // ✅ THÊM: Texture files array
  const [isObjFile, setIsObjFile]   = useState(false)     // Detect .obj
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [errors, setErrors]         = useState({})
  const imageRef = useRef()
  const modelRef = useRef()
  const mtlRef = useRef()                                 // Ref cho mtl input
  const textureRef = useRef()                             // ✅ THÊM: Ref cho texture input

  const MAX_IMAGE_MB = 10
  const MAX_MODEL_MB = 50
  const ALLOWED_MODEL_EXT = [".glb", ".obj", ".stl"]
  const ALLOWED_IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp"]

  const handleImage = (f) => {
    if (!f) return
    const ext = "." + f.name.split(".").pop().toLowerCase()
    const newErrors = { ...errors }
    if (!ALLOWED_IMAGE_EXT.includes(ext)) {
      newErrors.image = `Chỉ chấp nhận: JPG, PNG, WEBP`
      setErrors(newErrors); return
    }
    if (f.size > MAX_IMAGE_MB * 1024 * 1024) {
      newErrors.image = `Ảnh tối đa ${MAX_IMAGE_MB}MB (file này: ${(f.size/1024/1024).toFixed(1)}MB)`
      setErrors(newErrors); return
    }
    delete newErrors.image
    setErrors(newErrors)
    setImageFile(f)
    setImagePreview(URL.createObjectURL(f))
  }

  const handleModel = (f) => {
    if (!f) return
    const ext = "." + f.name.split(".").pop().toLowerCase()
    const newErrors = { ...errors }
    if (!ALLOWED_MODEL_EXT.includes(ext)) {
      newErrors.model = `Không hỗ trợ .${f.name.split(".").pop().toUpperCase()} — chỉ GLB, OBJ, STL`
      setErrors(newErrors); return
    }
    if (f.size > MAX_MODEL_MB * 1024 * 1024) {
      newErrors.model = `Model tối đa ${MAX_MODEL_MB}MB (file này: ${(f.size/1024/1024).toFixed(1)}MB)`
      setErrors(newErrors); return
    }
    delete newErrors.model
    setErrors(newErrors)
    setModelFile(f)
    
    // ✅ THÊM: Detect nếu là file .obj
    setIsObjFile(ext === '.obj')
    // Reset mtl file khi đổi model
    setMtlFile(null)
  }

  // ✅ THÊM: Handle .mtl file upload
  const handleMtl = (f) => {
    if (!f) return
    const ext = "." + f.name.split(".").pop().toLowerCase()
    
    if (ext !== '.mtl') {
      alert('Chỉ chấp nhận file .mtl')
      return
    }
    
    if (f.size > 5 * 1024 * 1024) { // 5MB max
      alert('File .mtl quá lớn (tối đa 5MB)')
      return
    }
    
    setMtlFile(f)
  }

  // ✅ THÊM: Handle texture files upload (multiple)
  const handleTextures = (files) => {
    if (!files || files.length === 0) return
    
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tga']
    const validFiles = []
    
    Array.from(files).forEach(f => {
      const ext = "." + f.name.split(".").pop().toLowerCase()
      if (allowedExts.includes(ext)) {
        if (f.size <= 20 * 1024 * 1024) { // 20MB per texture
          validFiles.push(f)
        } else {
          alert(`${f.name} quá lớn (tối đa 20MB)`)
        }
      } else {
        alert(`${f.name} không phải là file texture hợp lệ`)
      }
    })
    
    setTextureFiles(validFiles)
  }

  const toggleCat = (c) => setSelectedCats(p => p.includes(c) ? p.filter(x => x!==c) : [...p, c])

  const handleSubmit = async () => {
    if (!modelName || !imageFile || !modelFile || selectedCats.length === 0) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append("model_name", modelName)
      fd.append("tags", tags)
      fd.append("categories", JSON.stringify(selectedCats))
      fd.append("image", imageFile)
      fd.append("model", modelFile)
      
      // ✅ Upload .mtl nếu có
      if (mtlFile) {
        fd.append("mtl", mtlFile)
      }
      
      // ✅ THÊM: Upload texture files nếu có
      if (textureFiles.length > 0) {
        textureFiles.forEach(tex => {
          fd.append("textures", tex)  // Backend expects "textures" as array
        })
      }
      
      await api.post("/gallery/submit", fd, { headers: { "Content-Type":"multipart/form-data" } })
      setDone(true)
    } catch {
      setDone(true) // fallback
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.8)", backdropFilter:"blur(8px)" }} onClick={onClose}>
      <div style={{ background:"#111", border:"1px solid #1e1e1e", borderRadius:16, width:500, maxHeight:"90vh", overflowY:"auto", padding:28, position:"relative" }} onClick={e => e.stopPropagation()}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <span style={{ fontSize:16, fontWeight:600, color:"#fff" }}>Feature My Model</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:16 }}>✕</button>
        </div>

        {done ? (
          <div style={{ textAlign:"center", padding:"40px 0" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
            <div style={{ fontSize:16, color:"#fff", fontWeight:500, marginBottom:8 }}>Đã gửi thành công!</div>
            <div style={{ fontSize:13, color:"#555", marginBottom:24 }}>Model của bạn đang chờ admin duyệt</div>
            <button onClick={onClose} style={{ background:"#7c6ef5", color:"#fff", border:"none", borderRadius:99, padding:"10px 28px", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Đóng</button>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Model name */}
            <div>
              <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>Tên Model *</div>
              <input value={modelName} onChange={e => setModelName(e.target.value)} placeholder="Nhập tên model..." style={{ width:"100%", background:"#141414", border:"1px solid #222", borderRadius:8, padding:"10px 14px", color:"#ccc", fontSize:13, outline:"none", fontFamily:"'DM Sans',sans-serif", boxSizing:"border-box" }} />
            </div>



            {/* Categories */}
            <div>
              <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>Category * <span style={{ color:"#333" }}>(chọn nhiều)</span></div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {ALL_CATS.map(c => (
                  <button key={c} onClick={() => toggleCat(c)}
                    style={{ fontSize:11, padding:"5px 12px", borderRadius:99, border:`1px solid ${selectedCats.includes(c)?"#7c6ef5":"#1e1e1e"}`, background:selectedCats.includes(c)?"rgba(124,110,245,0.15)":"#141414", color:selectedCats.includes(c)?"#a89ff5":"#555", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s" }}
                  >{c}</button>
                ))}
              </div>
            </div>

            {/* Upload image */}
            <div>
              <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>Ảnh Preview *</div>
              <div style={{ height:140, border:`2px dashed ${errors.image?"#f87171":"#1e1e1e"}`, borderRadius:10, background:"#141414", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", overflow:"hidden", position:"relative" }}
                onClick={() => imageRef.current.click()}>
                <input ref={imageRef} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={e => handleImage(e.target.files[0])} />
                {imagePreview
                  ? <img src={imagePreview} alt="preview" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : <div style={{ textAlign:"center", color:"#333" }}><div style={{ fontSize:24, marginBottom:8 }}>🖼</div><div style={{ fontSize:12 }}>Click để chọn ảnh</div><div style={{ fontSize:11, color:"#2a2a2a", marginTop:4 }}>JPG, PNG, WEBP · tối đa {MAX_IMAGE_MB}MB</div></div>
                }
              </div>
              {errors.image && <div style={{ fontSize:11, color:"#f87171", marginTop:6 }}>⚠ {errors.image}</div>}
            </div>

            {/* Upload model file */}
            <div>
              <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>File 3D Model * <span style={{ color:"#333" }}>(GLB, OBJ, STL)</span></div>
              <div onClick={() => modelRef.current.click()}
                style={{ padding:"14px 16px", border:`2px dashed ${errors.model?"#f87171":"#1e1e1e"}`, borderRadius:10, background:"#141414", display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}
              >
                <input ref={modelRef} type="file" accept=".glb,.obj,.stl" hidden onChange={e => handleModel(e.target.files[0])} />
                <span style={{ fontSize:20 }}>📦</span>
                <div>
                  <div style={{ fontSize:13, color:modelFile?"#ccc":"#444" }}>{modelFile ? modelFile.name : "Click để chọn file 3D..."}</div>
                  {modelFile
                    ? <div style={{ fontSize:11, color:"#555", marginTop:2 }}>{(modelFile.size/1024/1024).toFixed(1)}MB</div>
                    : <div style={{ fontSize:11, color:"#2a2a2a", marginTop:2 }}>GLB, OBJ, STL · tối đa {MAX_MODEL_MB}MB</div>
                  }
                </div>
              </div>
              {errors.model && <div style={{ fontSize:11, color:"#f87171", marginTop:6 }}>⚠ {errors.model}</div>}
            </div>

            {/* Upload .mtl file - CHỈ HIỆN KHI CHỌN .OBJ */}
            {isObjFile && (
              <div>
                <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>
                  File Material (Optional) <span style={{ color:"#888" }}>(.mtl)</span>
                </div>
                <div 
                  onClick={() => mtlRef.current.click()}
                  style={{ 
                    padding:"14px 16px", 
                    border:"2px dashed #1e1e1e", 
                    borderRadius:10, 
                    background:"#141414", 
                    display:"flex", 
                    alignItems:"center", 
                    gap:12, 
                    cursor:"pointer" 
                  }}
                >
                  <input 
                    ref={mtlRef} 
                    type="file" 
                    accept=".mtl" 
                    hidden 
                    onChange={e => handleMtl(e.target.files[0])} 
                  />
                  <span style={{ fontSize:20 }}>🎨</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color: mtlFile ? "#ccc" : "#444" }}>
                      {mtlFile ? mtlFile.name : "Click để chọn file .mtl..."}
                    </div>
                    {mtlFile ? (
                      <div style={{ fontSize:11, color:"#555", marginTop:2 }}>
                        {(mtlFile.size/1024).toFixed(1)}KB
                      </div>
                    ) : (
                      <div style={{ fontSize:11, color:"#2a2a2a", marginTop:2 }}>
                        File material cho model .OBJ
                      </div>
                    )}
                  </div>
                  {mtlFile && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMtlFile(null)
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#888",
                        cursor: "pointer",
                        fontSize: 18
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Upload Texture files - CHỈ HIỆN KHI CHỌN .OBJ */}
            {isObjFile && (
              <div>
                <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>
                  Texture Images (Optional) <span style={{ color:"#888" }}>(JPG, PNG, ...)</span>
                </div>
                <div 
                  onClick={() => textureRef.current.click()}
                  style={{ 
                    padding:"14px 16px", 
                    border:"2px dashed #1e1e1e", 
                    borderRadius:10, 
                    background:"#141414", 
                    display:"flex", 
                    alignItems:"center", 
                    gap:12, 
                    cursor:"pointer" 
                  }}
                >
                  <input 
                    ref={textureRef} 
                    type="file" 
                    accept=".jpg,.jpeg,.png,.webp,.bmp,.tga"
                    multiple
                    hidden 
                    onChange={e => handleTextures(e.target.files)} 
                  />
                  <span style={{ fontSize:20 }}>🖼️</span>
                  <div style={{ flex:1 }}>
                    {textureFiles.length > 0 ? (
                      <>
                        <div style={{ fontSize:13, color:"#ccc" }}>
                          {textureFiles.length} file(s) đã chọn
                        </div>
                        <div style={{ fontSize:11, color:"#555", marginTop:2 }}>
                          {textureFiles.map(f => f.name).join(', ')}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize:13, color:"#444" }}>
                          Click để chọn texture images...
                        </div>
                        <div style={{ fontSize:11, color:"#2a2a2a", marginTop:2 }}>
                          Các file texture được tham chiếu trong .mtl · tối đa 20MB/file
                        </div>
                      </>
                    )}
                  </div>
                  {textureFiles.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setTextureFiles([])
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#888",
                        cursor: "pointer",
                        fontSize: 18
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={submitting || !modelName || !imageFile || !modelFile || selectedCats.length===0}
              style={{ padding:"12px 0", borderRadius:99, background:submitting||!modelName||!imageFile||!modelFile||selectedCats.length===0?"#1a1a1a":"linear-gradient(135deg,#7c6ef5,#5650cc)", color:submitting||!modelName||!imageFile||!modelFile||selectedCats.length===0?"#444":"#fff", fontSize:14, fontWeight:600, border:"none", cursor:submitting||!modelName||!imageFile||!modelFile||selectedCats.length===0?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.2s" }}
            >
              {submitting ? "Đang gửi..." : "Gửi lên Gallery"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


/* ─────────────────────────────────────────────
   VIEWER GIZMO  — sync với camera Three.js
───────────────────────────────────────────── */
function ViewerGizmo({ cameraQuatRef }) {
  const SIZE   = 56
  const C      = SIZE / 2
  const LEN    = 20

  const svgRef = useRef(null)
  const rafRef = useRef(null)

  // Xoay vector v bởi nghịch đảo quaternion q (q^-1 = [-x,-y,-z,w])
  function rotateByConjugate(v, q) {
    const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w
    const tx = 2*(qy*v[2] - qz*v[1])
    const ty = 2*(qz*v[0] - qx*v[2])
    const tz = 2*(qx*v[1] - qy*v[0])
    return [
      v[0] + qw*tx + qy*tz - qz*ty,
      v[1] + qw*ty + qz*tx - qx*tz,
      v[2] + qw*tz + qx*ty - qy*tx,
    ]
  }

  useEffect(() => {
    if (!cameraQuatRef) return
    const svg = svgRef.current
    if (!svg) return

    const AXES = [
      { id:"X", world:[1,0,0] },
      { id:"Y", world:[0,1,0] },
      { id:"Z", world:[0,0,-1] }, // Three.js: -Z đi vào màn hình
    ]

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      const q = cameraQuatRef.current

      // Sort axes by depth (z) để vẽ trục xa trước, gần sau
      const projected = AXES.map(({ id, world }) => {
        const r = rotateByConjugate(world, q)
        return { id, r, ex: C + r[0]*LEN, ey: C - r[1]*LEN }
      }).sort((a, b) => a.r[2] - b.r[2])

      projected.forEach(({ id, ex, ey, r }, i) => {
        const opacity = r[2] < -0.1 ? "0.35" : "1"   // trục bị che mờ đi
        const line   = svg.querySelector(`[data-gizmo="${id}-line"]`)
        const dot    = svg.querySelector(`[data-gizmo="${id}-dot"]`)
        const label  = svg.querySelector(`[data-gizmo="${id}-label"]`)
        if (line) {
          line.setAttribute("x2", ex); line.setAttribute("y2", ey)
          line.setAttribute("opacity", opacity)
        }
        if (dot) {
          dot.setAttribute("cx", ex); dot.setAttribute("cy", ey)
          dot.setAttribute("opacity", opacity)
        }
        if (label) {
          label.setAttribute("x", C + r[0]*(LEN+9))
          label.setAttribute("y", C - r[1]*(LEN+9) + 3)
          label.setAttribute("opacity", opacity)
        }
      })
    }
    loop()
    return () => cancelAnimationFrame(rafRef.current)
  }, [cameraQuatRef])

  const AXES_INIT = [
    { id:"X", color:"#e74c3c" },
    { id:"Y", color:"#2ecc71" },
    { id:"Z", color:"#3498db" },
  ]

  return (
    <svg ref={svgRef} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display:"block" }}>
      {AXES_INIT.map(({ id, color }) => (
        <g key={id}>
          <line
            data-gizmo={`${id}-line`}
            x1={C} y1={C} x2={C} y2={C}
            stroke={color} strokeWidth="2" strokeLinecap="round"
          />
          <circle data-gizmo={`${id}-dot`} cx={C} cy={C} r="4" fill={color} />
          <text data-gizmo={`${id}-label`} x={C} y={C}
            fill={color} fontSize="9" fontWeight="700" fontFamily="monospace"
          >{id}</text>
        </g>
      ))}
      <circle cx={C} cy={C} r="3" fill="#888" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   SKELETON
───────────────────────────────────────────── */
function SkeletonGrid() {
  const items = [200,260,220,280,200,240,270,210,250,230,200,260]
  return (
    <>
      <style>{`@keyframes skpulse{0%,100%{opacity:.8}50%{opacity:.3}}`}</style>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
        {items.map((h,i) => (
          <div key={i} style={{ breakInside:"avoid", marginBottom:10, borderRadius:12, height:h, background:"#111", border:"1px solid #161616", animation:`skpulse 1.6s ease-in-out ${i*0.07}s infinite` }} />
        ))}
      </div>
    </>
  )
}