import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { api } from '../api'
import useApi from '../hooks/useApi'
import { useToast } from '../context/ToastContext'
import AuthShell from '../components/AuthShell'

/** Elige una clave nueva con el enlace del correo (/restablecer#token=...). */
export default function Restablecer() {
  const { data: pub } = useApi('/public')
  const navigate = useNavigate()
  const notify = useToast()
  // El token viaja en el fragmento (#): no llega a los logs del servidor. Se guarda en el estado y se
  // quita de la barra de direcciones para que no quede en el historial.
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '')
  const [form, setForm] = useState({ password: '', password2: '' })
  const [error, setError] = useState(token ? '' : 'Este enlace no es válido.')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (window.location.hash) window.history.replaceState(null, '', window.location.pathname) }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.password2) return setError('Las claves no coinciden.')
    setBusy(true); setError('')
    try {
      await api('/password/reset', { method: 'POST', body: { token, password: form.password } })
      notify('Clave actualizada. Ya puedes ingresar.')
      navigate('/login', { replace: true })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <AuthShell title="Elige una clave nueva" subtitle="Usa al menos 6 caracteres." pub={pub}>
      <Box component="form" onSubmit={submit}>
        <Stack spacing={2}>
          {error && (
            <Alert severity="error">
              {error}{' '}
              {error.includes('enlace') && <Link component={RouterLink} to="/recuperar" fontWeight={600}>Pedir un enlace nuevo</Link>}
            </Alert>
          )}
          <TextField label="Clave nueva" type="password" autoComplete="new-password" required autoFocus disabled={!token}
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <TextField label="Repite la clave nueva" type="password" autoComplete="new-password" required disabled={!token}
            value={form.password2} onChange={(e) => setForm({ ...form, password2: e.target.value })} />
          <Button type="submit" variant="contained" size="large" disabled={busy || !token || form.password.length < 6}>Guardar clave</Button>
        </Stack>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        <Link component={RouterLink} to="/login" fontWeight={600}>Volver a ingresar</Link>
      </Typography>
    </AuthShell>
  )
}
