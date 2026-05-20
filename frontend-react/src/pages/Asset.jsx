import { useEffect, useState, useRef } from "react"
import { Link } from "react-router-dom"
import api from "../services/api"
import { ModelModal } from "./Home"

const FILTERS = ["All", "Textured", "Untextured", "White Mesh", "Rigged"]

export default function History() {
  const [tab, setTab]               = useState("assets")   // "assets" | "collected"
  const [filter, setFilter]         = useState("All")
  const [jobs, setJobs]             = useState([])
  const [collected, setCollected]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [manageMode, setManageMode] = useState(null)        // null | "export" | "delete"
  const [selected, setSelected]     = useState([])
  const [showManageMenu, setShowManageMenu] = useState(false)
  const [selectedModel, setSelectedModel] = useState(null)
  const [loadingModel, setLoadingModel]   = useState(false)
  const menuRef = useRef()
  const isLoggedIn = !!localStorage.getItem("token")

  const openAssetModal = async (job) => {
    // Có submission_id → fetch full gallery data
    if (job.submission_id) {
      setLoadingModel(true)
      try {
        const res = await api.get(`/gallery/submission/${job.submission_id}`)
        const { uuid, model_name } = res.data
        const slug = `${(model_name || "model").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${uuid}`
        const full = await api.get(`/gallery/by-slug/${slug}`)
        setSelectedModel({
          ...full.data,
          front_image_url: job.front_image_url ?? null,
          left_image_url:  job.left_image_url  ?? null,
          right_image_url: job.right_image_url ?? null,
          back_image_url:  job.back_image_url  ?? null,
        })
        return
      } catch {}
      finally { setLoadingModel(false) }
    }
    // Không có submission_id → dùng trực tiếp dữ liệu job
    if (job.output_model_url || job.input_image_url) {
      // Stage 1 white mesh: dùng URL /white thay vì output_model_url
      const isWhite = job.job_stage === "shape"
      const modelUrl = isWhite
        ? `${import.meta.env.VITE_API_URL}/download/${job.job_id}/white`
        : (job.output_model_url ?? null)
      setSelectedModel({
        id: job.job_id,
        model_name: job.model_name || (isWhite ? "White Mesh" : "Model") + " · " + (job.job_id?.slice(0, 8) || ""),
        model_url: modelUrl,
        image_url: job.front_image_url ?? job.input_image_url ?? null,
        thumbnail_url: job.thumbnail_url ?? job.input_image_url ?? null,
        front_image_url: job.front_image_url ?? null,
        left_image_url:  job.left_image_url  ?? null,
        right_image_url: job.right_image_url ?? null,
        back_image_url:  job.back_image_url  ?? null,
        has_texture: job.has_texture ?? false,
        has_skeleton: job.has_skeleton ?? false,
        user: null,
        _privateAsset: true,
      })
    }
  }

  // Fetch my jobs
  useEffect(() => {
    setLoading(true)
    api.get("/my-jobs")
      .then(res => setJobs(res.data.jobs ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [])

  // Fetch collected models
  useEffect(() => {
    if (tab !== "collected") return
    setLoading(true)
    api.get("/gallery/collected")
      .then(res => setCollected(res.data.models ?? []))
      .catch(() => setCollected([]))
      .finally(() => setLoading(false))
  }, [tab])

  // Close manage menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowManageMenu(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Filter jobs
  // Stage 1 = white mesh: output_model_url chứa "/white" hoặc has_texture=false và không có submission_id
  const isWhiteMesh = (j) => j.job_stage === "shape"

  const filteredJobs = jobs.filter(j => {
    if (j.status !== "completed") return false
    if (filter === "White Mesh") return isWhiteMesh(j)
    if (filter === "All") return true
    if (filter === "Textured") return j.has_texture === true
    if (filter === "Untextured") return !isWhiteMesh(j) && j.has_texture === false
    if (filter === "Rigged") return j.has_skeleton === true
    return true
  })

  const displayList = tab === "assets" ? filteredJobs : collected
  const total = jobs.filter(j => j.status === "completed").length

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleBatchExport = async () => {
    for (const id of selected) {
      const job = jobs.find(j => j.job_id === id)
      if (!job?.output_model_url) continue
      const res = await fetch(job.output_model_url)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `${id}.glb`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    }
    setManageMode(null); setSelected([])
  }

  const handleBatchDelete = async () => {
    for (const id of selected) {
      try { await api.delete(`/my-jobs/${id}`) } catch {}
    }
    setJobs(prev => prev.filter(j => !selected.includes(j.job_id)))
    setManageMode(null); setSelected([])
  }

  return (
    <div style={{ minHeight:"100vh", background:"#080808", color:"#e0e0e0", fontFamily:"'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`@keyframes cardShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      <div style={{ maxWidth:1400, margin:"0 auto", padding:"48px 24px" }}>

        {/* ── Tabs ── */}
        <div style={{ display:"flex", justifyContent:"center", gap:32, marginBottom:32 }}>
          {[["assets","My Assets"],["collected","Collected"]].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setManageMode(null); setSelected([]) }}
              style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, fontWeight:600,
                color: tab===key ? "#fff" : "#555",
                borderBottom: tab===key ? "2px solid #fff" : "2px solid transparent",
                paddingBottom:6, fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s"
              }}
            >{label}</button>
          ))}
        </div>

        {/* ── Filter row + Manage ── */}
        {tab === "assets" && !manageMode && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
            {/* Filters */}
            <div style={{ display:"flex", gap:8 }}>
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 16px", borderRadius:99, fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s",
                    background: filter===f ? "#fff" : "transparent",
                    color: filter===f ? "#111" : "#555",
                    border: `1px solid ${filter===f ? "#fff" : "#2a2a2a"}`,
                  }}
                >
                  {f === "All" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                  )}
                  {f === "Textured" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                  )}
                  {f === "Untextured" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>
                  )}
                  {f === "Rigged" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="12" y1="13" x2="8" y2="17"/><line x1="12" y1="13" x2="16" y2="17"/><line x1="12" y1="10" x2="9" y2="13"/><line x1="12" y1="10" x2="15" y2="13"/></svg>
                  )}
                  {f}
                </button>
              ))}
            </div>

            {/* Manage button */}
            <div style={{ position:"relative" }} ref={menuRef}>
              <button onClick={() => setShowManageMenu(p => !p)}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 16px", borderRadius:99, background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#ccc", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Manage
              </button>
              {showManageMenu && (
                <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,0.5)", zIndex:50, width:160 }}>
                  <button onClick={() => { setManageMode("export"); setShowManageMenu(false) }}
                    style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"11px 16px", fontSize:13, color:"#ccc", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Batch Export
                  </button>
                  <div style={{ height:1, background:"#2a2a2a" }} />
                  <button onClick={() => { setManageMode("delete"); setShowManageMenu(false) }}
                    style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"11px 16px", fontSize:13, color:"#f87171", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    Batch Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Manage Mode Header ── */}
        {manageMode && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
            <div style={{ display:"flex", alignItems:"center", gap:16 }}>
              <span style={{ fontSize:16, fontWeight:600, color:"#fff" }}>
                Manage Assets
              </span>
              <span style={{ fontSize:13, color:"#555" }}>
                {selected.length} / {displayList.length}
              </span>
              {/* Progress bar */}
              <div style={{ width:120, height:4, background:"#1a1a1a", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${(selected.length/Math.max(displayList.length,1))*100}%`, background:"#7c6ef5", borderRadius:99, transition:"width 0.2s" }} />
              </div>
            </div>
            <button onClick={() => { setManageMode(null); setSelected([]) }}
              style={{ background:"none", border:"none", color:"#666", cursor:"pointer", fontSize:20 }}
            >✕</button>
          </div>
        )}

        {/* ── Content ── */}
        {loading ? (
          <SkeletonGrid />
        ) : displayList.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
            {displayList.map(item => {
              const id = item.job_id ?? item.id
              const thumbUrl = item.thumbnail_url ?? item.input_image_url ?? item.image_url
              const isSelected = selected.includes(id)
              const clickable = manageMode || tab === "collected" || !!(item.submission_id || item.output_model_url || item.input_image_url)
              return (
                <AssetCard
                  key={id}
                  item={item}
                  id={id}
                  thumbUrl={thumbUrl}
                  isSelected={isSelected}
                  clickable={clickable}
                  manageMode={manageMode}
                  tab={tab}
                  toggleSelect={toggleSelect}
                  setSelectedModel={setSelectedModel}
                  openAssetModal={openAssetModal}
                  api={api}
                  setJobs={setJobs}
                  setCollected={setCollected}
                />

              )
            })}
          </div>
        )}

        {/* ── Manage Action Button ── */}
        {manageMode && selected.length > 0 && (
          <div style={{ position:"fixed", bottom:32, right:32, zIndex:100 }}>
            {manageMode === "export" ? (
              <button onClick={handleBatchExport}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 24px", borderRadius:99, background:"linear-gradient(135deg,#f5c842,#e8a800)", color:"#111", fontSize:14, fontWeight:600, border:"none", cursor:"pointer", boxShadow:"0 8px 24px rgba(245,200,66,0.3)", fontFamily:"'DM Sans',sans-serif" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export ({selected.length})
              </button>
            ) : (
              <button onClick={handleBatchDelete}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 24px", borderRadius:99, background:"#1a1a1a", color:"#f87171", fontSize:14, fontWeight:600, border:"1px solid rgba(248,113,113,0.3)", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                Delete ({selected.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading overlay khi fetch submission */}
      {loadingModel && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
          <div style={{ width:36, height:36, border:"3px solid #333", borderTop:"3px solid #fff", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Modal xem model (assets và collected) */}
      {selectedModel && (
        <ModelModal
          model={selectedModel}
          onClose={() => setSelectedModel(null)}
          onSelect={setSelectedModel}
        />
      )}
    </div>
  )
}

/* ── Asset Card ── */
function AssetCard({ item, id, thumbUrl, isSelected, clickable, manageMode, tab,
                     toggleSelect, setSelectedModel, openAssetModal, api, setJobs, setCollected }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [hov, setHov] = useState(false)

  const handleClick = () => {
    if (manageMode) { toggleSelect(id); return }
    if (tab === "collected") { setSelectedModel(item); return }
    if (tab === "assets") openAssetModal(item)
  }

  return (
    <div
      style={{
        position: "relative", borderRadius: 14, overflow: "hidden",
        background: "#111",
        border: `1px solid ${isSelected ? "#7c6ef5" : hov ? "#333" : "#1a1a1a"}`,
        cursor: clickable ? "pointer" : "default",
        transition: "all 0.2s",
        transform: hov && clickable ? "translateY(-4px) scale(1.01)" : "none",
        boxShadow: hov && clickable ? "0 12px 40px rgba(0,0,0,0.6)" : "0 2px 8px rgba(0,0,0,0.4)",
      }}
      onClick={handleClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Thumbnail */}
      <div style={{
        aspectRatio: "1",
        background: "radial-gradient(ellipse at 50% 40%, #3a3a3a 0%, #1a1a1a 60%, #0d0d0d 100%)",
        position: "relative", overflow: "hidden",
      }}>
        {/* Shimmer while loading */}
        {!imgLoaded && (
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(110deg, #1a1a1a 30%, #252525 50%, #1a1a1a 70%)",
            backgroundSize: "200% 100%",
            animation: "cardShimmer 1.4s ease infinite",
          }} />
        )}

        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={item.model_name || ""}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            style={{
              width: "100%", height: "100%", objectFit: "cover", display: "block",
              opacity: imgLoaded ? 1 : 0,
              transition: "opacity 0.3s",
            }}
          />
        ) : (
          <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:40, opacity:0.2 }}>🗂</div>
        )}

        {/* Hover gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)",
          opacity: hov ? 1 : 0,
          transition: "opacity 0.2s",
          pointerEvents: "none",
        }} />

        {/* Model name on hover */}
        {hov && item.model_name && tab !== "collected" && (
          <div style={{
            position: "absolute", bottom: 8, left: 10, right: 10,
            fontSize: 11, color: "#eee", fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          }}>
            {item.model_name}
          </div>
        )}

        {/* Select checkbox in manage mode */}
        {manageMode && (
          <div style={{ position:"absolute", top:10, left:10, width:22, height:22, borderRadius:"50%", border:`2px solid ${isSelected ? "#7c6ef5" : "rgba(255,255,255,0.4)"}`, background:isSelected ? "#7c6ef5" : "rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>
            {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
        )}

        {/* Status badge */}
        {item.status && item.status !== "completed" && (
          <div style={{ position:"absolute", bottom:8, left:8, padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:500,
            background: item.status === "processing" ? "rgba(245,197,66,0.15)" : "rgba(248,113,113,0.15)",
            color: item.status === "processing" ? "#f5c842" : "#f87171",
            border: `1px solid ${item.status === "processing" ? "rgba(245,197,66,0.3)" : "rgba(248,113,113,0.3)"}`,
          }}>
            {item.status === "processing" ? "Processing" : "Failed"}
          </div>
        )}
      </div>

      {/* Info row */}
      <div style={{ padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", borderTop:"1px solid #1a1a1a", background:"#111" }}>
        <span style={{ fontSize:11, color:"#444", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {item.model_name || item.job_id?.slice(0,12) || "Model"}
        </span>
        {!manageMode && (
          <div style={{ display:"flex", alignItems:"center", gap:6 }} onClick={e => e.stopPropagation()}>
            {tab === "collected" && (
              <button
                onClick={async () => {
                  try {
                    await api.delete(`/gallery/${item.id}/collect`)
                    setCollected(prev => prev.filter(m => m.id !== item.id))
                  } catch {}
                }}
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color:"#f5c842", padding:0, lineHeight:1 }}
                title="Remove from collection"
              >★</button>
            )}
            {tab === "assets" && (
              <button
                onClick={async () => {
                  try {
                    await api.delete(`/job/${item.job_id}`)
                    setJobs(prev => prev.filter(j => j.job_id !== item.job_id))
                  } catch {}
                }}
                style={{ background:"none", border:"none", cursor:"pointer", padding:0, lineHeight:1, color:"#555", transition:"color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color="#f87171"}
                onMouseLeave={e => e.currentTarget.style.color="#555"}
                title="Delete"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Empty State ── */
function EmptyState({ tab }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"100px 0", gap:16 }}>
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
      <div style={{ fontSize:14, color:"#444", textAlign:"center", lineHeight:1.7 }}>
        {tab === "assets" ? "You have no assets at the moment" : "No collected models yet"}
        <br />
        {tab === "assets" ? "Go and generate one" : "Star models in the gallery to collect them"}
      </div>
      {tab === "assets" && (
        <Link to="/convert" style={{ padding:"10px 24px", borderRadius:99, background:"linear-gradient(135deg,#f5c842,#e8a800)", color:"#111", fontSize:13, fontWeight:600, textDecoration:"none", fontFamily:"'DM Sans',sans-serif" }}>
          Generate Model
        </Link>
      )}
    </div>
  )
}

/* ── Skeleton ── */
function SkeletonGrid() {
  return (
    <>
      <style>{`@keyframes skpulse{0%,100%{opacity:.6}50%{opacity:.2}}`}</style>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
        {Array(10).fill(0).map((_, i) => (
          <div key={i} style={{ borderRadius:14, aspectRatio:"1", background:"#111", border:"1px solid #1a1a1a", animation:`skpulse 1.6s ease-in-out ${i*0.07}s infinite` }} />
        ))}
      </div>
    </>
  )
}