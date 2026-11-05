import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { api } from '../api'
import useApi from '../hooks/useApi'
import AuthShell from '../components/AuthShell'

/** Pide el enlace para restablecer la clave. La respuesta es siempre la misma, exista o no el correo. */
export default function Recuperar() {
  const { data: pub } = useApi('/public')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('/password/forgot', { method: 'POST', body: { email } })
      setSent(true)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <AuthShell title="Recupera tu clave" subtitle="Te enviamos un enlace a tu correo." pub={pub}>
      {sent ? (
        <Stack spacing={2}>
          <Alert severity="success">
            Si <strong>{email.trim()}</strong> está registrado, te enviamos un enlace para elegir una nueva clave.
            Vale 60 minutos; si no lo ves, revisa la carpeta de spam.
          </Alert>
          <Button variant="outlined" onClick={() => setSent(false)}>Usar otro correo</Button>
        </Stack>
      ) : (
        <Box component="form" onSubmit={submit}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Correo" type="email" autoComplete="email" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" variant="contained" size="large" disabled={busy || !email.includes('@')}>Enviar enlace</Button>
          </Stack>
        </Box>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        <Link component={RouterLink} to="/login" fontWeight={600}>Volver a ingresar</Link>
      </Typography>
    </AuthShell>
  )
}
