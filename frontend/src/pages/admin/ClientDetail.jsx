import { useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import {
  Alert, Avatar, Box, Button, Card, CardContent, Dialog, DialogContent, DialogTitle, InputAdornment, Link, Skeleton, Stack, Tab, Tabs,
  TextField, Typography,
} from '@mui/material'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import AddCircleRounded from '@mui/icons-material/AddCircleRounded'
import TuneRounded from '@mui/icons-material/TuneRounded'
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded'
import KeyRounded from '@mui/icons-material/KeyRounded'
import useApi from '../../hooks/useApi'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import HistoryTable from '../../components/HistoryTable'
import StatusChip from '../../components/StatusChip'
import EmptyState from '../../components/EmptyState'
import ClientQr from '../../components/ClientQr'
import ResetPasswordDialog from '../../components/ResetPasswordDialog'
import { fmtBirthday, fmtDate, initials, realEmail } from '../../utils'
import { brand } from '../../theme'

export default function ClientDetail() {
  const { id } = useParams()
  const { data, loading, error, reload } = useApi(`/admin/clients/${id}`)
  const notify = useToast()
  const [visit, setVisit] = useState({ amount: '', concept: '' })
  const [adj, setAdj] = useState({ points: '', reason: '' })
  const [tab, setTab] = useState(0)
  const [qr, setQr] = useState(false)
  const [reset, setReset] = useState(false)

  if (loading) return <Stack spacing={2}><Skeleton variant="rounded" height={140} /><Skeleton variant="rounded" height={240} /></Stack>
  if (error) return <Alert severity="error">{error}</Alert>
  const { client, referrer, history, redemptions, referrals, points_per_dollar: ppd } = data
  const preview = Math.floor((parseFloat(String(visit.amount).replace(',', '.')) || 0) * ppd)

  const post = async (path, payload, ok) => {
    try { const r = await api(path, { method: 'POST', body: payload }); notify(ok(r)); reload(); return true }
    catch (e) { notify(e.message, 'error'); return false }
  }
  const submitVisit = async (e) => {
    e.preventDefault()
    if (await post(`/admin/clients/${id}/visit`, visit, (r) => `Se sumaron ${r.points} pts a ${client.name}`)) setVisit({ amount: '', concept: '' })
  }
  const submitAdj = async (e) => {
    e.preventDefault()
    if (await post(`/admin/clients/${id}/adjust`, { ...adj, points: parseInt(adj.points, 10) }, () => 'Ajuste aplicado')) setAdj({ points: '', reason: '' })
  }
  const act = (r, action) => post(`/admin/redemptions/${r.id}/${action}`, null,
    () => (action === 'entregar' ? `Canje ${r.code} entregado` : `Canje ${r.code} cancelado; puntos devueltos`))

  return (
    <>
      <Button component={RouterLink} to="/admin/clientes" startIcon={<ArrowBackRounded />} color="inherit" size="small" sx={{ mb: 2, color: 'text.secondary' }}>
        Clientes
      </Button>

      <Card sx={{ mb: 2, background: `linear-gradient(135deg, ${brand.slate}, ${brand.night})` }}>
        <CardContent sx={{ p: 3, display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
          <Avatar sx={{ width: 56, height: 56, fontSize: 20, fontWeight: 700, bgcolor: 'primary.main', color: 'primary.contrastText' }}>{initials(client.name)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant="h5">{client.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {[realEmail(client.email), client.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'} · Cliente desde {fmtDate(client.created_at, false)}
            </Typography>
            {client.birthday && (
              <Typography variant="body2" color="text.secondary">Cumpleaños: {fmtBirthday(client.birthday)}</Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              Código <Box component="span" sx={{ fontFamily: 'monospace', color: 'primary.main', fontWeight: 700 }}>{client.referral_code}</Box>
              {referrer && <> · Referido por <Link component={RouterLink} to={`/admin/clientes/${referrer.id}`}>{referrer.name}</Link></>}
            </Typography>
          </Box>
          <Stack spacing={1}>
            <Button variant="outlined" size="small" startIcon={<QrCode2Rounded />} onClick={() => setQr(true)}>Ver QR</Button>
            <Button variant="outlined" size="small" color="inherit" startIcon={<KeyRounded />} onClick={() => setReset(true)}>Restablecer clave</Button>
          </Stack>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="overline">Saldo</Typography>
            <Typography sx={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: 'primary.main' }}>{client.points}<Typography component="span" color="text.secondary" sx={{ ml: 0.5 }}>pts</Typography></Typography>
          </Box>
        </CardContent>
      </Card>

      <ResetPasswordDialog open={reset} client={client} onClose={() => setReset(false)} />

      <Dialog open={qr} onClose={() => setQr(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{client.name}</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pb: 4 }}>
          <ClientQr code={client.referral_code} size={240} />
          <Typography sx={{ mt: 2, fontFamily: 'monospace', fontWeight: 700, color: 'primary.main', letterSpacing: 1 }}>{client.referral_code}</Typography>
          <Typography variant="body2" color="text.secondary">Se escanea desde Escanear para abrir esta ficha.</Typography>
        </DialogContent>
      </Dialog>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 2 }}>
        <Card>
          <CardContent component="form" onSubmit={submitVisit} sx={{ p: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}><AddCircleRounded color="primary" /><Typography variant="h6">Registrar visita</Typography></Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Se otorga {ppd} pt por cada $1 consumido.</Typography>
            <Stack spacing={2}>
              <TextField label="Concepto" placeholder="Corte + barba" value={visit.concept} onChange={(e) => setVisit({ ...visit, concept: e.target.value })} />
              <TextField label="Monto consumido" type="number" required value={visit.amount}
                onChange={(e) => setVisit({ ...visit, amount: e.target.value })}
                slotProps={{ htmlInput: { min: 0, step: '0.01' }, input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
              <Button type="submit" variant="contained" disabled={preview <= 0}>Sumar {preview} pts</Button>
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardContent component="form" onSubmit={submitAdj} sx={{ p: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}><TuneRounded sx={{ color: 'text.secondary' }} /><Typography variant="h6">Ajuste manual</Typography></Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Usa un número negativo para descontar (ej. −10).</Typography>
            <Stack spacing={2}>
              <TextField label="Puntos" type="number" required value={adj.points} onChange={(e) => setAdj({ ...adj, points: e.target.value })} />
              <TextField label="Motivo" placeholder="Promoción de cumpleaños" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
              <Button type="submit" variant="outlined" disabled={!parseInt(adj.points, 10)}>Aplicar ajuste</Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`Historial (${history.length})`} />
          <Tab label={`Canjes (${redemptions.length})`} />
          <Tab label={`Referidos (${referrals.length})`} />
        </Tabs>
        <Box sx={{ p: 1 }}>
          {tab === 0 && <HistoryTable rows={history} />}
          {tab === 1 && (redemptions.length ? (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
              {redemptions.map((r) => (
                <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main', minWidth: 90 }}>{r.code}</Typography>
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    <Typography variant="body2" fontWeight={600}>{r.reward_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{fmtDate(r.created_at)} · {r.points} pts</Typography>
                  </Box>
                  <StatusChip status={r.status} />
                  {r.status === 'pendiente' && (
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" color="success" onClick={() => act(r, 'entregar')}>Entregar</Button>
                      <Button size="small" color="error" onClick={() => act(r, 'cancelar')}>Cancelar</Button>
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          ) : <EmptyState text="Sin canjes." />)}
          {tab === 2 && (referrals.length ? (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
              {referrals.map((r) => (
                <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5 }}>
                  <Avatar sx={{ width: 30, height: 30, fontSize: 12 }}>{initials(r.name)}</Avatar>
                  <Link component={RouterLink} to={`/admin/clientes/${r.id}`} sx={{ flex: 1 }} fontWeight={600}>{r.name}</Link>
                  <Typography variant="caption" color="text.secondary">{fmtDate(r.created_at, false)}</Typography>
                </Box>
              ))}
            </Stack>
          ) : <EmptyState text="Aún no ha referido a nadie." />)}
        </Box>
      </Card>
    </>
  )
}
