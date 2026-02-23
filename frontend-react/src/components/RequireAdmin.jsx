import { Navigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { getMe } from "../services/api"  // Import function

export default function RequireAdmin({ children }) {
  const [allowed, setAllowed] = useState(null)

  useEffect(() => {
    getMe()  // Dùng function
      .then(res => {
        if (res.data.role === "admin") {
          setAllowed(true)
        } else {
          setAllowed(false)
        }
      })
      .catch(err => {
        console.error(" RequireAdmin error:", err.response?.data)
        setAllowed(false)
      })
  }, [])

  if (allowed === null) {
    return <div className="p-6">Checking permission...</div>
  }

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return children
}