import Navbar from "../components/Navbar"
import { Outlet } from "react-router-dom"

export default function MainLayout() {
  return (
    <div style={{ minHeight:"100vh", background:"#080808" }}>
      <Navbar />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
