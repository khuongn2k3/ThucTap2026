import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import ModelViewer3D from "../components/ModelViewer3D"
import AuthModal from "../components/AuthModal"
import api from "../services/api"
import { generateShapeMv, generateTextureMv, openJobSSE, unloadShapeMv } from "../services/api"

const STEPS = {
  IDLE:             "idle",
  S1_LOADING:       "s1_loading",
  S1_POLLING:       "s1_polling",
  S1_DONE:          "s1_done",
  S2_LOADING:       "s2_loading",
  S2_POLLING:       "s2_polling",
  DONE:             "done",
  ERROR:            "error",
}

// Export constants
const FORMATS  = ["GLB", "OBJ", "STL"]
const TEX_RES  = ["512", "1k", "2k", "4k"]

const BASE_VIEWS = [
  { key: "default", label: "Textured View" },
  { key: "solid",   label: "Solid View" },
]
const OVERLAY_STYLES = [
  { key: "unlit",    label: "Unlit" },
  { key: "normal",   label: "Normal" },
  { key: "cartoon",  label: "Cartoon Style" },
  { key: "sketch",   label: "Sketch Style" },
  { key: "hologram", label: "Hologram Style" },
]

// ────────────────────────────────────────────────────────────────────────────
// Toggle switch
function Toggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      style={{
        position: "relative", width: 44, height: 24,
        borderRadius: 12, border: "none", cursor: disabled ? "not-allowed" : "pointer",
        background: on ? "#3b82f6" : "#3a3a42",
        transition: "background .2s", flexShrink: 0, opacity: disabled ? 0.5 : 1,
        padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 22 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transition: "left .2s", display: "block",
      }} />
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Image upload slot — giống Tripo
function Slot({ label, file, onChange, disabled }) {
  const ref = useRef()
  const preview = useMemo(() => {
    if (!file) return null
    const url = URL.createObjectURL(file)
    return url
  }, [file])

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        onClick={() => !disabled && ref.current?.click()}
        style={{
          position: "relative", height: 72,
          borderRadius: 8, overflow: "hidden",
          border: file ? "1.5px solid #3b82f680" : "1.5px dashed #3a3a45",
          background: file ? "#1e1e26" : "#1a1a22",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4,
          opacity: disabled ? 0.5 : 1,
          transition: "border-color .15s",
        }}
        onMouseEnter={e => !disabled && !file && (e.currentTarget.style.borderColor="#5b5b70")}
        onMouseLeave={e => !disabled && !file && (e.currentTarget.style.borderColor="#3a3a45")}
      >
        <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => {
            const f = e.target.files[0]
            if (f && f.size > 20 * 1024 * 1024) { alert("Ảnh phải nhỏ hơn 20MB"); e.target.value = ""; return }
            onChange(f || null)
          }} disabled={disabled} />

        {preview ? (
          <img src={preview} alt={label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="none" stroke="#555" strokeWidth="1.5"
              style={{ width: 18, height: 18 }}>
              <path d="M2 13l4-4 3 3 3-4 4 5H2z" strokeLinejoin="round"/>
              <circle cx="6.5" cy="6.5" r="1.5"/>
              <rect x="1" y="1" width="18" height="18" rx="3"/>
            </svg>
            <span style={{ fontSize: 10, color: "#555", fontWeight: 600, letterSpacing: "0.05em" }}>
              {label.toUpperCase()}
            </span>
          </>
        )}

        {file && !disabled && (
          <button
            onClick={e => { e.stopPropagation(); onChange(null) }}
            style={{
              position: "absolute", top: 3, right: 3,
              background: "#000000aa", border: "none", borderRadius: 4,
              color: "#aaa", fontSize: 10, cursor: "pointer",
              padding: "1px 5px", lineHeight: 1.5,
            }}
          >✕</button>
        )}
      </div>
      <span style={{ fontSize: 10, color: "#666", textAlign: "center",
        fontWeight: 600, letterSpacing: "0.06em" }}>
        {label}
        {label === "Front" && <span style={{ color: "#f59e0b", marginLeft: 2 }}>*</span>}
      </span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ── Tooltip nhỏ khi hover dấu ? ─────────────────────────────────────────────
function Tooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5"
        style={{ width: 11, height: 11, cursor: "help" }}>
        <circle cx="8" cy="8" r="6"/><path d="M8 7v5M8 5.5v.5"/>
      </svg>
      {show && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)", width: 180, whiteSpace: "pre-line",
          background: "#1e1e28", border: "1px solid #303040",
          borderRadius: 8, padding: "8px 10px", fontSize: 11,
          color: "#aaa", lineHeight: 1.5, zIndex: 100, pointerEvents: "none",
        }}>
          {text}
        </div>
      )}
    </div>
  )
}

