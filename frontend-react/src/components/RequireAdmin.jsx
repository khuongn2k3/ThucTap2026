import { Navigate } from "react-router-dom"
import { useEffect, useState } from "react"
import api from "../services/api"

export default function RequireAdmin({ children }) {
  const [allowed, setAllowed] = useState(null)

  useEffect(() => {
    api.get("/me")
      .then(res => {
        if (res.data.role === "admin") {
          setAllowed(true)
        } else {
          setAllowed(false)
        }
      })
      .catch(() => setAllowed(false))
  }, [])

  if (allowed === null) {
    return <div className="p-6">Checking permission...</div>
  }

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return children
}
