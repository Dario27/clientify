import { useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material'
import GroupAddRounded from '@mui/icons-material/GroupAddRounded'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import useApi from '../hooks/useApi'
import AuthShell from '../components/AuthShell'

export default function Register() {
  const [params] = useSearchParams()
  const ref = (params.get('ref') || '').toUpperCase()
  const { register } = useAuth()
  const notify = useToast()
  const { data: pub } = useApi(`/public${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`)
  const [form, setForm] = useState({ name: '', email: '', phone: '', birthday: '', password: '', password2: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.password2) return setError('Las contraseñas no coinciden.')
    setBusy(true); setError('')
    try {
      const u = await register({ ...form, ref })
      notify(`¡Bienvenido, ${u.name.split(' ')[0]}! Ya tienes ${u.points} puntos.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const bonus = pub ? pub.welcome_bonus + (pub.referrer ? pub.referral_bonus_referred : 0) : null

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle={bonus ? `Empieza con ${bonus} puntos de regalo.` : 'Empieza a acumular puntos.'}
      pub={pub}
    >
      {pub?.referrer && (
        <Alert icon={<GroupAddRounded />} severity="warning" variant="outlined" sx={{ mb: 2 }}>
          Te invitó <strong>{pub.referrer}</strong>. Al registrarte, ambos ganan puntos extra.
        </Alert>
      )}
      {ref && pub && !pub.referrer && (
        <Alert severity="error" sx={{ mb: 2 }}>El código de referido «{ref}» no es válido.</Alert>
      )}
      <Box component="form" onSubmit={submit}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Nombre completo" required value={form.name} onChange={set('name')} autoComplete="name" />
          <TextField label="Correo" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
          <TextField label="Teléfono (opcional)" value={form.phone} onChange={set('phone')} autoComplete="tel" />
          <TextField
            label="Cumpleaños (opcional)" type="date" value={form.birthday} onChange={set('birthday')}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: new Date().toISOString().slice(0, 10) } }}
          />
          <Stack spacing={2}>
            <TextField label="Contraseña" type="password" required value={form.password} onChange={set('password')}
              helperText="Mínimo 6 caracteres" slotProps={{ htmlInput: { minLength: 6 } }} autoComplete="new-password" />
            <TextField label="Confirmar contraseña" type="password" required value={form.password2} onChange={set('password2')}
              autoComplete="new-password" />
          </Stack>
          <Button type="submit" variant="contained" size="large" disabled={busy || (ref && pub && !pub.referrer)}>
            Crear cuenta
          </Button>
        </Stack>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        ¿Ya tienes cuenta? <Link component={RouterLink} to="/login" fontWeight={600}>Ingresa</Link>
      </Typography>
    </AuthShell>
  )
}
