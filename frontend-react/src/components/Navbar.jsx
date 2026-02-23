import { NavLink, Link, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { getMe } from "../services/api"  //  Import function

const MENU_BY_ROLE = {
  admin: [
    { label: "Convert", to: "/" },
    { label: "Dashboard", to: "/dashboard" },
    { label: "History", to: "/history" },
    { label: "Admin", to: "/admin" }, // chỉ admin
  ],
  user: [
    { label: "Convert", to: "/" },
    { label: "Dashboard", to: "/dashboard" },
    { label: "History", to: "/history" },
  ],
}

export default function Navbar() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getMe()  //  Dùng function
      .then(res => setUser(res.data))
      .catch(err => {
        console.error("❌ Navbar error:", err.response?.data)
        handleLogout()
      })
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("token")
    navigate("/login")
  }

  const menus = MENU_BY_ROLE[user?.role] || []

  return (
    <nav className="h-14 bg-gray-800 text-white flex items-center justify-between px-6 shadow">
      {/* LEFT */}
      <div className="flex items-center gap-6">
        <span className="text-lg font-bold">Hunyuan3D</span>

        {menus.map(menu => (
          <NavLink
            key={menu.to}
            to={menu.to}
            className={({ isActive }) =>
              isActive
                ? "text-white font-medium"
                : "text-gray-300 hover:text-white"
            }
          >
            {menu.label}
          </NavLink>
        ))}
      </div>

      {/* RIGHT */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 hover:bg-gray-700 px-3 py-1 rounded"
        >
          <img
            src={
              user?.avatar_url
                ? user.avatar_url
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    user?.name || "Admin"
                  )}&background=0D8ABC&color=fff`
            }
            className="w-8 h-8 rounded-full object-cover"
          />
          <span className="text-sm">{user?.name}</span>
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-40 bg-white text-gray-800 rounded shadow">
            <Link
              to="/profile"
              className="block px-4 py-2 hover:bg-gray-100 text-sm"
            >
              Profile
            </Link>

            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-500"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}