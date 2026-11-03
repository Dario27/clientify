import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, IconButton, InputAdornment, LinearProgress, Link, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import EventRounded from '@mui/icons-material/EventRounded'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import useApi from '../../hooks/useApi'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import SlotPicker from '../../components/SlotPicker'
import StatusChip from '../../components/StatusChip'
import { addDays, fmtDay, fmtRange, todayISO } from '../../utils'

/** Agenda un turno para un cliente que llamó o está en el local. */
function NewAppointmentDialog({ open, day, onClose, onCreated }) {
  const notify = useToast()
  const clients = useApi('/admin/clients')
  const services = useApi('/booking')
  const [client, setClient] = useState(null)
  const [pick, setPick] = useState({ serviceId: null, date: day, time: '' })
  const [version, setVersion] = useState(0)

  useEffect(() => { if (open) setPick({ serviceId: null, date: day, time: '' }) }, [open, day])

  const close = () => { setClient(null); setPick({ serviceId: null, date: day, time: '' }); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api('/admin/appointments', { method: 'POST', body: { user_id: client.id, service_id: pick.serviceId, date: pick.date, time: pick.time } })
      notify('Turno agendado')
      onCreated(pick.date); close()
    } catch (err) {
      notify(err.message, 'error')
      setPick({ ...pick, time: '' }); setVersion((v) => v + 1)
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" component="form" onSubmit={submit}>
      <DialogTitle>Nuevo turno</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Autocomplete
            options={clients.data || []} value={client} onChange={(_, v) => setClient(v)}
            getOptionLabel={(c) => `${c.name}${c.phone ? ` · ${c.phone}` : ''}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText="No hay clientes con ese nombre. Usa Registro rápido en Clientes."
            renderInput={(params) => <TextField {...params} label="Cliente" required />}
          />
          {services.data && (services.data.services.length
            ? <SlotPicker services={services.data.services} dates={null} value={pick} onChange={setPick} reloadKey={version} />
            : <Alert severity="info">Primero crea los servicios en la sección Servicios.</Alert>)}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={close}>Cancelar</Button>
        <Button type="submit" variant="contained" disabled={!client || !pick.serviceId || !pick.time}>Agendar</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function Agenda() {
  const [day, setDay] = useState(todayISO())
  const { data, loading, error, reload } = useApi(`/admin/appointments?date=${day}`)
  const notify = useToast()
  const [attend, setAttend] = useState(null) // turno que se está marcando como atendido
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)

  const act = async (a, action, ok) => {
    try { await api(`/admin/appointments/${a.id}/${action}`, { method: 'POST' }); notify(ok); reload() }
    catch (e) { notify(e.message, 'error') }
  }
  const remind = async (a) => {
    try { await api(`/admin/appointments/${a.id}/reminded`, { method: 'POST' }); reload() } catch { /* el enlace igual se abre */ }
  }
  const openAttend = (a) => { setAttend(a); setAmount(String(a.price)) }
  const doAttend = async (e) => {
    e.preventDefault()
    try {
      const r = await api(`/admin/appointments/${attend.id}/atender`, { method: 'POST', body: { amount } })
      notify(`Visita registrada: ${r.points} pts para ${attend.client_name}`)
      setAttend(null); reload()
    } catch (err) { notify(err.message, 'error') }
  }

  const list = data?.appointments || []
  const pending = list.filter((a) => a.status === 'reservado').length

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={data ? `${fmtDay(day)} · ${list.length} turno${list.length !== 1 ? 's' : ''}${pending ? `, ${pending} por atender` : ''}` : ' '}
        action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>Nuevo turno</Button>}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <IconButton onClick={() => setDay(addDays(day, -1))}><ChevronLeftRounded /></IconButton>
        <TextField
          type="date" size="small" value={day} onChange={(e) => e.target.value && setDay(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><EventRounded fontSize="small" /></InputAdornment> } }}
        />
        <IconButton onClick={() => setDay(addDays(day, 1))}><ChevronRightRounded /></IconButton>
        <Button size="small" variant={day === todayISO() ? 'contained' : 'outlined'} onClick={() => setDay(todayISO())}>Hoy</Button>
        <Button size="small" variant={day === addDays(todayISO(), 1) ? 'contained' : 'outlined'} onClick={() => setDay(addDays(todayISO(), 1))}>Mañana</Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        {loading && <LinearProgress />}
        {data && (list.length ? (
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
            {list.map((a) => (
              <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, flexWrap: 'wrap', opacity: a.status === 'cancelado' ? 0.55 : 1 }}>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main', minWidth: 110 }}>{fmtRange(a)}</Typography>
                <Box sx={{ flex: 1, minWidth: 170 }}>
                  <Link component={RouterLink} to={`/admin/clientes/${a.user_id}`} underline="hover" color="text.primary" fontWeight={600}>{a.client_name}</Link>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{a.service_name} · ${a.price.toFixed(2)}</Typography>
                </Box>
                <StatusChip status={a.status} />
                {a.status === 'reservado' && (
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    {a.whatsapp_url ? (
                      <Tooltip title={a.reminded_at ? `Recordatorio enviado ${a.reminded_at.slice(5, 16)}` : 'Abre WhatsApp con el recordatorio escrito'}>
                        <Button
                          component="a" href={a.whatsapp_url} target="_blank" rel="noopener noreferrer" size="small" variant="outlined"
                          color={a.reminded_at ? 'inherit' : 'success'} startIcon={<WhatsAppIcon />} onClick={() => remind(a)}
                        >
                          {a.reminded_at ? 'Recordado' : 'Recordar'}
                        </Button>
                      </Tooltip>
                    ) : <Chip size="small" variant="outlined" label="Sin teléfono" />}
                    <Button size="small" variant="contained" color="success" onClick={() => openAttend(a)}>Atendido</Button>
                    <Button size="small" color="inherit" onClick={() => act(a, 'ausente', `${a.client_name} marcado como ausente`)}>No vino</Button>
                    <Button size="small" color="error" onClick={() => act(a, 'cancelar', 'Turno cancelado')}>Cancelar</Button>
                  </Stack>
                )}
              </Box>
            ))}
          </Stack>
        ) : <EmptyState icon={<EventRounded />} text="No hay turnos para este día." />)}
      </Card>

      <Dialog open={!!attend} onClose={() => setAttend(null)} fullWidth maxWidth="xs" component="form" onSubmit={doAttend}>
        <DialogTitle>Registrar visita</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {attend && `${attend.client_name} · ${attend.service_name}. Se le suman puntos según el monto.`}
          </DialogContentText>
          <TextField
            label="Monto cobrado" type="number" required fullWidth autoFocus value={amount} onChange={(e) => setAmount(e.target.value)}
            slotProps={{ htmlInput: { min: 0, step: '0.01' }, input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
            helperText="Cambia el monto si cobraste algo distinto al precio del servicio."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setAttend(null)}>Cancelar</Button>
          <Button type="submit" variant="contained" color="success" disabled={!(parseFloat(amount) > 0)}>Registrar</Button>
        </DialogActions>
      </Dialog>

      <NewAppointmentDialog open={creating} day={day} onClose={() => setCreating(false)} onCreated={(d) => { setDay(d); reload() }} />
    </>
  )
}
