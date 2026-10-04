import { useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import EditRounded from '@mui/icons-material/EditRounded'
import ContentCutRounded from '@mui/icons-material/ContentCutRounded'
import ShoppingBagRounded from '@mui/icons-material/ShoppingBagRounded'
import CardGiftcardRounded from '@mui/icons-material/CardGiftcardRounded'
import useApi from '../../hooks/useApi'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'

const EMPTY = { name: '', description: '', category: 'servicio', points_cost: '', stock: '' }

export default function Rewards() {
  const { data, error, reload } = useApi('/admin/rewards')
  const notify = useToast()
  const [edit, setEdit] = useState(null) // null | {..., id?}
  const [formError, setFormError] = useState('')

  const open = (r) => {
    setFormError('')
    setEdit(r ? { ...r, stock: r.stock ?? '' } : { ...EMPTY })
  }
  const save = async (e) => {
    e.preventDefault()
    try {
      await api(edit.id ? `/admin/rewards/${edit.id}` : '/admin/rewards', { method: edit.id ? 'PUT' : 'POST', body: edit })
      notify(edit.id ? 'Beneficio actualizado' : 'Beneficio creado')
      setEdit(null); reload()
    } catch (err) { setFormError(err.message) }
  }
  const toggle = async (r) => {
    try {
      await api(`/admin/rewards/${r.id}/toggle`, { method: 'POST' })
      notify(r.active ? `«${r.name}» oculto para clientes` : `«${r.name}» visible para clientes`); reload()
    } catch (e) { notify(e.message, 'error') }
  }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value })

  return (
    <>
      <PageHeader
        title="Beneficios"
        subtitle="Define qué pueden canjear tus clientes y cuántos puntos cuesta."
        action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => open(null)}>Nuevo beneficio</Button>}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {data && (data.length ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
          {data.map((r) => {
            const Icon = r.category === 'producto' ? ShoppingBagRounded : ContentCutRounded
            return (
              <Card key={r.id} sx={{ opacity: r.active ? 1 : 0.55 }}>
                <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(229,169,59,0.14)', color: 'primary.main' }}><Icon fontSize="small" /></Box>
                    <Chip size="small" label={r.category === 'producto' ? 'Producto' : 'Servicio'} sx={{ bgcolor: 'rgba(148,163,184,0.12)' }} />
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title="Editar"><IconButton size="small" onClick={() => open(r)}><EditRounded fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title={r.active ? 'Visible — clic para ocultar' : 'Oculto — clic para activar'}><Switch size="small" checked={!!r.active} onChange={() => toggle(r)} /></Tooltip>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={700}>{r.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{r.description || 'Sin descripción'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: 24, fontWeight: 800, color: 'primary.main' }}>{r.points_cost} <Box component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>pts</Box></Typography>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Stock: {r.stock ?? '∞'}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.n_redeemed} canje{r.n_redeemed !== 1 && 's'}</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            )
          })}
        </Box>
      ) : <Card><EmptyState icon={<CardGiftcardRounded />} text="Aún no hay beneficios. Crea el primero." /></Card>)}

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="sm" fullWidth>
        {edit && (
          <Box component="form" onSubmit={save}>
            <DialogTitle>{edit.id ? 'Editar beneficio' : 'Nuevo beneficio'}</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 1 }}>
                {formError && <Alert severity="error">{formError}</Alert>}
                <TextField label="Nombre" required value={edit.name} onChange={set('name')} placeholder="Corte con estilo" />
                <TextField label="Descripción" multiline minRows={2} value={edit.description || ''} onChange={set('description')} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField select label="Tipo" value={edit.category} onChange={set('category')}>
                    <MenuItem value="servicio">Servicio</MenuItem>
                    <MenuItem value="producto">Producto</MenuItem>
                  </TextField>
                  <TextField label="Costo en puntos" type="number" required value={edit.points_cost} onChange={set('points_cost')} slotProps={{ htmlInput: { min: 1 } }} />
                  <TextField label="Stock" type="number" value={edit.stock} onChange={set('stock')} helperText="Vacío = ilimitado" slotProps={{ htmlInput: { min: 0 } }} />
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button color="inherit" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button type="submit" variant="contained">{edit.id ? 'Guardar cambios' : 'Crear beneficio'}</Button>
            </DialogActions>
          </Box>
        )}
      </Dialog>
    </>
  )
}
