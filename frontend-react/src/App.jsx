import { BrowserRouter, Routes, Route } from "react-router-dom"

import RequireAuth from "./components/RequireAuth"
import RequireAdmin from "./components/RequireAdmin"

import MainLayout from "./layouts/MainLayout"

import Home from "./pages/Home"
import Convert3D from "./pages/Convert3D"
import OAuthSuccess from "./pages/OAuthSuccess"
import Admin from "./pages/Admin"
import Asset from "./pages/Asset"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ===== PUBLIC ===== */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/3d-model/:slug" element={<Home />} />
          <Route path="/oauth-success" element={<OAuthSuccess />} />
        </Route>

        {/* ===== PROTECTED ===== */}
        <Route element={<MainLayout />}>
            <Route path="/convert" element={<Convert3D />} />
            <Route path="/history" element={<Asset />} />

            {/* ===== ADMIN ONLY ===== */}
            <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        </Route>

      </Routes>
    </BrowserRouter>
  )
}
