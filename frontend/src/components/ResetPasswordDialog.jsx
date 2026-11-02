import { useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@mui/material'
import { api } from '../api'
import { useToast } from '../context/ToastContext'
import { generatePassword } from '../utils'

/** El admin define una clave nueva para un cliente que la olvidó y se la entrega en persona. */
export default function ResetPasswordDialog({ open, client, onClose }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const notify = useToast()
  useEffect(() => { if (open) setPassword(generatePassword()) }, [open])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api(`/admin/clients/${client.id}/password`, { method: 'POST', body: { new_password: password } })
      notify(`Clave de ${client.name} restablecida`)
      onClose()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" component="form" onSubmit={submit}>
      <DialogTitle>Restablecer clave</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {client.name} entrará con esta clave. Anótala o díctasela: después no se puede volver a ver.
        </DialogContentText>
        <TextField
          label="Clave nueva" required fullWidth autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
          slotProps={{ htmlInput: { style: { fontFamily: 'monospace', letterSpacing: 1 } } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancelar</Button>
        <Button type="submit" variant="contained" disabled={busy || password.length < 6}>Restablecer</Button>
      </DialogActions>
    </Dialog>
  )
}
