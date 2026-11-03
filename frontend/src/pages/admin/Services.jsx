import { useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import EditRounded from '@mui/icons-material/EditRounded'
import ContentCutRounded from '@mui/icons-material/ContentCutRounded'
import useApi from '../../hooks/useApi'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'

const EMPTY = { name: '', duration_min: 30, price: '' }

export default function Services() {
  const { data, error, reload } = useApi('/admin/services')
  const notify = useToast()
  const [edit, setEdit] = useState(null)
  const [formError, setFormError] = useState('')

  const open = (s) => { setFormError(''); setEdit(s ? { ...s } : { ...EMPTY }) }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    try {
      await api(edit.id ? `/admin/services/${edit.id}` : '/admin/services', { method: edit.id ? 'PUT' : 'POST', body: edit })
      notify(edit.id ? 'Servicio actualizado' : 'Servicio creado')
      setEdit(null); reload()
    } catch (err) { setFormError(err.message) }
  }
  const toggle = async (s) => {
    try {
      await api(`/admin/services/${s.id}/toggle`, { method: 'POST' })
      notify(s.active ? `«${s.name}» ya no se puede reservar` : `«${s.name}» disponible para reservar`); reload()
    } catch (e) { notify(e.message, 'error') }
  }

  return (
    <>
      <PageHeader
        title="Servicios"
        subtitle="Lo que tus clientes pueden reservar. La duración define cuánto tiempo ocupa en la agenda y el precio se usa para sumar puntos al atenderlos."
        action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => open(null)}>Nuevo servicio</Button>}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {data && (data.length ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
          {data.map((s) => (
            <Card key={s.id} sx={{ opacity: s.active ? 1 : 0.55 }}>
              <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(229,169,59,0.14)', color: 'primary.main' }}><ContentCutRounded fontSize="small" /></Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={700} noWrap>{s.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{s.duration_min} min · ${s.price.toFixed(2)}</Typography>
                </Box>
                <Tooltip title="Editar"><IconButton size="small" onClick={() => open(s)}><EditRounded fontSize="small" /></IconButton></Tooltip>
                <Tooltip title={s.active ? 'Reservable — clic para ocultar' : 'Oculto — clic para activar'}><Switch size="small" checked={!!s.active} onChange={() => toggle(s)} /></Tooltip>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : <Card><EmptyState icon={<ContentCutRounded />} text="Aún no hay servicios. Crea el primero para que tus clientes puedan reservar turnos." /></Card>)}

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="xs" fullWidth>
        {edit && (
          <Box component="form" onSubmit={save}>
            <DialogTitle>{edit.id ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 1 }}>
                {formError && <Alert severity="error">{formError}</Alert>}
                <TextField label="Nombre" required autoFocus value={edit.name} onChange={set('name')} placeholder="Corte + barba" />
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Duración" type="number" required value={edit.duration_min} onChange={set('duration_min')}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">min</InputAdornment> }, htmlInput: { min: 5, max: 480 } }}
                  />
                  <TextField
                    label="Precio" type="number" required value={edit.price} onChange={set('price')}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> }, htmlInput: { min: 0, step: '0.01' } }}
                  />
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button color="inherit" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button type="submit" variant="contained">{edit.id ? 'Guardar cambios' : 'Crear servicio'}</Button>
            </DialogActions>
          </Box>
        )}
      </Dialog>
    </>
  )
}
