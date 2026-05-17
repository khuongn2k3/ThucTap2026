import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function OAuthSuccess() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("token")

    if (token) {
      localStorage.setItem("token", token)
      window.location.href = "/"
    } else {
      navigate("/")
    }
  }, [])

  return <p className="text-center mt-10">Đang đăng nhập bằng Google...</p>
}