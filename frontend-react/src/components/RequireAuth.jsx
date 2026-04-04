import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useEffect } from "react"

export default function RequireAuth() {
  const location = useLocation()
  const navigate = useNavigate()
  const token = localStorage.getItem("token")

  useEffect(() => {
    if (!token || token === "undefined") {
      localStorage.removeItem("token")
      // Về trang chủ và mở AuthModal
      navigate("/", { replace: true, state: { from: location } })
      window.dispatchEvent(new CustomEvent("open-auth-modal"))
    }
  }, [])

  if (!token || token === "undefined") {
    return null
  }

  return <Outlet />
}