// ── Accordion section giống Tripo ────────────────────────────────────────────
function AccordionSection({ label, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderTop: "1px solid #252528" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "8px 0",
          background: "none", border: "none", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 12, color: "#888" }}>{label}</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5"
          style={{
            width: 12, height: 12,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .2s",
          }}>
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </button>
      {open && (
        <div style={{ paddingBottom: 8 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function Convert3D() {
  const [front, setFront]           = useState(null)
  const [right, setRight]           = useState(null)
  const [left,  setLeft]            = useState(null)
  const [back,  setBack]            = useState(null)
  const [withTexture, setWithTexture]   = useState(true)
  const [texture4k, setTexture4k]       = useState(false)
  const [quality, setQuality]           = useState("standard")
  const [polycount, setPolycount]       = useState(null)
  const [guidanceScale, setGuidanceScale] = useState(5.0)
  const [step, setStep]             = useState(STEPS.IDLE)
  const [shapeJobId,  setShapeJobId]    = useState(null)
  const [activeJobId, setActiveJobId]   = useState(null)
  const [currentJobId, setCurrentJobId] = useState(null)  // job_id của model đang xem trong viewer
  const [whiteUrl, setWhiteUrl]     = useState(null)
  const [texUrl,   setTexUrl]       = useState(null)
  const [texResolution, setTexResolution] = useState(null)
  const [error,    setError]        = useState(null)
  const [metrics,  setMetrics]      = useState(null)
  const [meshFaces,    setMeshFaces]    = useState(null)
  const [meshVertices, setMeshVertices] = useState(null)
  const [uploadedExt,  setUploadedExt]  = useState(null)
  const [baseView,     setBaseView]     = useState("default")
  const [overlayStyle, setOverlayStyle] = useState(null)
  const renderStyle = overlayStyle ?? baseView
  const [autoRot,  setAutoRot]      = useState(true)
  const [wire,     setWire]         = useState(false)
  const [shading,  setShading]      = useState("smooth")
  const [pbr,      setPbr]          = useState(true)
  const [metallic, setMetallic]     = useState(1)
  const [roughness,setRoughness]    = useState(1)
  const [environment, setEnvironment] = useState("studio")
  const [envStrength, setEnvStrength] = useState(1)
  const [envRotation, setEnvRotation] = useState(0)
  const [envAutoRotate, setEnvAutoRotate] = useState(false)
  const [showEnvSettings,  setShowEnvSettings]  = useState(false)
  const [showViewSettings, setShowViewSettings] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [collected, setCollected]   = useState(false)
  const [showShare, setShowShare]   = useState(false)
  const [submissionId, setSubmissionId] = useState(null)
  const [collectedModels, setCollectedModels] = useState([])
  const [elapsedSec, setElapsedSec] = useState(0)
  const [etaS1, setEtaS1] = useState(90)   // ETA Stage 1 từ backend (giây)
  const [etaS2, setEtaS2] = useState(90)   // ETA Stage 2 từ backend (giây)
  const stageStartRef = useRef(null)
  const timerRef = useRef(null)
  const collectPendingRef = useRef(false)

  // Fetch collected models once on mount
  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) return
    import("../services/api").then(({ default: apiMod }) => {
      apiMod.get("/gallery/collected")
        .then(res => setCollectedModels(res.data?.models || []))
        .catch(() => {})
    })
  }, [])
  const settingsRef = useRef(null)
  const sseRef = useRef(null)   // giữ EventSource hiện tại để có thể close

  const viewerSrc = texUrl || whiteUrl

  // Parse face/vertex count khi model thay đổi (giống Home.jsx)
  useEffect(() => {
    if (!viewerSrc) { setMeshFaces(null); setMeshVertices(null); setTexResolution(null); return }
    const url = viewerSrc
    const rawExt = url.split("?")[0].split(".").pop().toLowerCase()
    const ext = url.startsWith("blob:") ? (uploadedExt || rawExt) : rawExt
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => {
        if (ext === "glb") {
          const view = new DataView(buf)
          if (view.getUint32(0, true) !== 0x46546C67) return
          const jsonLen = view.getUint32(12, true)
          const json = JSON.parse(new TextDecoder().decode(buf.slice(20, 20 + jsonLen)))
          if (json.meshes && json.accessors) {
            let tv = 0, tf = 0
            json.meshes.forEach(mesh => {
              mesh.primitives?.forEach(prim => {
                if (prim.attributes?.POSITION !== undefined)
                  tv += json.accessors[prim.attributes.POSITION]?.count || 0
                if (prim.indices !== undefined)
                  tf += Math.floor((json.accessors[prim.indices]?.count || 0) / 3)
                else if (prim.attributes?.POSITION !== undefined)
                  tf += Math.floor((json.accessors[prim.attributes.POSITION]?.count || 0) / 3)
              })
            })
            if (tv > 0) setMeshVertices(tv)
            if (tf > 0) setMeshFaces(tf)
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
        } else if (ext === "obj") {
          const text = new TextDecoder().decode(buf)
          let vCount = 0, fTris = 0
          for (const line of text.split("\n")) {
            const t = line.trimStart()
            if (t.startsWith("v ")) vCount++
            else if (t.startsWith("f ")) fTris += Math.max(0, t.slice(2).trim().split(/\s+/).length - 2)
          }
          if (vCount > 0) setMeshVertices(vCount)
          if (fTris > 0) setMeshFaces(fTris)
        } else if (ext === "stl") {
          const isAscii = new TextDecoder("utf-8",{fatal:false}).decode(buf.slice(0,80)).trimStart().toLowerCase().startsWith("solid") && buf.byteLength < 500_000
          if (isAscii) {
            const fc = (new TextDecoder().decode(buf).match(/^\s*facet\s+normal/gm)||[]).length
            if (fc > 0) { setMeshFaces(fc); setMeshVertices(fc * 3) }
          } else if (buf.byteLength >= 84) {
            const fc = new DataView(buf).getUint32(80, true)
            if (fc > 0) { setMeshFaces(fc); setMeshVertices(fc * 3) }
          }
        }
      })
      .catch(() => {})
  }, [viewerSrc])
  const isRunning = [STEPS.S1_LOADING,STEPS.S1_POLLING,STEPS.S2_LOADING,STEPS.S2_POLLING].includes(step)

  // ── Elapsed timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      if (!stageStartRef.current) stageStartRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - stageStartRef.current) / 1000))
      }, 1000)
    } else {
      clearInterval(timerRef.current)
      if (step === STEPS.IDLE || step === STEPS.ERROR) {
        stageStartRef.current = null
        setElapsedSec(0)
      }
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning, step])

  // Ref để gọi clearUncollected trong RightPanel từ parent
  const clearUncollectedRef = useRef(null)
  const cameraQuatRef = useRef({ x:0, y:0, z:0, w:1 })

  const handleCollect = useCallback(async () => {
    if (!submissionId || collectPendingRef.current) return
    const isLoggedIn = !!localStorage.getItem("token")
    if (!isLoggedIn) { window.dispatchEvent(new CustomEvent("open-auth-modal")); return }
    collectPendingRef.current = true
    const next = !collected
    setCollected(next)
    try {
      const { default: apiMod } = await import("../services/api")
      await (next
        ? apiMod.post(`/gallery/${submissionId}/collect`)
        : apiMod.delete(`/gallery/${submissionId}/collect`)
      )
      // Không cập nhật collectedModels ngay — chỉ refresh khi chuyển tab hoặc reload
    } catch {
      setCollected(!next)
    } finally {
      collectPendingRef.current = false
    }
  }, [submissionId, collected])

  const frontPreviewUrl = useMemo(() => front ? URL.createObjectURL(front) : null, [front])
  useEffect(() => { return () => { if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl) } }, [frontPreviewUrl])

  const HDRI_ENVS = [
    { key: "studio",   label: "Studio" },
    { key: "beach",    label: "Beach" },
    { key: "desert",   label: "Desert" },
    { key: "forest",   label: "Forest" },
    { key: "interior", label: "Interior" },
    { key: "night",    label: "Night" },
  ]

  // Close settings panels on outside click
  useEffect(() => {
    if (!showEnvSettings && !showViewSettings) return
    const handler = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowEnvSettings(false)
        setShowViewSettings(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showEnvSettings, showViewSettings])

  // ── SSE helpers ──────────────────────────────────────────────────────────
  const stopSSE = useCallback(() => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
  }, [])

  const onErr = useCallback((msg) => {
    stopSSE(); setError(msg); setStep(STEPS.ERROR)
  }, [stopSSE])

  /**
   * Mở SSE stream cho 1 job và gọi onDone khi completed.
   * onDone(output_model_url, metrics, submission_id)
   */
  const doSSE = useCallback((jid, onDone) => {
    stopSSE()
    const es = openJobSSE(jid, {
      onProgress: (d) => {
        if (d.step === "start" && d.eta_seconds) {
          if (d.stage === "shape")   setEtaS1(d.eta_seconds)
          if (d.stage === "texture") setEtaS2(d.eta_seconds)
        }
        console.log(`[SSE progress] ${d.message}`)
      },
      onCompleted: (d) => {
        stopSSE()
        onDone(d.output_model_url, d.metrics, d.submission_id)
      },
      onFailed: (d) => {
        onErr(d.error || d.message || "Job failed")
      },
    })
    sseRef.current = es
  }, [onErr, stopSSE])

  const runStage2 = useCallback(async (sjid) => {
    if (!front) return
    setStep(STEPS.S2_LOADING)
    try {
      const fd = new FormData()
      fd.append("shape_job_id", sjid)
      fd.append("front", front)
      fd.append("texture_4k", texture4k ? "true" : "false")
      const r = await generateTextureMv(fd)
      setActiveJobId(r.data.job_id)
      setStep(STEPS.S2_POLLING)
      doSSE(r.data.job_id, (url, m, sid) => {
        setTexUrl(url); setMetrics(m); setActiveJobId(null); setStep(STEPS.DONE)
        setCurrentJobId(r.data.job_id)
        setSubmissionId(sid ?? null); setCollected(false)
      })
    } catch (e) { onErr(e.response?.data?.detail || "Stage 2 error") }
  }, [front, doSSE, onErr, texture4k])

  const handleGenerate = async () => {
    if (!front) return
    setError(null); setStep(STEPS.S1_LOADING)
    setWhiteUrl(null); setTexUrl(null); setMetrics(null); setSubmissionId(null); setCollected(false)
    stageStartRef.current = Date.now()
    setElapsedSec(0)
    try {
      const fd = new FormData()
      fd.append("front", front)
      if (front?.name) fd.append("model_name", front.name.replace(/\.[^/.]+$/, ""))
      if (left) fd.append("left", left)
      if (right) fd.append("right", right)
      if (back) fd.append("back", back)
      if (quality === "ultra") fd.append("octree_resolution", "450")
      if (polycount) fd.append("polycount", polycount)
      fd.append("guidance_scale", guidanceScale)
      const r = await generateShapeMv(fd)
      const jid = r.data.job_id
      setShapeJobId(jid); setActiveJobId(jid); setStep(STEPS.S1_POLLING)
      doSSE(jid, (url, m, sid) => {
        setWhiteUrl(url); setActiveJobId(null)
        setSubmissionId(sid ?? null); setCollected(false)
        if (withTexture) {
          setStep(STEPS.S1_DONE)
          runStage2(jid)
        } else {
          // Không cần texture → giải phóng VRAM ngay, chuyển thẳng sang DONE
          unloadShapeMv().catch(() => {})
          setMetrics(m)
          setCurrentJobId(jid)
          setStep(STEPS.DONE)
        }
      })
    } catch (e) { onErr(e.response?.data?.detail || "Stage 1 error") }
  }

  const handleReset = () => {
    stopSSE()
    clearInterval(timerRef.current)
    stageStartRef.current = null
    setElapsedSec(0)
    setFront(null); setLeft(null); setRight(null); setBack(null)
    setStep(STEPS.IDLE); setShapeJobId(null); setActiveJobId(null); setCurrentJobId(null)
    setWhiteUrl(null); setTexUrl(null); setError(null); setMetrics(null); setSubmissionId(null); setCollected(false)
    setPolycount(null)
    setGuidanceScale(5.0)
    setTexture4k(false)
  }

  // ── Progress & timer helpers ─────────────────────────────────────────────
  const EST_TOTAL = withTexture ? etaS1 + etaS2 : etaS1

  const getProgress = () => {
    if (step === STEPS.DONE) return 100
    if (step === STEPS.IDLE || step === STEPS.ERROR) return 0
    if ([STEPS.S1_LOADING, STEPS.S1_POLLING].includes(step)) {
      const pct = Math.min(elapsedSec / etaS1, 0.95)
      return withTexture ? pct * 50 : pct * 100
    }
    if ([STEPS.S2_LOADING, STEPS.S2_POLLING].includes(step)) {
      const pct = Math.min(elapsedSec / EST_TOTAL, 0.97)
      return Math.max(50, pct * 100)
    }
    return 0
  }

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m > 0 ? `${m}m ${s.toString().padStart(2,"0")}s` : `${s}s`
  }

  const getEstRemaining = () => {
    const remaining = Math.max(0, EST_TOTAL - elapsedSec)
    return remaining
  }

  const progress = getProgress()
  const estRemaining = getEstRemaining()

  // Status label
  const statusLabel = {
    [STEPS.S1_LOADING]: "Đang gửi ảnh...",
    [STEPS.S1_POLLING]: "Stage 1 — Đang tạo mesh...",
    [STEPS.S1_DONE]:    "Stage 1 hoàn tất",
    [STEPS.S2_LOADING]: "Đang bắt đầu texture...",
    [STEPS.S2_POLLING]: "Stage 2 — Đang sơn texture...",
    [STEPS.DONE]:       "Hoàn tất",
    [STEPS.ERROR]:      error,
  }[step]

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", height: "calc(100vh - 56px)",
      background: "#111114", color: "#e0e0e0",
      fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
      overflow: "hidden", fontSize: 13,
    }}>

      {/* ══ LEFT SIDEBAR ════════════════════════════════════════════════════ */}
      <aside style={{
        width: 232, flexShrink: 0, display: "flex", flexDirection: "column",
        background: "#1a1a1f", borderRight: "1px solid #252528",
        overflowY: "auto",
      }}>

        {/* Header */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #252528",
          display: "flex", alignItems: "center", gap: 6 }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="#60a5fa" strokeWidth="1.5"
            style={{ width: 14, height: 14, flexShrink: 0 }}>
            <path d="M10 2L2 7v6l8 5 8-5V7z"/>
          </svg>
          <span style={{ fontWeight: 600, fontSize: 13, color: "#e0e0e0" }}>Generate Model</span>
        </div>

        {/* Model type tabs */}
        <div style={{ padding: "10px 12px 0", display: "flex", gap: 6 }}>
          <button style={{
            flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 12,
            fontWeight: 600, border: "1.5px solid #3b82f6",
            background: "#3b82f615", color: "#60a5fa", cursor: "pointer",
          }}>HD Model</button>
        </div>

        <div style={{ padding: "12px 12px 0" }}>

          {/* Image slots grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <Slot label="Front" file={front} onChange={setFront} disabled={isRunning} />
            <Slot label="Left"  file={left}  onChange={setLeft}  disabled={isRunning} />
            <Slot label="Right" file={right} onChange={setRight} disabled={isRunning} />
            <Slot label="Back"  file={back}  onChange={setBack}  disabled={isRunning} />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#252528", margin: "4px 0 12px" }} />

          {/* Mesh Quality */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#aaa", fontWeight: 500 }}>Mesh Quality</span>
              <svg viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5"
                style={{ width: 12, height: 12 }}>
                <circle cx="8" cy="8" r="6"/><path d="M8 7v5M8 5.5v.5"/>
              </svg>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["Ultra","ultra"],["Standard","standard"]].map(([l,k]) => (
                <div key={k} style={{ flex: 1, position: "relative" }}
                  onMouseEnter={e => { if (k === "ultra") e.currentTarget.querySelector(".cs-tip").style.display = "block" }}
                  onMouseLeave={e => { if (k === "ultra") e.currentTarget.querySelector(".cs-tip").style.display = "none" }}
                >
                  <button
                    onClick={() => k !== "ultra" && !isRunning && setQuality(k)}
                    disabled={isRunning || k === "ultra"}
                    style={{
                      width: "100%", padding: "7px 0", borderRadius: 8,
                      fontSize: 12, fontWeight: 600, border: "1.5px solid",
                      borderColor: quality === k ? "#3b82f6" : "#303038",
                      background: quality === k ? "#3b82f610" : "transparent",
                      color: k === "ultra" ? "#444" : quality === k ? "#60a5fa" : "#666",
                      cursor: k === "ultra" ? "not-allowed" : isRunning ? "not-allowed" : "pointer",
                      opacity: isRunning ? 0.6 : 1,
                    }}
                  >{l}</button>
                  {k === "ultra" && (
                    <div className="cs-tip" style={{
                      display: "none", position: "absolute", bottom: "calc(100% + 6px)",
                      left: "50%", transform: "translateX(-50%)",
                      background: "#1e1e28", border: "1px solid #303040",
                      borderRadius: 7, padding: "5px 10px", fontSize: 10,
                      color: "#f59e0b", fontWeight: 600, whiteSpace: "nowrap",
                      zIndex: 100, pointerEvents: "none",
                    }}>Coming Soon</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Texture toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#aaa" }}>Texture</span>
            <Toggle on={withTexture} onChange={setWithTexture} disabled={isRunning} />
          </div>

          {/* Texture Settings accordion — chỉ hiện khi bật Texture */}
          {withTexture && (
            <AccordionSection label="Texture Settings" defaultOpen={false}>
              {/* 4K Texture */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#aaa" }}>4K Texture</span>
                  <Tooltip text="Upscale texture lên 4096px bằng Real-ESRGAN. Tốn thêm ~2-5 phút." />
                </div>
                <Toggle on={texture4k} onChange={setTexture4k} disabled={isRunning} />
              </div>
            </AccordionSection>
          )}

          {/* Topology Settings accordion */}
          <AccordionSection label="Topology Settings" defaultOpen={false}>

            {/* Polycount */}
            <div style={{ padding: "6px 0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#aaa" }}>Polycount</span>
                  <Tooltip text="Giảm số faces sau generate. Auto = giữ nguyên output pipeline." />
                </div>
                <span style={{ fontSize: 11, color: polycount ? "#60a5fa" : "#555",
                  fontFamily: "monospace", fontWeight: 600 }}>
                  {polycount ? polycount.toLocaleString() : "Auto"}
                </span>
              </div>
              <input type="range" min={1000} max={200000} step={1000}
                value={polycount ?? 200000} disabled={isRunning}
                onChange={e => { const v = parseInt(e.target.value); setPolycount(v >= 200000 ? null : v) }}
                style={{ width: "100%", accentColor: "#3b82f6", opacity: isRunning ? 0.4 : 1 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                <span style={{ fontSize: 9, color: "#444" }}>1K</span>
                <span style={{ fontSize: 9, color: "#555" }}>Auto (200K)</span>
              </div>
              {polycount && (
                <button onClick={() => setPolycount(null)} disabled={isRunning}
                  style={{ marginTop: 5, width: "100%", padding: "4px 0", borderRadius: 6,
                    border: "1px solid #303038", background: "transparent",
                    color: "#555", fontSize: 10, cursor: "pointer" }}>
                  Reset to Auto
                </button>
              )}
            </div>

            {/* Guidance Scale */}
            <div style={{ padding: "6px 0 4px", borderTop: "1px solid #252530" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#aaa" }}>Guidance Scale</span>
                  <Tooltip text={"Mức độ AI bám sát ảnh input.\nThấp = tự do hơn. Cao = bám sát ảnh."} />
                </div>
                <span style={{ fontSize: 11, color: "#60a5fa", fontFamily: "monospace", fontWeight: 600 }}>
                  {guidanceScale.toFixed(1)}
                </span>
              </div>
              <input type="range" min={1.0} max={10.0} step={0.5}
                value={guidanceScale} disabled={isRunning}
                onChange={e => setGuidanceScale(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#3b82f6", opacity: isRunning ? 0.4 : 1 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                <span style={{ fontSize: 9, color: "#444" }}>1.0</span>
                <span style={{ fontSize: 9, color: "#555" }}>5.0 default</span>
                <span style={{ fontSize: 9, color: "#444" }}>10.0</span>
              </div>
            </div>
          </AccordionSection>

          {/* AI Model */}
          <div style={{ marginTop: 4, marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 6 }}>AI Model</span>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#14141a", borderRadius: 8, padding: "8px 10px",
              border: "1px solid #252530",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6, background: "#3b82f615",
                  border: "1px solid #3b82f640", display: "flex", alignItems: "center",
                  justifyContent: "center",
                }}>
                  <svg viewBox="0 0 16 16" fill="#60a5fa" style={{ width: 12, height: 12 }}>
                    <path d="M8 2L2 7v7h4v-4h4v4h4V7z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#d0d0e0" }}>2mv Fast</div>
                  <div style={{ fontSize: 10, color: "#f59e0b" }}>Multiview mode</div>
                </div>
              </div>
              <svg viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5"
                style={{ width: 12, height: 12 }}>
                <path d="M4 6l4 4 4-4"/>
              </svg>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 10, padding: "8px 10px", borderRadius: 8,
              background: "#3f1515", border: "1px solid #6b2020",
              fontSize: 11, color: "#f87171",
            }}>
              ❌ Đã xảy ra lỗi, vui lòng thử lại sau.
            </div>
          )}

          {/* Generate / action button */}
          {(step === STEPS.IDLE || step === STEPS.ERROR) && (
            <button onClick={handleGenerate} disabled={!front}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
                background: front ? "#f59e0b" : "#2a2a1a",
                color: front ? "#1a1000" : "#555",
                fontSize: 13, fontWeight: 700, cursor: front ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background .15s",
              }}
            >
              Generate Model
              <span style={{
                background: front ? "#dc2626" : "#3a3a30",
                color: front ? "#fff" : "#555",
                borderRadius: "50%", width: 20, height: 20, fontSize: 10,
                fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {quality === "ultra" ? 50 : 25}
              </span>
            </button>
          )}





          {step === STEPS.DONE && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {whiteUrl && (
                <a href={whiteUrl} target="_blank" rel="noreferrer"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "7px 0", borderRadius: 8,
                    border: "1px solid #303038", background: "transparent",
                    color: "#666", fontSize: 11, textDecoration: "none",
                  }}>
                  ⬇ White Mesh
                </a>
              )}
              <button onClick={handleGenerate} disabled={!front}
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
                  background: front ? "#f59e0b" : "#2a2a1a",
                  color: front ? "#1a1000" : "#555",
                  fontSize: 13, fontWeight: 700, cursor: front ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "background .15s",
                }}
              >
                Generate Model
                <span style={{
                  background: front ? "#dc2626" : "#3a3a30",
                  color: front ? "#fff" : "#555",
                  borderRadius: "50%", width: 20, height: 20, fontSize: 10,
                  fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {quality === "ultra" ? 50 : 25}
                </span>
              </button>
            </div>
          )}

          {/* Metrics */}
          {metrics && (
            <div style={{
              marginTop: 10, padding: "10px 12px", borderRadius: 8,
              background: "#14141a", border: "1px solid #252530",
            }}>
              <div style={{ fontSize: 10, color: "#555", fontWeight: 600,
                letterSpacing: "0.08em", marginBottom: 6 }}>STATS</div>
              {[
                ["Time",       `${metrics.duration_minutes}m`],
                ["VRAM peak",  `${metrics.vram_peak_gb} GB`],
                ["RAM delta",  `+${metrics.ram_delta_gb} GB`],
              ].map(([l,v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between",
                  padding: "2px 0" }}>
                  <span style={{ fontSize: 11, color: "#555" }}>{l}</span>
                  <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg) } }
        `}</style>
      </aside>

      {/* ══ CENTER VIEWPORT ═══════════════════════════════════════════════ */}
      <main style={{ flex: 1, position: "relative", overflow: "hidden", background: "radial-gradient(ellipse at 50% 40%, #606060 0%, #505050 15%, #404040 28%, #303030 42%, #222222 57%, #171717 72%, #101010 86%, #0c0c0c 100%)" }}>

        {viewerSrc ? (
          <ModelViewer3D
            src={viewerSrc}
            style={renderStyle}
            autoRotate={autoRot}
            wireframe={wire}
            interactive={true}
            shading={shading}
            pbr={pbr}
            metallic={metallic}
            roughness={roughness}
            environment={environment}
            envStrength={envStrength}
            envRotation={envRotation}
            envAutoRotate={envAutoRotate}
            cameraQuatRef={cameraQuatRef}
          />
        ) : (
          /* Empty state */
          <div style={{
            height: "100%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 12,
          }}>
            <svg viewBox="0 0 80 80" fill="none" stroke="#2a2a35" strokeWidth="1"
              style={{ width: 100, height: 100 }}>
              <path d="M40 10L10 28v24l30 18 30-18V28z"/>
              <path d="M10 28l30 18 30-18M40 46v18"/>
            </svg>
            <p style={{ fontSize: 12, color: "#333" }}>
              Upload ảnh và nhấn Generate để xem mô hình 3D
            </p>
          </div>
        )}

        {/* TOP RIGHT: topology + gizmo + icon buttons */}
        <div ref={settingsRef} style={{ position: "absolute", top: 16, right: 16, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          {/* Row 1: Topology + Gizmo */}
          {viewerSrc && (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ textAlign: "right" }}>
                {[["Topology","Triangle"],["Faces", meshFaces != null ? meshFaces.toLocaleString() : "—"],["Vertices", meshVertices != null ? meshVertices.toLocaleString() : "—"]].map(([k,v]) => (
                  <div key={k} style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: "#555" }}>{k}</span>
                    <span style={{ fontSize: 12, color: "#ccc", fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
              <ViewerGizmo cameraQuatRef={cameraQuatRef} />
            </div>
          )}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "rgba(0,0,0,0.6)", border: "1px solid #2a2a2a", borderRadius: 10, overflow: "hidden" }}>
              {/* Environment */}
              <button title="Environment Settings"
                onClick={() => { setShowEnvSettings(p => !p); setShowViewSettings(false) }}
                style={{ width: 36, height: 36, background: showEnvSettings ? "rgba(59,130,246,0.25)" : "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: showEnvSettings ? "#60a5fa" : "#666", transition: "all 0.15s" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              </button>
              <div style={{ height: 1, background: "#222" }} />
              {/* View Settings */}
              <button title="View Settings"
                onClick={() => { setShowViewSettings(p => !p); setShowEnvSettings(false) }}
                style={{ width: 36, height: 36, background: showViewSettings ? "rgba(59,130,246,0.25)" : "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: showViewSettings ? "#60a5fa" : "#666", transition: "all 0.15s" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
                  <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>
                </svg>
              </button>
              <div style={{ height: 1, background: "#222" }} />
              {/* Wireframe */}
              <button title="Wireframe" onClick={() => setWire(p => !p)}
                style={{ width: 36, height: 36, background: wire ? "rgba(59,130,246,0.25)" : "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: wire ? "#60a5fa" : "#666", transition: "all 0.15s" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
              </button>
            </div>

            {/* Environment popup — ra bên trái */}
            {showEnvSettings && (
              <div style={{ position: "absolute", top: 0, right: 44, background: "#1a1a22", border: "1px solid #2a2a35", borderRadius: 12, padding: 16, width: 260, zIndex: 30 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>Environment</span>
                  <button onClick={() => setShowEnvSettings(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Surrounding</div>
                <div style={{ position: "relative", marginBottom: 14 }}>
                  <select value={environment} onChange={e => setEnvironment(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "#111", border: "1px solid #2a2a2a", color: "#ccc", fontSize: 13, cursor: "pointer", appearance: "none", outline: "none" }}>
                    {HDRI_ENVS.map(env => <option key={env.key} value={env.key}>{env.label}</option>)}
                  </select>
                  <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#555" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>Strength</span>
                    <span style={{ fontSize: 12, color: "#ccc", background: "#111", border: "1px solid #2a2a2a", borderRadius: 6, padding: "1px 8px", minWidth: 36, textAlign: "center" }}>{envStrength.toFixed(1)}</span>
                  </div>
                  <input type="range" min="0" max="3" step="0.1" value={envStrength} onChange={e => setEnvStrength(+e.target.value)} style={{ width: "100%", accentColor: "#3b82f6" }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>Rotation</span>
                    <span style={{ fontSize: 12, color: "#ccc", background: "#111", border: "1px solid #2a2a2a", borderRadius: 6, padding: "1px 8px", minWidth: 36, textAlign: "center" }}>{envRotation}</span>
                  </div>
                  <input type="range" min="0" max="360" step="1" value={envRotation} onChange={e => setEnvRotation(+e.target.value)} style={{ width: "100%", accentColor: "#3b82f6" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#ccc" }}>Auto Rotate</span>
                  <div onClick={() => setEnvAutoRotate(p => !p)} style={{ width: 36, height: 20, borderRadius: 99, background: envAutoRotate ? "#3b82f6" : "#2a2a2a", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: envAutoRotate ? 19 : 3, transition: "left 0.2s" }} />
                  </div>
                </div>
              </div>
            )}

            {/* View Settings popup — ra bên trái */}
            {showViewSettings && (
              <div style={{ position: "absolute", top: 37, right: 44, background: "#1a1a22", border: "1px solid #2a2a35", borderRadius: 12, padding: 20, width: 260, zIndex: 30 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>View Settings</span>
                  <button onClick={() => setShowViewSettings(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>Shading</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {["flat", "smooth"].map(s => (
                    <button key={s} onClick={() => setShading(s)}
                      style={{ flex: 1, padding: "8px 0", fontSize: 12, borderRadius: 8, border: "none", cursor: "pointer",
                        background: shading === s ? "#3b82f6" : "#2a2a2a",
                        color: shading === s ? "#fff" : "#888",
                        fontWeight: shading === s ? 600 : 400,
                      }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: "#ccc" }}>PBR</span>
                  <div onClick={() => setPbr(p => !p)} style={{ width: 36, height: 20, borderRadius: 99, background: pbr ? "#3b82f6" : "#2a2a2a", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: pbr ? 19 : 3, transition: "left 0.2s" }} />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>Metallic</span><span style={{ fontSize: 12, color: "#ccc" }}>{metallic.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={metallic} onChange={e => setMetallic(+e.target.value)} style={{ width: "100%", accentColor: "#3b82f6" }} />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>Roughness</span><span style={{ fontSize: 12, color: "#ccc" }}>{roughness.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={roughness} onChange={e => setRoughness(+e.target.value)} style={{ width: "100%", accentColor: "#3b82f6" }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM CENTER: 2 rows giống Home.jsx */}
        <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>

          {/* Generating status */}
          {isRunning && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: "#e0e0e0", letterSpacing: "0.02em" }}>
                Generating...
              </span>
              <div style={{ width: 200, height: 2, borderRadius: 99, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 99,
                  width: `${progress}%`,
                  background: "#ffffff",
                  transition: "width 0.8s ease",
                }} />
              </div>
            </div>
          )}

          {/* Row 1: view modes */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.75)", borderRadius: 99, padding: "7px 14px", border: "1px solid #2a2a2a", flexWrap: "nowrap" }}>
            {BASE_VIEWS.map(s => (
              <button key={s.key} onClick={() => { setBaseView(s.key); if (s.key === "solid") setOverlayStyle(null) }}
                style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, whiteSpace: "nowrap", cursor: "pointer",
                  border: `1px solid ${s.key === "solid" ? (baseView === "solid" ? "#3b82f6" : "transparent") : (baseView === "default" || overlayStyle) ? "#3b82f6" : "transparent"}`,
                  background: s.key === "solid" ? (baseView === "solid" ? "rgba(59,130,246,0.2)" : "none") : (baseView === "default" || overlayStyle) ? "rgba(59,130,246,0.2)" : "none",
                  color: s.key === "solid" ? (baseView === "solid" ? "#60a5fa" : "#555") : (baseView === "default" || overlayStyle) ? "#60a5fa" : "#555",
                  transition: "all 0.15s",
                }}>{s.label}</button>
            ))}
            <div style={{ width: 1, height: 14, background: "#2a2a2a", margin: "0 4px" }} />
            {OVERLAY_STYLES.map(s => (
              <button key={s.key} onClick={() => { setBaseView("default"); setOverlayStyle(p => p === s.key ? null : s.key) }}
                style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, whiteSpace: "nowrap", cursor: "pointer",
                  border: `1px solid ${overlayStyle === s.key ? "#3b82f6" : "transparent"}`,
                  background: overlayStyle === s.key ? "rgba(59,130,246,0.2)" : "none",
                  color: overlayStyle === s.key ? "#60a5fa" : "#555",
                  transition: "all 0.15s",
                }}>{s.label}</button>
            ))}
          </div>

          {/* Row 2: collect, share, auto-rotate, export */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={handleCollect} title="Collect"
              style={{ background: "none", border: "none", cursor: submissionId ? "pointer" : "not-allowed", fontSize: 20, color: collected ? "#f5c842" : "#555", opacity: submissionId ? 1 : 0.3, transition: "color 0.2s, opacity 0.2s" }}
            >★</button>

            <button onClick={() => submissionId && setShowShare(p => !p)} title="Share"
              style={{ background: "none", border: "none", cursor: submissionId ? "pointer" : "not-allowed", fontSize: 16, color: showShare ? "#7c6ef5" : "#555", opacity: submissionId ? 1 : 0.3, transition: "color 0.2s, opacity 0.2s" }}
            >↗</button>

            <button onClick={() => setAutoRot(p => !p)} title={autoRot ? "Dừng xoay" : "Xoay tự động"}
              style={{ background: autoRot ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${autoRot ? "rgba(59,130,246,0.4)" : "#2a2a2a"}`, borderRadius: 99, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", transition: "all 0.2s" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={autoRot ? "#60a5fa" : "#555"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {autoRot
                  ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                  : <polygon points="5,3 19,12 5,21"/>
                }
              </svg>
              <span style={{ fontSize: 11, color: autoRot ? "#60a5fa" : "#555" }}>{autoRot ? "Pause" : "Play"}</span>
            </button>

            <button onClick={() => viewerSrc && setShowExport(true)} disabled={!viewerSrc}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 99, border: "1px solid #f5c842", background: viewerSrc ? "linear-gradient(135deg,#f5c842,#e8a800)" : "rgba(0,0,0,0.4)", color: viewerSrc ? "#111" : "#444", fontSize: 12, fontWeight: 500, cursor: viewerSrc ? "pointer" : "not-allowed", fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s" }}>
              <span>⬇</span>
              <span>Export</span>
            </button>
          </div>

          {showShare && submissionId && (
            <ConvertSharePopup submissionId={submissionId} onClose={() => setShowShare(false)} />
          )}

          {showExport && viewerSrc && (
            <ConvertExportModal 
              modelUrl={viewerSrc} 
              modelName={front?.name?.split('.')[0] || "model"}
              submissionId={submissionId}
              jobId={currentJobId}
              hasSkeleton={false}
              texResolution={texResolution}
              onClose={() => setShowExport(false)} 
            />
          )}
        </div>
      </main>

      {/* ══ RIGHT PANEL — Assets ═══════════════════════════════════════════ */}
      <RightPanel
        viewerSrc={viewerSrc}
        collectedModels={collectedModels}
        setCollectedModels={setCollectedModels}
        currentSubmissionId={submissionId}
        viewerCollected={collected}
        registerClearUncollected={fn => { clearUncollectedRef.current = fn }}
        onCollectedChange={(id, isCollected) => {
          if (id === submissionId) setCollected(isCollected)
        }}
        isGenerating={isRunning}
        countdown={estRemaining}
        refreshTrigger={step === STEPS.DONE ? submissionId : null}
        onSelectModel={({ model_url, id, jobId, isCollected, ext }) => {
          setTexUrl(model_url)
          setWhiteUrl(null)
          setStep(STEPS.DONE)
          setMetrics(null)
          setSubmissionId(id)
          setCurrentJobId(jobId ?? null)
          setCollected(isCollected ?? true)
          setUploadedExt(ext || null)
        }}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// FILTER PANEL
