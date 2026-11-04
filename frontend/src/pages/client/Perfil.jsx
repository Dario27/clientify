import { useState } from 'react'
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import KeyRounded from '@mui/icons-material/KeyRounded'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../../components/PageHeader'
import ChangePasswordDialog from '../../components/ChangePasswordDialog'
import { todayISO } from '../../utils'

export default function Perfil() {
  const { user, refresh } = useAuth()
  const notify = useToast()
  const start = { name: user.name, phone: user.phone || '', birthday: user.birthday || '' }
  const [form, setForm] = useState(start)
  const [saved, setSaved] = useState(start) // últimos valores guardados, para saber si hay cambios
  const [busy, setBusy] = useState(false)
  const [pwd, setPwd] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const dirty = Object.keys(form).some((k) => form[k] !== saved[k])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/profile', { method: 'PUT', body: form })
      setSaved(form)
      await refresh() // actualiza el nombre que se ve en la barra superior
      notify('Perfil actualizado')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Mi perfil" subtitle="Mantén tus datos al día para que la barbería pueda avisarte de tus turnos." />
      <Box sx={{ display: 'grid', gap: 2, maxWidth: 640 }}>
        <Card>
          <CardContent component="form" onSubmit={submit} sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Tus datos</Typography>
            <Stack spacing={2}>
              <TextField label="Nombre" required value={form.name} onChange={set('name')} autoComplete="name" />
              <TextField
                label="Correo" value={user.email} disabled
                helperText="Es el correo con el que entras. Para cambiarlo, pídeselo a la barbería."
              />
              <TextField
                label="Teléfono" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel"
                helperText="Lo usa la barbería para escribirte por WhatsApp."
              />
              <TextField
                label="Cumpleaños" type="date" value={form.birthday} onChange={set('birthday')}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayISO() } }}
              />
              <Box><Button type="submit" variant="contained" disabled={busy || !dirty || form.name.trim().length < 2}>Guardar cambios</Button></Box>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="h6">Clave</Typography>
              <Typography variant="body2" color="text.secondary">Cámbiala cuando quieras; te pedimos la actual.</Typography>
            </Box>
            <Button variant="outlined" startIcon={<KeyRounded />} onClick={() => setPwd(true)}>Cambiar clave</Button>
          </CardContent>
        </Card>
      </Box>
      <ChangePasswordDialog open={pwd} onClose={() => setPwd(false)} />
    </>
  )
}
