import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from '@mui/material'
import { api } from '../api'
import { useToast } from '../context/ToastContext'
import { generatePassword } from '../utils'

const empty = () => ({ name: '', phone: '', email: '', birthday: '', password: generatePassword() })

/** Alta rápida de un cliente en el mostrador, con una clave inicial que el admin le entrega. */
export default function QuickRegisterDialog({ open, onClose }) {
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const notify = useToast()
  const navigate = useNavigate()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const close = () => { setForm(empty()); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { id } = await api('/admin/clients', { method: 'POST', body: form })
      notify('Cliente registrado')
      close()
      navigate(`/admin/clientes/${id}`)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs" component="form" onSubmit={submit}>
      <DialogTitle>Registro rápido</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Para clientes que están en el local. Recibe el bono de bienvenida. Entrégale la clave para que pueda entrar a la app con su correo.
        </DialogContentText>
        <Stack spacing={2}>
          <TextField label="Nombre" required autoFocus value={form.name} onChange={set('name')} />
          <TextField label="Teléfono" type="tel" value={form.phone} onChange={set('phone')} />
          <TextField label="Correo" type="email" required value={form.email} onChange={set('email')} />
          <TextField
            label="Cumpleaños (opcional)" type="date" value={form.birthday} onChange={set('birthday')}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: new Date().toISOString().slice(0, 10) } }}
          />
          <TextField
            label="Clave inicial" required value={form.password} onChange={set('password')}
            helperText="Anótala o díctasela al cliente: después no se puede volver a ver."
            slotProps={{ htmlInput: { style: { fontFamily: 'monospace', letterSpacing: 1 } } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} color="inherit">Cancelar</Button>
        <Button type="submit" variant="contained" disabled={busy || form.name.trim().length < 2 || !form.email.includes('@') || form.password.length < 6}>Registrar</Button>
      </DialogActions>
    </Dialog>
  )
}
