import { useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Skeleton, Stack, Typography,
} from '@mui/material'
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded'
import useApi from '../../hooks/useApi'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../../components/PageHeader'
import SlotPicker from '../../components/SlotPicker'
import StatusChip from '../../components/StatusChip'
import EmptyState from '../../components/EmptyState'
import { fmtDay, fmtRange } from '../../utils'

const EMPTY = { serviceId: null, date: '', time: '' }

export default function Turnos() {
  const booking = useApi('/booking')
  const mine = useApi('/appointments')
  const notify = useToast()
  const [pick, setPick] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [cancel, setCancel] = useState(null)

  if (booking.loading || mine.loading) return <Stack spacing={2}><Skeleton variant="rounded" height={260} /><Skeleton variant="rounded" height={160} /></Stack>
  if (booking.error || mine.error) return <Alert severity="error">{booking.error || mine.error}</Alert>
  const { services, dates, max_active: maxActive } = booking.data
  const { upcoming, past } = mine.data

  const reserve = async () => {
    setBusy(true)
    try {
      await api('/appointments', { method: 'POST', body: { service_id: pick.serviceId, date: pick.date, time: pick.time } })
      notify('Turno reservado. ¡Te esperamos!')
      setPick(EMPTY); mine.reload()
    } catch (e) {
      notify(e.message, 'error')
      setPick({ ...pick, time: '' }); setVersion((v) => v + 1) // la hora pudo ocuparse: volver a pedir las libres
    } finally { setBusy(false) }
  }
  const doCancel = async () => {
    try { await api(`/appointments/${cancel.id}/cancel`, { method: 'POST' }); notify('Turno cancelado'); mine.reload(); setVersion((v) => v + 1) }
    catch (e) { notify(e.message, 'error') }
    setCancel(null)
  }

  return (
    <>
      <PageHeader title="Turnos" subtitle="Reserva tu hora y te esperamos en la barbería." />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' }, alignItems: 'start' }}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Reservar un turno</Typography>
            {services.length ? (
              <Stack spacing={3}>
                {upcoming.length >= maxActive && (
                  <Alert severity="info">Ya tienes {upcoming.length} turnos reservados, el máximo permitido. Cancela uno para reservar otro.</Alert>
                )}
                <SlotPicker services={services} dates={dates} value={pick} onChange={setPick} reloadKey={version} />
                <Button
                  variant="contained" size="large" onClick={reserve}
                  disabled={busy || !pick.serviceId || !pick.date || !pick.time || upcoming.length >= maxActive}
                >
                  {pick.time ? `Reservar ${fmtDay(pick.date)} a las ${pick.time}` : 'Reservar turno'}
                </Button>
              </Stack>
            ) : <EmptyState icon={<EventAvailableRounded />} text="La barbería aún no publicó sus servicios para reservar. Vuelve pronto." />}
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Mis turnos</Typography>
            {upcoming.length ? (
              <Stack spacing={1.5} divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {upcoming.map((a) => (
                  <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 150 }}>
                      <Typography fontWeight={700}>{fmtDay(a.start_at.slice(0, 10))}, {fmtRange(a)}</Typography>
                      <Typography variant="body2" color="text.secondary">{a.service_name}</Typography>
                    </Box>
                    <Button size="small" color="error" onClick={() => setCancel(a)}>Cancelar</Button>
                  </Box>
                ))}
              </Stack>
            ) : <Typography variant="body2" color="text.secondary">No tienes turnos próximos.</Typography>}

            {past.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Anteriores</Typography>
                <Stack spacing={1}>
                  {past.slice(0, 5).map((a) => (
                    <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{fmtDay(a.start_at.slice(0, 10))} · {a.service_name}</Typography>
                      <StatusChip status={a.status} />
                    </Box>
                  ))}
                </Stack>
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      <Dialog open={!!cancel} onClose={() => setCancel(null)}>
        <DialogTitle>¿Cancelar el turno?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {cancel && `${fmtDay(cancel.start_at.slice(0, 10))} a las ${cancel.start_at.slice(11)} · ${cancel.service_name}. El horario quedará libre para otros clientes.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCancel(null)}>Mantener</Button>
          <Button color="error" variant="contained" onClick={doCancel}>Cancelar turno</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
