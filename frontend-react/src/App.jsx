import { BrowserRouter, Routes, Route } from "react-router-dom"

import RequireAuth from "./components/RequireAuth"
import RequireAdmin from "./components/RequireAdmin"

import MainLayout from "./layouts/MainLayout"
import AuthLayout from "./layouts/AuthLayout"

import Convert3D from "./pages/Convert3D"
import Login from "./pages/Login"
import Register from "./pages/Register"
import OAuthSuccess from "./pages/OAuthSuccess"
import Dashboard from "./pages/Dashboard"
import Admin from "./pages/Admin"
import History from "./pages/History"
import Profile from "./pages/Profile"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ===== PUBLIC ===== */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/oauth-success" element={<OAuthSuccess />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Convert3D />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/profile" element={<Profile />} />

            {/* ===== ADMIN ONLY ===== */}
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />
          </Route>
        </Route>

      </Routes>
    </BrowserRouter>
  )
}
