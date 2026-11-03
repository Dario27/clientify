import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import { api } from '../api'
import { useToast } from '../context/ToastContext'

const EMPTY = { current: '', next: '', repeat: '' }

/** Cambio de clave propio (cliente o admin): pide la clave actual. */
export default function ChangePasswordDialog({ open, onClose }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const notify = useToast()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const close = () => { setForm(EMPTY); onClose() }
  const mismatch = form.repeat !== '' && form.next !== form.repeat
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/password', { method: 'POST', body: { current_password: form.current, new_password: form.next } })
      notify('Clave actualizada')
      close()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs" component="form" onSubmit={submit}>
      <DialogTitle>Cambiar clave</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Clave actual" type="password" required autoFocus autoComplete="current-password" value={form.current} onChange={set('current')} />
          <TextField label="Nueva clave" type="password" required autoComplete="new-password" value={form.next} onChange={set('next')} helperText="Mínimo 6 caracteres." />
          <TextField label="Repite la nueva clave" type="password" required autoComplete="new-password" value={form.repeat} onChange={set('repeat')} error={mismatch} helperText={mismatch ? 'Las claves no coinciden.' : ' '} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} color="inherit">Cancelar</Button>
        <Button type="submit" variant="contained" disabled={busy || !form.current || form.next.length < 6 || form.next !== form.repeat}>Guardar</Button>
      </DialogActions>
    </Dialog>
  )
}