// ════════════════════════════════════════════════════════════════════════════
function FilterPanel({ filterType, setFilterType, onClose }) {
  const TYPES = [
    {
      key: "textured",
      label: "Textured",
      icon: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{width:11,height:11}}><path d="M2 4l3-2 2 3 2-3 3 2v6l-3 2-2-3-2 3-3-2z"/></svg>,
    },
    {
      key: "untextured",
      label: "Untextured",
      icon: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{width:11,height:11}}><path d="M7 2L2 5v4l5 3 5-3V5z"/></svg>,
    },
    {
      key: "rigged",
      label: "Rigged",
      icon: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{width:11,height:11}}><circle cx="7" cy="2" r="1.2"/><circle cx="7" cy="12" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="12" cy="7" r="1.2"/><path d="M7 3.2v5.6M3.2 7h7.6"/></svg>,
    },
  ]

  return (
    <div style={{ padding: "4px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#d0d0e0" }}>Filter</span>
        <div style={{ display: "flex", gap: 2 }}>
          {/* Reset */}
          <button onClick={() => setFilterType("all")} title="Reset" style={{
            width: 24, height: 24, borderRadius: 5, border: "none",
            background: "transparent", color: "#555", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 11, height: 11 }}>
              <path d="M13 8A5 5 0 1 1 8 3h3M11 1v4H7"/>
            </svg>
          </button>
          {/* Close */}
          <button onClick={onClose} title="Close" style={{
            width: 24, height: 24, borderRadius: 5, border: "none",
            background: "transparent", color: "#555", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 10, height: 10 }}>
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Model Type label */}
      <div style={{ fontSize: 10, color: "#555", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 8 }}>
        MODEL TYPE
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/* All — pill shape */}
        <div>
          <button onClick={() => setFilterType("all")} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 20, border: "1.5px solid",
            borderColor: filterType === "all" ? "#3b82f6" : "#2a2a35",
            background: filterType === "all" ? "#3b82f620" : "transparent",
            color: filterType === "all" ? "#60a5fa" : "#666",
            fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{width:11,height:11}}>
              <circle cx="7" cy="7" r="5"/>
              <path d="M2 7h10M7 2c-1.5 2-1.5 8 0 10M7 2c1.5 2 1.5 8 0 10"/>
            </svg>
            All
          </button>
        </div>

        {/* Textured / Untextured / Rigged */}
        {TYPES.map(f => (
          <button key={f.key} onClick={() => setFilterType(f.key)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 12px", borderRadius: 10, border: "1.5px solid",
            borderColor: filterType === f.key ? "#3b82f6" : "#2a2a35",
            background: filterType === f.key ? "#3b82f620" : "transparent",
            color: filterType === f.key ? "#60a5fa" : "#666",
            fontSize: 11, fontWeight: 600, cursor: "pointer", width: "100%",
          }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// RIGHT PANEL — Assets
// ════════════════════════════════════════════════════════════════════════════
function RightPanel({ viewerSrc, onSelectModel, collectedModels, setCollectedModels, currentSubmissionId, viewerCollected, onCollectedChange, registerClearUncollected, isGenerating, countdown, refreshTrigger }) {
  const isLoggedIn = !!localStorage.getItem("token")
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("grid")
  const [showAuth, setShowAuth] = useState(false)
  const [mainTab, setMainTab] = useState("assets")
  const [filterType, setFilterType] = useState("all")
  const uploadRef = useRef(null)

  const handleUpload3D = async (file) => {
    if (!file) return
    const ext = file.name.split(".").pop().toLowerCase()
    if (!["glb","stl"].includes(ext)) return
    if (file.size > 35 * 1024 * 1024) { alert("File quá lớn, tối đa 35MB"); return }
    try {
      const { default: api } = await import("../services/api")
      const fd = new FormData()
      fd.append("model", file)
      const r = await api.post("/my-jobs/upload-model", fd)
      const { output_model_url, job_id } = r.data
      if (onSelectModel) onSelectModel({ model_url: output_model_url, id: null, jobId: job_id, isCollected: false, ext })
      setJobs(prev => [{
        job_id, status: "completed", input_image_url: "",
        output_model_url, has_texture: false, has_skeleton: false,
        created_at: new Date().toISOString()
      }, ...prev])
    } catch { alert("Upload thất bại") }
  }
  // Track uncollected IDs locally — card stays visible until tab switch / reload
  const [uncollectedIds, setUncollectedIds] = useState(new Set())
  const [openMenuId, setOpenMenuId] = useState(null)

  const handleDeleteJob = async (jobId) => {
    try {
      const { default: api } = await import("../services/api")
      await api.delete(`/my-jobs/${jobId}`)
      setJobs(prev => prev.filter(j => j.job_id !== jobId))
    } catch {}
    setOpenMenuId(null)
  }

  const handleDeleteCollected = async (modelId) => {
    try {
      const { default: api } = await import("../services/api")
      await api.delete(`/gallery/${modelId}/collect`)
      setCollectedModels(prev => prev.filter(m => m.id !== modelId))
    } catch {}
    setOpenMenuId(null)
  }

  // Đăng ký hàm clearUncollected với parent để viewer có thể gọi khi re-collect
  useEffect(() => {
    if (registerClearUncollected) {
      registerClearUncollected((id) => {
        setUncollectedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      })
    }
  }, [registerClearUncollected])

  // Sync uncollectedIds khi viewer thay đổi trạng thái collect
  useEffect(() => {
    if (!currentSubmissionId) return
    if (viewerCollected === false) {
      setUncollectedIds(prev => new Set([...prev, currentSubmissionId]))
    } else if (viewerCollected === true) {
      setUncollectedIds(prev => { const s = new Set(prev); s.delete(currentSubmissionId); return s })
    }
  }, [viewerCollected, currentSubmissionId])

  // Re-fetch collected models when switching TO star tab (clears pending uncollects)
  const prevTab = useRef(activeTab)
  useEffect(() => {
    if (activeTab === "star" && prevTab.current !== "star" && isLoggedIn) {
      setUncollectedIds(new Set())
      import("../services/api").then(({ default: apiMod }) => {
        apiMod.get("/gallery/collected")
          .then(res => setCollectedModels(res.data?.models || []))
          .catch(() => {})
      })
    }
    prevTab.current = activeTab
  }, [activeTab, isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return
    setLoading(true)
    import("../services/api").then(({ default: api }) => {
      api.get("/my-jobs")
        .then(r => setJobs(r.data.jobs ?? []))
        .catch(() => setJobs([]))
        .finally(() => setLoading(false))
    })
  }, [isLoggedIn])

  // Re-fetch khi generate xong
  useEffect(() => {
    if (!refreshTrigger || !isLoggedIn) return
    import("../services/api").then(({ default: api }) => {
      api.get("/my-jobs")
        .then(r => setJobs(r.data.jobs ?? []))
        .catch(() => {})
    })
  }, [refreshTrigger, isLoggedIn])

  const completed = jobs.filter(j => {
    if (filterType === "all") return j.status === "completed"
    if (filterType === "textured") return j.status === "completed" && j.has_texture
    if (filterType === "untextured") return j.status === "completed" && !j.has_texture
    if (filterType === "rigged") return j.status === "completed" && j.has_skeleton
    return j.status === "completed"
  })

  // Đóng filter khi click ra ngoài
  const filterRef = useRef(null)
  useEffect(() => {
    if (activeTab !== "filter") return
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setActiveTab("grid")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [activeTab])

  return (
    <aside style={{
      width: 220, flexShrink: 0, display: "flex", flexDirection: "column",
      background: "#17171b", borderLeft: "1px solid #252528",
      fontSize: 12,
    }}>

      {/* Header — row 1: Assets / Property / History tabs */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "6px 8px", borderBottom: "1px solid #1e1e24", gap: 2,
      }}>
        {[
          { key: "assets",   label: "Assets" },
          { key: "property", label: "Property" },
          { key: "history",  label: "History" },
        ].map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)}
            style={{
              flex: 1, padding: "5px 0", borderRadius: 7, border: "none",
              background: mainTab === t.key ? "#252530" : "transparent",
              color: mainTab === t.key ? "#d0d0e0" : "#555",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
              transition: "background .15s, color .15s",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Header — row 2: grid / star / filter tabs */}
      <div ref={filterRef} style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "4px 10px", borderBottom: "1px solid #252528",
        position: "relative",
      }}>
        {[
          { key: "grid",   icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:11,height:11}}><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> },
          { key: "star",   icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:11,height:11}}><path d="M8 2l1.5 3.5L13 6l-2.5 2.5.5 3.5L8 10.5 5 12l.5-3.5L3 6l3.5-.5z"/></svg> },
          { key: "filter", icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:11,height:11}}><path d="M2 4h12M5 8h6M7 12h2"/></svg> },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key === "filter" ? (activeTab === "filter" ? "grid" : "filter") : t.key)}
            style={{
              width: 24, height: 24, borderRadius: 5, border: "none",
              background: activeTab === t.key ? "#252530" : "transparent",
              color: activeTab === t.key ? "#a0a0c0" : "#555",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            {t.icon}
          </button>
        ))}

        {/* Filter dropdown popup */}
        {activeTab === "filter" && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", right: 4,
            width: 200, zIndex: 200,
            background: "#1e1e26", border: "1px solid #2a2a38",
            borderRadius: 12, padding: "12px 12px",
            boxShadow: "0 8px 32px #00000080",
          }}>
            <FilterPanel
              filterType={filterType}
              setFilterType={setFilterType}
              onClose={() => setActiveTab("grid")}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>

        {!isLoggedIn ? (
          /* Not logged in state */
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              onClick={() => setShowAuth(true)}
              style={{
                border: "1.5px dashed #303038", borderRadius: 10,
                padding: "16px 8px", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 6, cursor: "pointer",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor="#4a4a58"}
              onMouseLeave={e => e.currentTarget.style.borderColor="#303038"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5"
                style={{ width: 22, height: 22 }}>
                <path d="M12 4v16M4 12h16"/>
              </svg>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Upload 3D Model</span>
              <span style={{ fontSize: 9, color: "#444", textAlign: "center", lineHeight: 1.4 }}>
                GLB, STL{"\n"}≤35MB
              </span>
            </div>
            {[0,1].map(i => (
              <div key={i} style={{
                borderRadius: 10, overflow: "hidden",
                background: "#14141a", border: "1px solid #1e1e24",
                opacity: 0.4,
              }}>
                <div style={{ aspectRatio: "1", background: "#1a1a22" }} />
                <div style={{ height: 28 }} />
              </div>
            ))}
          </div>
        ) : loading ? (
          /* Loading skeleton */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {Array(4).fill(0).map((_, i) => (
              <div key={i} style={{
                borderRadius: 8, aspectRatio: "1",
                background: "#1a1a22", border: "1px solid #1e1e24",
                animation: "skpulse 1.6s ease-in-out infinite",
              }} />
            ))}
          </div>
        ) : (
          /* Content grid */
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

            {/* ── Grid tab: chỉ hiện Assets (jobs đã generate) ── */}
            {activeTab === "grid" ? (
              completed.length === 0 && !isGenerating ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    onClick={() => uploadRef.current?.click()}
                    style={{ border: "1.5px dashed #303038", borderRadius: 10, padding: "16px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor="#4a4a58"}
                    onMouseLeave={e => e.currentTarget.style.borderColor="#303038"}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" style={{ width: 22, height: 22 }}><path d="M12 4v16M4 12h16"/></svg>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Upload 3D Model</span>
                    <span style={{ fontSize: 9, color: "#444", textAlign: "center", lineHeight: 1.4 }}>GLB, STL{"\n"}≤35MB</span>
                  </div>
                  <p style={{ fontSize: 11, color: "#444", textAlign: "center", margin: "8px 0" }}>No models yet. Generate one!</p>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {/* Upload card */}
                    <div
                      onClick={() => uploadRef.current?.click()}
                      style={{ borderRadius: 8, overflow: "hidden", background: "#0d0d14", border: "1.5px dashed #303038", aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor="#4a4a58"}
                      onMouseLeave={e => e.currentTarget.style.borderColor="#303038"}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" style={{ width: 18, height: 18 }}><path d="M12 4v16M4 12h16"/></svg>
                      <span style={{ fontSize: 9, color: "#555", fontWeight: 600 }}>Upload</span>
                    </div>
                    {/* Generating card */}
                    {isGenerating && (
                      <div style={{
                        borderRadius: 8, overflow: "hidden",
                        background: "#0d1117", border: "1px solid #252530",
                        aspectRatio: "1", display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 6,
                        position: "relative",
                      }}>
                        {/* Pulsing dot */}
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: "#3b82f6",
                          animation: "genpulse 1.2s ease-in-out infinite",
                        }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#d0d0e0" }}>Generating...</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>
                          {countdown}s
                        </span>
                      </div>
                    )}
                    {completed.slice(0, 20).map(job => (
                      <div key={job.job_id}
                        onClick={() => { if (job.output_model_url && onSelectModel) onSelectModel({ model_url: job.output_model_url, id: job.submission_id ?? null, jobId: job.job_id, isCollected: false }) }}
                        style={{
                        borderRadius: 8, overflow: "hidden",
                        background: "#1a1a22", border: "1px solid #1e1e24",
                        cursor: "pointer", position: "relative",
                        outline: viewerSrc && job.output_model_url === viewerSrc ? "1.5px solid #3b82f6" : "none",
                      }}
                        onMouseEnter={e => e.currentTarget.style.borderColor="#303040"}
                        onMouseLeave={e => e.currentTarget.style.borderColor="#1e1e24"}
                      >
                        <div style={{ aspectRatio: "1", position: "relative", overflow: "hidden" }}>
                          {job.input_image_url ? (
                            <img src={job.input_image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1" style={{ width: 24, height: 24 }}>
                                <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"/>
                              </svg>
                            </div>
                          )}
                          {job.has_texture && (
                            <div style={{ position: "absolute", bottom: 3, right: 3, background: "#3b82f630", borderRadius: 4, padding: "1px 4px", fontSize: 8, color: "#60a5fa", fontWeight: 600 }}>TEX</div>
                          )}
                          <button style={{ position: "absolute", bottom: 3, left: 3, width: 16, height: 16, borderRadius: "50%", background: "#00000080", border: "none", color: "#888", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === job.job_id ? null : job.job_id) }}
                          >···</button>
                          {openMenuId === job.job_id && (
                            <div onClick={e => e.stopPropagation()} style={{ position: "absolute", bottom: 22, left: 3, background: "#1e1e28", border: "1px solid #303040", borderRadius: 8, zIndex: 10, minWidth: 110, boxShadow: "0 4px 16px #00000080" }}>
                              <button onClick={() => handleDeleteJob(job.job_id)} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 12px", background: "none", border: "none", color: "#f87171", fontSize: 12, cursor: "pointer", borderRadius: 8 }}>
                                🗑 Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : activeTab === "star" ? (
              /* ── Star tab: chỉ hiện Collected Models ── */
              collectedModels.length === 0 ? (
                <p style={{ fontSize: 11, color: "#444", textAlign: "center", margin: "24px 0" }}>
                  No collected models yet.
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {collectedModels.slice(0, 20).map(model => (
                    <div
                      key={model.id}
                      onClick={() => { if (model.model_url && onSelectModel) onSelectModel({ model_url: model.model_url, id: model.id, isCollected: !uncollectedIds.has(model.id) }) }}
                      className="collected-card"
                      style={{
                        borderRadius: 8, overflow: "hidden",
                        background: "#1a1a22", border: "1px solid #1e1e24",
                        cursor: model.model_url ? "pointer" : "default", position: "relative",
                        outline: viewerSrc && model.model_url === viewerSrc ? "1.5px solid #f5c842" : "none",
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor="#303040"}
                      onMouseLeave={e => e.currentTarget.style.borderColor="#1e1e24"}
                    >
                      <div style={{ aspectRatio: "1", position: "relative", overflow: "hidden" }}>
                        {model.thumbnail_url || model.image_url ? (
                          <img src={model.thumbnail_url || model.image_url} alt={model.model_name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1" style={{ width: 24, height: 24 }}>
                              <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"/>
                            </svg>
                          </div>
                        )}
                        <button
                          className="star-btn"
                          onClick={async (e) => {
                            e.stopPropagation()
                            const isUncollected = uncollectedIds.has(model.id)
                            try {
                              if (isUncollected) {
                                // Re-collect
                                await api.post(`/gallery/${model.id}/collect`)
                                setUncollectedIds(prev => { const s = new Set(prev); s.delete(model.id); return s })
                                if (onCollectedChange) onCollectedChange(model.id, true)
                              } else {
                                // Uncollect — card stays, chỉ đổi màu sao
                                await api.delete(`/gallery/${model.id}/collect`)
                                setUncollectedIds(prev => new Set([...prev, model.id]))
                                if (onCollectedChange) onCollectedChange(model.id, false)
                              }
                            } catch {}
                          }}
                          title={uncollectedIds.has(model.id) ? "Collect lại" : "Bỏ khỏi collection"}
                          style={{ position: "absolute", top: 4, right: 4, background: "none", border: "none", fontSize: 14, color: uncollectedIds.has(model.id) ? "#444" : "#f5c842", cursor: "pointer", padding: 0, lineHeight: 1, opacity: 0, transition: "opacity 0.15s, color 0.2s" }}
                        >★</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : activeTab === "history" ? (
              jobs.length === 0 ? (
                <p style={{ fontSize: 11, color: "#444", textAlign: "center", margin: "24px 0" }}>
                  No history yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {jobs.map((job, idx) => (
                    <div key={job.job_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, background: "#14141a", border: "1px solid #1e1e24" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "#555", fontWeight: 600, minWidth: 24 }}>#{jobs.length - idx}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          background: job.status === "completed" ? "#14532d" : job.status === "failed" ? "#3f1515" : job.status === "processing" ? "#1e3a5f" : "#2a2a2a",
                          color: job.status === "completed" ? "#4ade80" : job.status === "failed" ? "#f87171" : job.status === "processing" ? "#60a5fa" : "#888",
                        }}>{job.status}</span>
                        <span style={{ fontSize: 10, color: "#444" }}>
                          {job.created_at ? new Date(job.created_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteJob(job.job_id)} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "2px 4px", borderRadius: 4, transition: "color .15s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
                        onMouseLeave={e => e.currentTarget.style.color = "#555"}
                      >🗑</button>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>
        )}
      </div>

      <input ref={uploadRef} type="file" accept=".glb,.stl" style={{ display: "none" }}
        onChange={e => { handleUpload3D(e.target.files?.[0]); e.target.value = "" }} />

      <style>{`
        @keyframes skpulse { 0%,100%{opacity:.6} 50%{opacity:.2} }
        @keyframes genpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        .collected-card:hover .star-btn { opacity: 1 !important; }
        .collected-card:hover .more-btn { opacity: 1 !important; }
        .star-btn:hover { color: #fff !important; }
      `}</style>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => { setShowAuth(false); window.location.reload() }}
        />
      )}
    </aside>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VIEWER GIZMO
// ════════════════════════════════════════════════════════════════════════════
function ViewerGizmo({ cameraQuatRef }) {
  const SIZE = 56, C = 28, LEN = 20
  const svgRef = useRef(null)
  const rafRef = useRef(null)

  function rotateByConjugate(v, q) {
    const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w
    const tx = 2*(qy*v[2] - qz*v[1]), ty = 2*(qz*v[0] - qx*v[2]), tz = 2*(qx*v[1] - qy*v[0])
    return [v[0]+qw*tx+qy*tz-qz*ty, v[1]+qw*ty+qz*tx-qx*tz, v[2]+qw*tz+qx*ty-qy*tx]
  }

  useEffect(() => {
    if (!cameraQuatRef) return
    const svg = svgRef.current
    if (!svg) return
    const AXES = [{ id:"X", world:[1,0,0] }, { id:"Y", world:[0,1,0] }, { id:"Z", world:[0,0,-1] }]
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      const q = cameraQuatRef.current
      const projected = AXES.map(({ id, world }) => {
        const r = rotateByConjugate(world, q)
        return { id, r, ex: C + r[0]*LEN, ey: C - r[1]*LEN }
      }).sort((a, b) => a.r[2] - b.r[2])
      projected.forEach(({ id, ex, ey, r }) => {
        const opacity = r[2] < -0.1 ? "0.35" : "1"
        const line  = svg.querySelector(`[data-gizmo="${id}-line"]`)
        const dot   = svg.querySelector(`[data-gizmo="${id}-dot"]`)
        const label = svg.querySelector(`[data-gizmo="${id}-label"]`)
        if (line)  { line.setAttribute("x2", ex);  line.setAttribute("y2", ey);  line.setAttribute("opacity", opacity) }
        if (dot)   { dot.setAttribute("cx", ex);   dot.setAttribute("cy", ey);   dot.setAttribute("opacity", opacity) }
        if (label) { label.setAttribute("x", C + r[0]*(LEN+9)); label.setAttribute("y", C - r[1]*(LEN+9) + 3); label.setAttribute("opacity", opacity) }
      })
    }
    loop()
    return () => cancelAnimationFrame(rafRef.current)
  }, [cameraQuatRef])

  const AXES_INIT = [{ id:"X", color:"#e74c3c" }, { id:"Y", color:"#2ecc71" }, { id:"Z", color:"#3498db" }]

  return (
    <svg ref={svgRef} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display:"block" }}>
      {AXES_INIT.map(({ id, color }) => (
        <g key={id}>
          <line data-gizmo={`${id}-line`} x1={C} y1={C} x2={C} y2={C} stroke={color} strokeWidth="2" strokeLinecap="round" />
          <circle data-gizmo={`${id}-dot`} cx={C} cy={C} r="4" fill={color} />
          <text data-gizmo={`${id}-label`} x={C} y={C} fill={color} fontSize="9" fontWeight="700" fontFamily="monospace">{id}</text>
        </g>
      ))}
      <circle cx={C} cy={C} r="3" fill="#888" />
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CONVERT EXPORT MODAL
// ════════════════════════════════════════════════════════════════════════════
function ConvertSharePopup({ submissionId, onClose }) {
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState("")

  useEffect(() => {
    // Fetch submission info để lấy uuid và model_name → build slug giống Home.jsx
    import("../services/api").then(({ default: apiMod }) => {
      apiMod.get(`/gallery/submission/${submissionId}`)
        .then(res => {
          const { model_name, uuid } = res.data
          const slug = `${(model_name || "model").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${uuid}`
          setUrl(`${window.location.origin}/3d-model/${slug}`)
        })
        .catch(() => setUrl(window.location.href))
    })
  }, [submissionId])
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div style={{ position: "absolute", bottom: 130, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: 20, width: 300, zIndex: 20 }} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>Share</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>Share Link</div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, background: "#111", border: "1px solid #222", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {url}
        </div>
        <button onClick={copy}
          style={{ flexShrink: 0, padding: "9px 16px", borderRadius: 8, border: "none", background: copied ? "#34d399" : "linear-gradient(135deg,#f5c842,#e8a800)", color: "#111", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "background 0.2s" }}
        >{copied ? "✓" : "Copy"}</button>
      </div>
    </div>
  )
}

/** Lấy extension gốc của model từ URL, vd "glb" | "obj" | "stl" */
function getSrcFormat(modelUrl) {
  if (!modelUrl) return "glb"
  const ext = modelUrl.split("?")[0].split(".").pop().toLowerCase()
  return ext || "glb"
}

function ConvertExportModal({ modelUrl, modelName, submissionId, jobId, hasSkeleton, texResolution, onClose }) {
  const srcFormat = getSrcFormat(modelUrl)   // "glb" | "obj" | "stl"

  const [format, setFormat]           = useState(srcFormat.toUpperCase() === "OBJ" ? "OBJ" : "GLB")
  const [texRes, setTexRes]           = useState(texResolution || "4k")
  const [skeleton, setSkeleton]       = useState(hasSkeleton ?? false)
  const [pivot, setPivot]             = useState(false)
  const [fileName, setFileName]       = useState(modelName || "model")
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
    if (!modelUrl) { onClose(); return }
    setDownloading(true)
    try {
      const apiMod = (await import("../services/api")).default

      // Helper download
      const triggerDownload = (blobOrData, ext) => {
        const url = URL.createObjectURL(blobOrData instanceof Blob ? blobOrData : blobOrData)
        const a   = document.createElement("a")
        a.href = url; a.download = `${fileName}.${ext}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      if (submissionId) {
        // ── Có gallery ID ────────────────────────────────────────────────────
        const baseParams = {
          format: format.toLowerCase(),
          ...(!skeleton && { include_skeleton: false }),
          ...(pivot && { bottom_center_pivot: true }),
        }

        if (needsConvert) {
          // Cần convert format → luôn gọi API
          const res = await apiMod.get(`/gallery/${submissionId}/export`, { params: baseParams, responseType: "blob" })
          triggerDownload(res.data, downloadExt)

        } else if (texResolution && texResolution !== "none" && RES_ORDER[texRes] < RES_ORDER[texResolution]) {
          // Cùng format nhưng downscale texture → gọi API
          const res = await apiMod.get(`/gallery/${submissionId}/export`, {
            params: { ...baseParams, tex_res: texRes },
            responseType: "blob",
          })
          triggerDownload(res.data, downloadExt)

        } else if (skeleton || pivot) {
          // Cùng format, không downscale, nhưng cần xử lý skeleton/pivot → gọi API
          const res = await apiMod.get(`/gallery/${submissionId}/export`, { params: baseParams, responseType: "blob" })
          triggerDownload(res.data, downloadExt)

        } else {
          // Cùng format, không downscale, không options → download thẳng file gốc
          const res = await fetch(modelUrl)
          const blob = await res.blob()
          triggerDownload(blob, downloadExt)
        }

      } else if (jobId) {
        // ── Chưa publish, có job_id → gọi /my-jobs/{jobId}/export với đầy đủ params ──
        const params = {
          format: format.toLowerCase(),
          ...(!skeleton && { include_skeleton: false }),
          ...(pivot && { bottom_center_pivot: true }),
          ...(texResolution && texResolution !== "none" && RES_ORDER[texRes] < RES_ORDER[texResolution] && { tex_res: texRes }),
        }
        const res = await apiMod.get(`/my-jobs/${jobId}/export`, { params, responseType: "blob" })
        triggerDownload(res.data, downloadExt)

      } else {
        // ── Không có ID nào → download thẳng file gốc ───────────────────────
        const res = await fetch(modelUrl)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a   = document.createElement("a")
        a.href = url; a.download = `${fileName}.${srcFormat}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      onClose()
    } catch {
      window.open(modelUrl, "_blank")
      onClose()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"#141414", border:"1px solid #222", borderRadius:14, width:340, padding:24, position:"relative", transform:"translateY(-210px) translateX(150px)" }} onClick={e => e.stopPropagation()}>
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
          {needsConvert && !submissionId && !jobId && (
            <div style={{ fontSize:11, color:"#f5a623", marginTop:6 }}>
              ⚠ Format conversion requires publishing — will download as .{srcFormat.toUpperCase()}
            </div>
          )}
        </div>

        {/* Texture Resolution */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:12, color:"#555" }}>Texture Resolution</span>
            {texResolution && (
              <span style={{ fontSize:11, color:"#7c6ef5" }}>Gốc: {texResolution}</span>
            )}
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
          {texRes !== texResolution && texResolution && !submissionId && !jobId && (
            <div style={{ fontSize:11, color:"#888", marginTop:6 }}>
              ℹ Texture downscaling requires publishing the model first
            </div>
          )}
          {texRes !== texResolution && texResolution && submissionId && (
            <div style={{ fontSize:11, color:"#888", marginTop:6 }}>
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
          <span>⬇</span> {downloading ? "Đang tải..." : `Export .${(submissionId || jobId) ? downloadExt.toUpperCase() : srcFormat.toUpperCase()}`}
        </button>
      </div>
    </div>
  )
}