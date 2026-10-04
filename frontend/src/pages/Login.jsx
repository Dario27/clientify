import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { useAuth } from '../context/AuthContext'
import useApi from '../hooks/useApi'
import AuthShell from '../components/AuthShell'

export default function Login() {
  const { login } = useAuth()
  const { data: pub } = useApi('/public')
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await login(form.email, form.password) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <AuthShell title="Ingresa a tu cuenta" subtitle="Consulta y canjea tus puntos." pub={pub}>
      <Box component="form" onSubmit={submit}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Correo" type="email" autoComplete="email" required autoFocus
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextField label="Contraseña" type="password" autoComplete="current-password" required
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Button type="submit" variant="contained" size="large" disabled={busy}>Ingresar</Button>
        </Stack>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        ¿No tienes cuenta?{' '}
        <Link component={RouterLink} to="/registro" fontWeight={600}>Regístrate y gana {pub?.welcome_bonus ?? ''} pts</Link>
      </Typography>
    </AuthShell>
  )
}
