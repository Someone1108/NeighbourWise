import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import NavigationBar from './components/NavigationBar.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import HomePage from './pages/HomePage.jsx'
import AboutPage from './pages/AboutPage.jsx'
import MapPage from './pages/MapPage.jsx'
import InsightsPage from './pages/InsightsPage.jsx'
import ComparePage from './pages/ComparePage.jsx'
import AccessPage from './pages/AccessPage.jsx'
import './App.css'

function AppLayout() {
  const location = useLocation()
  const hideNav = location.pathname === '/access'

  return (
    <div className="nwAppShell">
      {!hideNav && <NavigationBar />}

      <main className="nwMain">
        <Routes>
          <Route path="/access" element={<AccessPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/about"
            element={
              <ProtectedRoute>
                <AboutPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/map"
            element={
              <ProtectedRoute>
                <MapPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights"
            element={
              <ProtectedRoute>
                <InsightsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/compare"
            element={
              <ProtectedRoute>
                <ComparePage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}