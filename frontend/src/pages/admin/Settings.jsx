import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Divider, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import useApi from '../../hooks/useApi'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../../components/PageHeader'

const pts = { input: { endAdornment: <InputAdornment position="end">pts</InputAdornment> }, htmlInput: { min: 0 } }

export default function Settings() {
  const { data, error } = useApi('/admin/settings')
  const notify = useToast()
  const [form, setForm] = useState(null)
  useEffect(() => { if (data) setForm(data) }, [data])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    try { setForm(await api('/admin/settings', { method: 'PUT', body: form })); notify('Configuración guardada') }
    catch (err) { notify(err.message, 'error') }
  }

  if (error) return <Alert severity="error">{error}</Alert>
  if (!form) return null
  return (
    <>
      <PageHeader title="Configuración" subtitle="Reglas generales del programa de puntos." />
      <Card sx={{ maxWidth: 640 }}>
        <CardContent component="form" onSubmit={save} sx={{ p: 3 }}>
          <Stack spacing={3}>
            <TextField label="Nombre de la barbería" value={form.business_name} onChange={set('business_name')} />
            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>Acumulación</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Puntos por cada $1" type="number" value={form.points_per_dollar} onChange={set('points_per_dollar')} slotProps={pts} />
                <TextField label="Bono de bienvenida" type="number" value={form.welcome_bonus} onChange={set('welcome_bonus')} slotProps={pts} helperText="Al registrarse" />
              </Stack>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>Referidos</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Para quien refiere" type="number" value={form.referral_bonus_referrer} onChange={set('referral_bonus_referrer')} slotProps={pts} />
                <TextField label="Para el nuevo cliente" type="number" value={form.referral_bonus_referred} onChange={set('referral_bonus_referred')} slotProps={pts} helperText="Se suma al bono de bienvenida" />
              </Stack>
            </Box>
            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>Cumpleaños</Typography>
              <Stack spacing={2}>
                <TextField
                  label="Regalo de cumpleaños" type="number" value={form.birthday_bonus} onChange={set('birthday_bonus')} slotProps={pts}
                  helperText="Se entrega una vez al año, cuando el cliente abre la app en su mes de cumpleaños. Con 0 se desactiva."
                />
                <TextField
                  label="Mensaje de saludo (WhatsApp)" multiline minRows={2} value={form.birthday_message} onChange={set('birthday_message')}
                  helperText="Puedes usar {nombre}, {negocio} y {bono}."
                />
              </Stack>
            </Box>
            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>Clientes inactivos</Typography>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Se considera inactivo después de" type="number" value={form.inactive_days} onChange={set('inactive_days')}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">días</InputAdornment> }, htmlInput: { min: 1 } }}
                  />
                  <TextField
                    label="Código de país" type="number" value={form.whatsapp_country_code} onChange={set('whatsapp_country_code')}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">+</InputAdornment> }, htmlInput: { min: 1 } }}
                    helperText="Para armar el enlace de WhatsApp (593 = Ecuador)"
                  />
                </Stack>
                <TextField
                  label="Mensaje para reactivarlos (WhatsApp)" multiline minRows={2} value={form.reactivation_message} onChange={set('reactivation_message')}
                  helperText="Puedes usar {nombre}, {negocio} y {puntos}."
                />
              </Stack>
            </Box>
            <Box><Button type="submit" variant="contained">Guardar cambios</Button></Box>
          </Stack>
        </CardContent>
      </Card>
    </>
  )
}
