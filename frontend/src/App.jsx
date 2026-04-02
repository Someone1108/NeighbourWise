import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import NavigationBar from './components/NavigationBar.jsx'
import HomePage from './pages/HomePage.jsx'
import AboutPage from './pages/AboutPage.jsx'
import MapPage from './pages/MapPage.jsx'
import InsightsPage from './pages/InsightsPage.jsx'
import ComparePage from './pages/ComparePage.jsx'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="nwAppShell">
        <NavigationBar />
        <main className="nwMain">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
