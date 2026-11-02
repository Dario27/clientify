import { Navigate, Route, Routes } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import ClientLayout from './components/ClientLayout'
import AdminLayout from './components/AdminLayout'
import Account from './pages/client/Account'
import Dashboard from './pages/admin/Dashboard'
import Clients from './pages/admin/Clients'
import Scan from './pages/admin/Scan'
import Reactivar from './pages/admin/Reactivar'
import Agenda from './pages/admin/Agenda'
import Services from './pages/admin/Services'
import Turnos from './pages/client/Turnos'
import ClientDetail from './pages/admin/ClientDetail'
import Redemptions from './pages/admin/Redemptions'
import Rewards from './pages/admin/Rewards'
import Settings from './pages/admin/Settings'

const home = (u) => (u?.role === 'admin' ? '/admin' : '/mi-cuenta')

function RequireRole({ role, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={home(user)} replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home(user)} replace /> : <Login />} />
      <Route path="/registro" element={user ? <Navigate to={home(user)} replace /> : <Register />} />
      <Route element={<RequireRole role="client"><ClientLayout /></RequireRole>}>
        <Route path="/mi-cuenta" element={<Account />} />
        <Route path="/turnos" element={<Turnos />} />
      </Route>
      <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
        <Route index element={<Dashboard />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="escanear" element={<Scan />} />
        <Route path="reactivar" element={<Reactivar />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="clientes/:id" element={<ClientDetail />} />
        <Route path="canjes" element={<Redemptions />} />
        <Route path="beneficios" element={<Rewards />} />
        <Route path="servicios" element={<Services />} />
        <Route path="configuracion" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? home(user) : '/login'} replace />} />
    </Routes>
  )
}
