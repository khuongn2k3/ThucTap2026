import { useState, useEffect, useRef } from "react"
import { getPackages, createPayment, checkPaymentStatus } from "../services/api"

const POLL_INTERVAL = 4000

export default function PaymentModal({ onClose, onSuccess }) {
  const [packages, setPackages]     = useState([])
  const [selected, setSelected]     = useState(null)
  const [payment, setPayment]       = useState(null)  // created payment
  const [step, setStep]             = useState("pick") // "pick" | "qr" | "done"
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState("")
  const [pollMsg, setPollMsg]       = useState("Waiting for payment...")
  const [copied, setCopied]         = useState(false)
  const pollRef                     = useRef(null)

  // Load packages
  useEffect(() => {
    getPackages()
      .then(res => {
        const list = res.data?.packages || []
        setPackages(list)
        if (list.length) setSelected(list[0].id)
      })
      .catch(() => setError("Failed to load packages"))
  }, [])

  // Cleanup polling on unmount
  useEffect(() => () => clearInterval(pollRef.current), [])

  const handleCreate = async () => {
    if (!selected) return
    setLoading(true); setError("")
    try {
      const res = await createPayment(selected)
      setPayment(res.data)
      setStep("qr")
      startPolling(res.data.id)
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create payment")
    } finally {
      setLoading(false)
    }
  }

  const startPolling = (paymentId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await checkPaymentStatus(paymentId)
        const { status, message } = res.data
        setPollMsg(message)
        if (status === "completed") {
          clearInterval(pollRef.current)
          setStep("done")
          if (onSuccess) onSuccess()
        } else if (status === "expired" || status === "failed") {
          clearInterval(pollRef.current)
          setError(message)
          setStep("pick")
        }
      } catch {
        // silent — keep polling
      }
    }, POLL_INTERVAL)
  }

  const pkg = packages.find(p => p.id === selected)

  // ── styles ──────────────────────────────────────────
  const overlay = {
    position: "fixed", inset: 0, zIndex: 2000,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
  }
  const modal = {
    width: 480, maxWidth: "95vw",
    background: "#111", borderRadius: 20,
    border: "1px solid #1e1e1e",
    boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
    fontFamily: "'DM Sans',sans-serif",
    position: "relative", overflow: "hidden",
  }
  const btnPrimary = (disabled) => ({
    width: "100%", padding: "13px 0",
    background: disabled ? "#2a2a2a" : "linear-gradient(135deg,#7c6ef5,#5650cc)",
    border: "none", borderRadius: 12,
    color: disabled ? "#555" : "#fff",
    fontSize: 14, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "'DM Sans',sans-serif",
    transition: "opacity 0.15s",
  })

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "24px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>
              {step === "done" ? "Payment successful 🎉" : "Top up credits"}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
              {step === "pick" && "Choose a package to continue"}
              {step === "qr"   && "Scan QR code to complete payment"}
              {step === "done" && "Credits have been added to your account"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ padding: "20px 28px 28px" }}>

          {/* Error */}
          {error && (
            <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#fca5a5", marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* ── STEP: PICK ── */}
          {step === "pick" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {packages.map(p => {
                  const active = selected === p.id
                  return (
                    <div key={p.id} onClick={() => setSelected(p.id)} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 16px", borderRadius: 12, cursor: "pointer",
                      border: active ? "1px solid #7c6ef5" : "1px solid #1e1e1e",
                      background: active ? "rgba(124,110,245,0.08)" : "#0d0d0d",
                      transition: "all 0.15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%",
                          border: active ? "5px solid #7c6ef5" : "2px solid #333",
                          flexShrink: 0, transition: "all 0.15s",
                        }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", textTransform: "capitalize" }}>{p.id}</div>
                          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                            <span style={{ color: "#7c6ef5" }}>⚡ {p.tokens.toLocaleString()} credits</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: active ? "#fff" : "#666" }}>
                        {p.price_formatted}
                      </div>
                    </div>
                  )
                })}
              </div>

              <button onClick={handleCreate} disabled={loading || !selected} style={btnPrimary(loading || !selected)}>
                {loading ? "Creating..." : `Continue with ${pkg?.id || ""} — ${pkg?.price_formatted || ""}`}
              </button>
            </>
          )}

          {/* ── STEP: QR ── */}
          {step === "qr" && payment && (
            <>
              {/* QR */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <div style={{ background: "#fff", borderRadius: 16, padding: 16, display: "inline-block" }}>
                  <img
                    src={payment.qr_code_url}
                    alt="QR Code"
                    style={{ width: 200, height: 200, display: "block" }}
                  />
                </div>
              </div>

              {/* Transfer info */}
              <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                <Row label="Amount" value={`${Number(payment.amount_vnd).toLocaleString("vi-VN")} VNĐ`} highlight />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #1a1a1a" }}>
                  <span style={{ fontSize: 12, color: "#555" }}>Content</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "70%" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#aaa", fontFamily: "monospace", textAlign: "right", wordBreak: "break-all" }}>
                      {payment.transfer_content}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(payment.transfer_content)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                      style={{ flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: copied ? "#7c6ef5" : "#666", fontSize: 11, whiteSpace: "nowrap" }}
                    >
                      {copied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                </div>
                <Row label="Expires" value={new Date(payment.expires_at).toLocaleTimeString()} last />
              </div>

              {/* Polling status */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 16 }}>
                <Spinner />
                <span style={{ fontSize: 12, color: "#555" }}>{pollMsg}</span>
              </div>

              <button onClick={() => { clearInterval(pollRef.current); setStep("pick"); setPayment(null) }}
                style={{ ...btnPrimary(false), background: "none", border: "1px solid #1e1e1e", color: "#555" }}>
                ← Back
              </button>
            </>
          )}

          {/* ── STEP: DONE ── */}
          {step === "done" && (
            <>
              <div style={{ textAlign: "center", padding: "20px 0 28px" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, color: "#aaa", marginBottom: 6 }}>
                  <span style={{ color: "#7c6ef5", fontWeight: 700 }}>⚡ {payment?.tokens?.toLocaleString()} credits</span> added to your account
                </div>
                <div style={{ fontSize: 12, color: "#444" }}>Your balance has been updated</div>
              </div>
              <button onClick={() => { onClose(); window.location.reload() }} style={btnPrimary(false)}>
                Done
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

// ── helpers ──────────────────────────────────────────

function Row({ label, value, highlight, mono, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: last ? 0 : 10, marginBottom: last ? 0 : 10, borderBottom: last ? "none" : "1px solid #1a1a1a" }}>
      <span style={{ fontSize: 12, color: "#555" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: highlight ? 700 : 500, color: highlight ? "#fff" : "#aaa", fontFamily: mono ? "monospace" : "'DM Sans',sans-serif", textAlign: "right", maxWidth: "60%", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: "50%",
      border: "2px solid #222", borderTopColor: "#7c6ef5",
      animation: "spin 0.8s linear infinite",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}