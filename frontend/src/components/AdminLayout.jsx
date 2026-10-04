import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  AppBar, Avatar, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import DashboardRounded from '@mui/icons-material/DashboardRounded'
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded'
import RedeemRounded from '@mui/icons-material/RedeemRounded'
import CardGiftcardRounded from '@mui/icons-material/CardGiftcardRounded'
import TuneRounded from '@mui/icons-material/TuneRounded'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import MenuRounded from '@mui/icons-material/MenuRounded'
import { useAuth } from '../context/AuthContext'
import useApi from '../hooks/useApi'
import Logo from './Logo'
import { initials } from '../utils'

const WIDTH = 248
const NAV = [
  { to: '/admin', label: 'Resumen', icon: <DashboardRounded />, end: true },
  { to: '/admin/clientes', label: 'Clientes', icon: <PeopleAltRounded /> },
  { to: '/admin/canjes', label: 'Canjes', icon: <RedeemRounded /> },
  { to: '/admin/beneficios', label: 'Beneficios', icon: <CardGiftcardRounded /> },
  { to: '/admin/configuracion', label: 'Configuración', icon: <TuneRounded /> },
]

export default function AdminLayout() {
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const { data: pub } = useApi('/public')
  const { pathname } = useLocation()

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 2.5, py: 2.5 }}><Logo subtitle={pub?.business_name} /></Box>
      <List sx={{ px: 1.5, flex: 1 }}>
        {NAV.map((n) => (
          <ListItemButton
            key={n.to} component={NavLink} to={n.to} end={n.end}
            onClick={() => setOpen(false)}
            sx={{
              borderRadius: 2, mb: 0.5, color: 'text.secondary',
              '&.active': { bgcolor: 'rgba(229,169,59,0.12)', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } },
            }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>{n.icon}</ListItemIcon>
            <ListItemText primary={n.label} slotProps={{ primary: { fontWeight: 600, fontSize: 14 } }} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', width: 34, height: 34, fontSize: 14, fontWeight: 700 }}>
          {initials(user?.name)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>{user?.name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{user?.email}</Typography>
        </Box>
        <Tooltip title="Cerrar sesión"><IconButton size="small" onClick={logout}><LogoutRounded fontSize="small" /></IconButton></Tooltip>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {!desktop && (
        <AppBar position="fixed" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar>
            <IconButton edge="start" onClick={() => setOpen(true)} sx={{ mr: 1 }}><MenuRounded /></IconButton>
            <Logo />
          </Toolbar>
        </AppBar>
      )}
      <Drawer
        variant={desktop ? 'permanent' : 'temporary'}
        open={desktop || open}
        onClose={() => setOpen(false)}
        sx={{ width: WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: WIDTH, boxSizing: 'border-box' } }}
      >
        {drawer}
      </Drawer>
      <Box component="main" key={pathname} sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 3, lg: 4 }, pt: { xs: 10, md: 4 }, maxWidth: 1280 }}>
        <Outlet />
      </Box>
    </Box>
  )
}
