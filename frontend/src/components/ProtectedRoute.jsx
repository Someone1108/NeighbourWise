import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children }) {
  const hasAccess = sessionStorage.getItem('nw_access_granted') === 'true'

  if (!hasAccess) {
    return <Navigate to="/access" replace />
  }

  return children
}