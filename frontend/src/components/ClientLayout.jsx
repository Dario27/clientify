import { Outlet } from 'react-router-dom'
import { AppBar, Avatar, Box, Button, Container, Toolbar, Typography } from '@mui/material'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import { useAuth } from '../context/AuthContext'
import useApi from '../hooks/useApi'
import Logo from './Logo'
import { initials } from '../utils'

export default function ClientLayout() {
  const { user, logout } = useAuth()
  const { data: pub } = useApi('/public')
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ gap: 2 }}>
            <Logo subtitle={pub?.business_name} />
            <Box sx={{ flex: 1 }} />
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ width: 30, height: 30, fontSize: 13, fontWeight: 700, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                {initials(user?.name)}
              </Avatar>
              <Typography variant="body2" fontWeight={600}>{user?.name}</Typography>
            </Box>
            <Button color="inherit" size="small" startIcon={<LogoutRounded />} onClick={logout}>Salir</Button>
          </Toolbar>
        </Container>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 4 } }}>
        <Outlet />
      </Container>
    </Box>
  )
}
