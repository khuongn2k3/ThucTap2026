import { useState, useEffect, useRef } from "react"
import { getPackages, createPayment, checkPaymentStatus } from "../services/api"

const POLL_INTERVAL = 4000

const PACKAGE_META = {
  basic:      { color: "#34d399", glow: "rgba(52,211,153,0.12)",  label: "Starter" },
  pro:        { color: "#fb923c", glow: "rgba(251,146,60,0.12)",  label: "Popular" },
  premium:    { color: "#a78bfa", glow: "rgba(167,139,250,0.14)", label: "Best Value" },
  admin_test: { color: "#64748b", glow: "rgba(100,116,139,0.08)", label: "Test" },
}

export default function PaymentModal({ onClose, onSuccess }) {
  const [packages, setPackages] = useState([])
  const [selected, setSelected] = useState(null)
  const [payment, setPayment]   = useState(null)
  const [step, setStep]         = useState("pick")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const [pollMsg, setPollMsg]   = useState("Waiting for payment...")
  const [copied, setCopied]     = useState(false)
  const [dots, setDots]         = useState("")
  const [countdown, setCountdown] = useState(null)
  const pollRef                 = useRef(null)
  const dotsRef                 = useRef(null)
  const cdRef                   = useRef(null)

  useEffect(() => {
    getPackages()
      .then(res => {
        const list = res.data?.packages || []
        setPackages(list)
        if (list.length) setSelected(list[0].id)
      })
      .catch(() => setError("Failed to load packages"))
  }, [])

  useEffect(() => () => {
    clearInterval(pollRef.current)
    clearInterval(dotsRef.current)
    clearInterval(cdRef.current)
  }, [])

  const handleCreate = async () => {
    if (!selected) return
    setLoading(true); setError("")
    try {
      const res = await createPayment(selected)
      setPayment(res.data)
      setStep("qr")
      startPolling(res.data.id)
      dotsRef.current = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 600)
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
          clearInterval(dotsRef.current)
          setStep("done")
          if (onSuccess) onSuccess()
          let t = 3
          setCountdown(t)
          cdRef.current = setInterval(() => {
            t -= 1
            if (t <= 0) { clearInterval(cdRef.current); onClose() }
            else setCountdown(t)
          }, 1000)
        } else if (status === "expired" || status === "failed") {
          clearInterval(pollRef.current)
          clearInterval(dotsRef.current)
          setError(message)
          setStep("pick")
        }
      } catch { }
    }, POLL_INTERVAL)
  }

  const pkg     = packages.find(p => p.id === selected)
  const pkgMeta = PACKAGE_META[selected] || { color: "#60a5fa", glow: "rgba(96,165,250,0.12)" }

  return (
    <>
      <style>{`
        .pm-overlay {
          position: fixed; inset: 0; z-index: 2000;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(16px) saturate(180%);
          animation: pm-fadein 0.18s ease;
        }
        @keyframes pm-fadein { from { opacity:0 } to { opacity:1 } }

        .pm-modal {
          width: 600px; max-width: 96vw;
          background: #0c0c0e;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          position: relative; overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.03) inset,
            0 32px 80px rgba(0,0,0,0.7),
            0 8px 24px rgba(0,0,0,0.4);
          animation: pm-slidein 0.28s cubic-bezier(0.34,1.4,0.64,1);
        }
        @keyframes pm-slidein {
          from { opacity:0; transform: translateY(20px) scale(0.96) }
          to   { opacity:1; transform: none }
        }

        /* subtle top gradient line */
        .pm-modal::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
        }

        /* ── PACKAGE CARDS ── */
        .pm-pkg-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }

        .pm-pkg {
          border-radius: 14px; cursor: pointer;
          border: 1.5px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
          transition: all 0.2s ease;
          position: relative; overflow: hidden;
          display: flex; flex-direction: column;
          padding: 14px 12px 12px;
          gap: 0;
        }
        .pm-pkg:hover {
          border-color: rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          transform: translateY(-1px);
        }
        .pm-pkg.active {
          border-color: var(--pkg-color);
          background: var(--pkg-glow);
          box-shadow: 0 0 0 1px var(--pkg-color) inset, 0 8px 32px var(--pkg-glow);
          transform: translateY(-2px);
        }
        .pm-pkg.active .pm-pkg-accent {
          opacity: 1;
        }
        /* colored top bar */
        .pm-pkg-accent {
          position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--pkg-color);
          opacity: 0.3;
          transition: opacity 0.2s;
        }

        /* badge */
        .pm-pkg-badge {
          display: inline-block;
          font-size: 9px; font-weight: 700; letter-spacing: 0.07em;
          text-transform: uppercase;
          padding: 2px 7px; border-radius: 20px;
          background: var(--pkg-color);
          color: #000;
          margin-bottom: 10px;
          align-self: flex-start;
          line-height: 1.6;
        }

        .pm-pkg-name {
          font-size: 11px; font-weight: 600;
          color: #555; text-transform: capitalize;
          letter-spacing: 0.03em;
          margin-bottom: 8px;
        }
        .pm-pkg.active .pm-pkg-name { color: #888; }

        .pm-pkg-price {
          font-size: 20px; font-weight: 800;
          color: #2a2a2a;
          letter-spacing: -0.02em;
          line-height: 1;
          margin-bottom: 8px;
          transition: color 0.2s;
        }
        .pm-pkg.active .pm-pkg-price { color: #fff; }

        .pm-pkg-credits {
          font-size: 11px; font-weight: 600;
          color: #333;
          margin-top: auto;
          transition: color 0.2s;
        }
        .pm-pkg.active .pm-pkg-credits { color: var(--pkg-color); }

        /* ── CTA BUTTON ── */
        .pm-btn-pay {
          width: 100%;
          padding: 15px 20px;
          border-radius: 13px;
          border: none;
          font-size: 15px; font-weight: 700;
          font-family: inherit;
          color: #fff;
          cursor: pointer;
          letter-spacing: 0.01em;
          position: relative; overflow: hidden;
          transition: all 0.22s ease;
          background: linear-gradient(135deg,
            color-mix(in srgb, var(--pkg-color) 40%, #1a1a2e),
            color-mix(in srgb, var(--pkg-color) 20%, #0d0d1a)
          );
          box-shadow:
            0 1px 0 rgba(255,255,255,0.1) inset,
            0 4px 20px color-mix(in srgb, var(--pkg-color) 25%, transparent);
        }
        .pm-btn-pay::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 60%);
        }
        .pm-btn-pay:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.12) inset,
            0 8px 28px color-mix(in srgb, var(--pkg-color) 35%, transparent);
        }
        .pm-btn-pay:active:not(:disabled) { transform: translateY(0); }
        .pm-btn-pay:disabled { opacity: 0.3; cursor: not-allowed; }

        /* ── GHOST BUTTON ── */
        .pm-btn-ghost {
          width: 100%; padding: 12px;
          background: transparent; border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px; color: #444; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: all 0.18s ease;
        }
        .pm-btn-ghost:hover { border-color: rgba(255,255,255,0.12); color: #666; }

        /* ── CLOSE ── */
        .pm-close {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
          color: #444; width: 32px; height: 32px; border-radius: 50%;
          cursor: pointer; font-size: 13px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; flex-shrink: 0;
        }
        .pm-close:hover { background: rgba(255,255,255,0.08); color: #aaa; border-color: rgba(255,255,255,0.15); }

        /* ── QR ── */
        .pm-qr-wrap {
          background: #fff; border-radius: 16px; padding: 12px;
          display: inline-block;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.6);
        }

        /* ── INFO CARDS (QR step) ── */
        .pm-info-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 11px;
          padding: 12px 14px;
          display: flex; flex-direction: column; gap: 6px;
        }
        .pm-info-label {
          font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.09em; color: #888;
        }

        /* ── POLLING ── */
        .pm-pulse { display: flex; align-items: center; gap: 5px; }
        .pm-dot {
          width: 5px; height: 5px; border-radius: 50%; background: #666;
          animation: pm-pulse-anim 1.4s ease-in-out infinite;
        }
        .pm-dot:nth-child(2) { animation-delay: 0.2s; }
        .pm-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pm-pulse-anim {
          0%,80%,100% { background:#555; transform:scale(1); }
          40% { background: var(--accent, #60a5fa); transform:scale(1.4); }
        }

        /* ── COPY BTN ── */
        .pm-copy-btn {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px; padding: 4px 10px; cursor: pointer;
          color: #aaa; font-size: 12px; font-family: inherit;
          font-weight: 600; transition: all 0.15s; white-space: nowrap; flex-shrink: 0;
        }
        .pm-copy-btn:hover { background: rgba(255,255,255,0.08); color: #ddd; border-color: rgba(255,255,255,0.14); }
        .pm-copy-btn.copied { color: #34d399; border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.06); }

        /* ── TAG ── */
        .pm-tag {
          font-family: monospace;
          font-size: 13px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 6px; padding: 3px 10px; color: #ccc;
          display: inline-flex; align-items: center; gap: 4px;
        }

        /* ── SUCCESS ── */
        .pm-success-wrap {
          position: relative;
          padding: 28px 0 8px;
          text-align: center;
          overflow: hidden;
        }
        .pm-success-wrap::before {
          content: '';
          position: absolute;
          top: -20px; left: 50%; transform: translateX(-50%);
          width: 280px; height: 180px;
          background: radial-gradient(ellipse, rgba(52,211,153,0.10) 0%, transparent 70%);
          pointer-events: none;
        }
        .pm-success-icon {
          position: relative;
          width: 72px; height: 72px; border-radius: 50%;
          margin: 0 auto 20px;
          background: radial-gradient(circle at 40% 35%, rgba(52,211,153,0.18), rgba(52,211,153,0.04) 70%);
          border: 1px solid rgba(52,211,153,0.22);
          display: flex; align-items: center; justify-content: center;
          animation: pm-pop 0.5s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow: 0 0 0 8px rgba(52,211,153,0.04), 0 0 32px rgba(52,211,153,0.12);
        }
        .pm-success-icon::after {
          content: '';
          width: 26px; height: 15px;
          border-left: 2.5px solid #34d399;
          border-bottom: 2.5px solid #34d399;
          transform: rotate(-45deg) translateY(-3px);
          display: block;
          filter: drop-shadow(0 0 4px rgba(52,211,153,0.6));
        }
        .pm-success-tokens {
          font-size: 44px; font-weight: 800;
          color: #fff; letter-spacing: -0.03em; line-height: 1;
          margin-bottom: 6px;
          animation: pm-slidein-up 0.4s 0.1s both ease-out;
        }
        .pm-success-tokens span {
          font-size: 20px; color: #34d399;
          font-weight: 700; margin-left: 6px; vertical-align: middle;
        }
        .pm-success-sub {
          font-size: 13px; color: #444; margin-bottom: 24px;
          animation: pm-slidein-up 0.4s 0.18s both ease-out;
        }
        .pm-success-row {
          display: flex; gap: 8px; margin-bottom: 20px;
          animation: pm-slidein-up 0.4s 0.24s both ease-out;
        }
        .pm-success-stat {
          flex: 1;
          background: rgba(52,211,153,0.04);
          border: 1px solid rgba(52,211,153,0.10);
          border-radius: 12px; padding: 12px; text-align: center;
        }
        .pm-success-stat-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.09em;
          text-transform: uppercase; color: #333; margin-bottom: 5px;
        }
        .pm-success-stat-value {
          font-size: 15px; font-weight: 700; color: #e0e0e0;
        }
        .pm-success-stat-value.green { color: #34d399; }
        @keyframes pm-pop { from { transform:scale(0.4); opacity:0 } to { transform:scale(1); opacity:1 } }
        @keyframes pm-slidein-up { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
      `}</style>

      <div className="pm-overlay" onClick={onClose}>
        <div className="pm-modal"
          onClick={e => e.stopPropagation()}
          style={{ "--pkg-color": pkgMeta.color, "--pkg-glow": pkgMeta.glow }}
        >
          {/* Header */}
          <div style={{ padding: "22px 22px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#3a3a3a", marginBottom: 5 }}>
                {step === "pick" && "Top up credits"}
                {step === "qr"   && "Bank transfer"}
                {step === "done" && "Payment successful"}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#e8e8e8", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                {step === "pick" && "Choose a package"}
                {step === "qr"   && "Scan to complete"}
                {step === "done" && "Credits added"}
              </div>
            </div>
            <button className="pm-close" onClick={onClose}>✕</button>
          </div>

          <div style={{ padding: "0 22px 22px" }}>

            {/* Error */}
            {error && (
              <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 11, padding: "10px 14px", fontSize: 12, color: "#f87171", marginBottom: 14, display: "flex", gap: 8, alignItems: "center" }}>
                {error}
              </div>
            )}

            {/* ── STEP: PICK ── */}
            {step === "pick" && (
              <>
                <div className="pm-pkg-grid">
                  {packages.map(p => {
                    const meta   = PACKAGE_META[p.id] || { color: "#60a5fa", glow: "rgba(96,165,250,0.12)", label: "" }
                    const active = selected === p.id
                    return (
                      <div
                        key={p.id}
                        className={`pm-pkg${active ? " active" : ""}`}
                        style={{ "--pkg-color": meta.color, "--pkg-glow": meta.glow }}
                        onClick={() => setSelected(p.id)}
                      >
                        <div className="pm-pkg-accent" />
                        {meta.label && (
                          <div className="pm-pkg-badge">{meta.label}</div>
                        )}
                        <div className="pm-pkg-name">{p.id.replace("_", " ")}</div>
                        <div className="pm-pkg-price">{p.price_formatted}</div>
                        <div className="pm-pkg-credits">{p.tokens.toLocaleString()} credits</div>
                      </div>
                    )
                  })}
                </div>

                {/* Summary row */}
                {pkg && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderRadius: 11, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>
                      {pkg.id.replace("_"," ")} — {pkg.tokens.toLocaleString()} credits
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#e0e0e0", letterSpacing: "-0.01em" }}>
                      {pkg.price_formatted}
                    </span>
                  </div>
                )}

                <button
                  className="pm-btn-pay"
                  style={{ "--pkg-color": pkgMeta.color }}
                  disabled={loading || !selected}
                  onClick={handleCreate}
                >
                  {loading ? "Processing..." : `Pay ${pkg?.price_formatted || ""}`}
                </button>
              </>
            )}

            {/* ── STEP: QR ── */}
            {step === "qr" && payment && (
              <>
                <div style={{ display: "flex", gap: 14, marginBottom: 10, alignItems: "stretch" }}>
                  {/* Left: QR */}
                  <div className="pm-qr-wrap" style={{ flexShrink: 0, alignSelf: "flex-start" }}>
                    <img src={payment.qr_code_url} alt="QR" style={{ width: 168, height: 168, display: "block", borderRadius: 6 }} />
                  </div>

                  {/* Right: info + polling + back */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Account number */}
                    {payment.account_number && (
                      <div className="pm-info-card">
                        <div className="pm-info-label">Account number · {payment.bank_id}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "#e0e0e0", flex: 1, letterSpacing: "0.04em" }}>
                            {payment.account_number}
                          </span>
                          <button
                            className="pm-copy-btn"
                            onClick={() => navigator.clipboard?.writeText(payment.account_number)}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Amount */}
                    <div className="pm-info-card">
                      <div className="pm-info-label">Amount</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#e0e0e0" }}>
                        {Number(payment.amount_vnd).toLocaleString("vi-VN")}đ
                      </div>
                    </div>

                    {/* Transfer content */}
                    <div className="pm-info-card" style={{ flex: 1 }}>
                      <div className="pm-info-label">Transfer content</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 13, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {payment.transfer_content}
                        </span>
                        <button
                          className={`pm-copy-btn${copied ? " copied" : ""}`}
                          onClick={() => { navigator.clipboard?.writeText(payment.transfer_content); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                        >
                          {copied ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </div>

                    {/* Expires */}
                    <div className="pm-info-card">
                      <div className="pm-info-label">Expires</div>
                      <span className="pm-tag">{new Date(payment.expires_at.endsWith('Z') || payment.expires_at.includes('+') ? payment.expires_at : payment.expires_at + 'Z').toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {/* Polling */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div className="pm-pulse" style={{ "--accent": "#60a5fa" }}>
                        <div className="pm-dot" /><div className="pm-dot" /><div className="pm-dot" />
                      </div>
                      <span style={{ fontSize: 11, color: "#999", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pollMsg}{dots}
                      </span>
                    </div>
                  </div>
                </div>

                <button className="pm-btn-ghost" onClick={() => { clearInterval(pollRef.current); clearInterval(dotsRef.current); setStep("pick"); setPayment(null) }}>
                  Back
                </button>
              </>
            )}

            {/* ── STEP: DONE ── */}
            {step === "done" && (
              <>
                <div className="pm-success-wrap">
                  <div className="pm-success-icon" />
                  <div className="pm-success-tokens">
                    +{payment?.tokens?.toLocaleString()}
                    <span>credits</span>
                  </div>
                  <div className="pm-success-sub">Added to your account instantly</div>
                  <div className="pm-success-row">
                    <div className="pm-success-stat">
                      <div className="pm-success-stat-label">Package</div>
                      <div className="pm-success-stat-value" style={{ textTransform: "capitalize" }}>
                        {payment?.package_id?.replace("_", " ")}
                      </div>
                    </div>
                    <div className="pm-success-stat">
                      <div className="pm-success-stat-label">Amount paid</div>
                      <div className="pm-success-stat-value">
                        {Number(payment?.amount_vnd).toLocaleString("vi-VN")}đ
                      </div>
                    </div>
                    <div className="pm-success-stat">
                      <div className="pm-success-stat-label">Credits</div>
                      <div className="pm-success-stat-value green">
                        +{payment?.tokens?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <button className="pm-btn-pay" style={{ "--pkg-color": "#34d399" }} onClick={onClose}>
                  Done {countdown !== null && `(${countdown})`}
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  )
}