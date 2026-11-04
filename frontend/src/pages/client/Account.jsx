import { useState } from 'react'
import {
  Alert, Avatar, AvatarGroup, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, InputAdornment, LinearProgress, Skeleton, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import ContentCutRounded from '@mui/icons-material/ContentCutRounded'
import ShoppingBagRounded from '@mui/icons-material/ShoppingBagRounded'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import ShareRounded from '@mui/icons-material/ShareRounded'
import WorkspacePremiumRounded from '@mui/icons-material/WorkspacePremiumRounded'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import LockRounded from '@mui/icons-material/LockRounded'
import { api } from '../../api'
import useApi from '../../hooks/useApi'
import { useToast } from '../../context/ToastContext'
import HistoryTable from '../../components/HistoryTable'
import StatusChip from '../../components/StatusChip'
import EmptyState from '../../components/EmptyState'
import ClientQr from '../../components/ClientQr'
import CakeRounded from '@mui/icons-material/CakeRounded'
import EventRounded from '@mui/icons-material/EventRounded'
import HourglassBottomRounded from '@mui/icons-material/HourglassBottomRounded'
import { Link as RouterLink } from 'react-router-dom'
import { fmtDay, fmtDate, initials } from '../../utils'
import { brand } from '../../theme'

function PointsHero({ user, rewards }) {
  const next = rewards.find((r) => r.points_cost > user.points)
  const prevCost = [...rewards].reverse().find((r) => r.points_cost <= user.points)?.points_cost ?? 0
  const pct = next ? Math.min(100, Math.round(((user.points - prevCost) / (next.points_cost - prevCost)) * 100)) : 100
  const available = rewards.filter((r) => r.points_cost <= user.points).length
  return (
    <Card sx={{
      mb: 3, borderColor: 'rgba(229,169,59,0.35)',
      background: `radial-gradient(circle at 90% 0%, rgba(229,169,59,0.22), transparent 50%), linear-gradient(135deg, ${brand.slate}, ${brand.night})`,
    }}>
      <CardContent sx={{ p: { xs: 3, md: 4 }, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'auto 1fr' }, alignItems: 'center' }}>
        <Box>
          <Typography variant="overline">Tu saldo</Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography sx={{ fontSize: { xs: 56, md: 72 }, fontWeight: 800, lineHeight: 1, color: 'primary.main', letterSpacing: '-0.03em' }}>
              {user.points}
            </Typography>
            <Typography variant="h6" color="text.secondary">pts</Typography>
          </Box>
        </Box>
        <Box sx={{ pl: { md: 4 }, borderLeft: { md: 1 }, borderColor: { md: 'divider' } }}>
          <Typography variant="h5" sx={{ mb: 1 }}>Hola, {user.name.split(' ')[0]}</Typography>
          {next ? (
            <>
              <LinearProgress variant="determinate" value={pct} sx={{ height: 10, borderRadius: 5, bgcolor: 'rgba(148,163,184,0.15)', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Te faltan <Box component="strong" sx={{ color: 'text.primary' }}>{next.points_cost - user.points} pts</Box> para «{next.name}».
                {available > 0 && ` Ya puedes canjear ${available} beneficio${available > 1 ? 's' : ''}.`}
              </Typography>
            </>
          ) : (
            <Stack direction="row" spacing={1} alignItems="center">
              <WorkspacePremiumRounded color="primary" />
              <Typography color="text.secondary">¡Alcanzas todos los beneficios! Canjea el que prefieras.</Typography>
            </Stack>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

function RewardCard({ reward, points, onRedeem }) {
  const out = reward.stock !== null && reward.stock <= 0
  const missing = reward.points_cost - points
  const can = missing <= 0 && !out
  const Icon = reward.category === 'producto' ? ShoppingBagRounded : ContentCutRounded
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', borderColor: can ? 'rgba(229,169,59,0.4)' : undefined, opacity: can ? 1 : 0.75 }}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: can ? 'rgba(229,169,59,0.15)' : 'rgba(148,163,184,0.12)', color: can ? 'primary.main' : 'text.secondary' }}>
            <Icon fontSize="small" />
          </Box>
          {reward.stock !== null && (
            <Chip size="small" variant="outlined" label={out ? 'Agotado' : `${reward.stock} disponibles`} color={out ? 'error' : 'default'} />
          )}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>{reward.name}</Typography>
          <Typography variant="body2" color="text.secondary">{reward.description}</Typography>
        </Box>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: 'primary.main' }}>
          {reward.points_cost} <Box component="span" sx={{ fontSize: 14, color: 'text.secondary', fontWeight: 600 }}>pts</Box>
        </Typography>
        <Button
          variant={can ? 'contained' : 'outlined'} color={can ? 'primary' : 'inherit'} fullWidth disabled={!can}
          startIcon={can ? undefined : <LockRounded fontSize="small" />} onClick={() => onRedeem(reward)}
        >
          {out ? 'Agotado' : can ? 'Canjear' : `Faltan ${missing} pts`}
        </Button>
      </CardContent>
    </Card>
  )
}

function BirthdayPrompt({ bonus, onSaved }) {
  const notify = useToast()
  const [value, setValue] = useState('')
  const save = async (e) => {
    e.preventDefault()
    try { await api('/profile', { method: 'PUT', body: { birthday: value } }); notify('Cumpleaños guardado'); onSaved() }
    catch (err) { notify(err.message, 'error') }
  }
  return (
    <Alert icon={<CakeRounded />} severity="info" variant="outlined" sx={{ mb: 3, alignItems: 'center' }}>
      <Box component="form" onSubmit={save} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="body2" sx={{ flex: '1 1 220px' }}>
          Agrega tu cumpleaños{bonus > 0 && <> y recibe <Box component="strong">{bonus} pts</Box> de regalo cada año</>}.
        </Typography>
        <TextField
          size="small" type="date" value={value} onChange={(e) => setValue(e.target.value)} required
          slotProps={{ htmlInput: { max: new Date().toISOString().slice(0, 10) } }}
        />
        <Button type="submit" variant="contained" size="small" disabled={!value}>Guardar</Button>
      </Box>
    </Alert>
  )
}

function QrCard({ code }) {
  return (
    <Card>
      <CardContent sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>Tu QR</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Muéstralo en la barbería y te encuentran al instante para sumar tus puntos.
        </Typography>
        <ClientQr code={code} size={180} />
      </CardContent>
    </Card>
  )
}

function ReferralCard({ code, referrals, settings }) {
  const notify = useToast()
  const link = `${window.location.origin}/registro?ref=${code}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); notify('Enlace copiado') } catch { notify('No se pudo copiar', 'error') }
  }
  const share = () => navigator.share?.({ title: 'Únete y gana puntos', text: 'Regístrate con mi enlace y ambos ganamos puntos:', url: link }).catch(() => {})
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>Invita y gana</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Cuando un amigo que se registre con tu enlace haga su primera visita
          {settings.referral_min_spend > 0 && ` (de al menos $${settings.referral_min_spend})`}, tú ganas{' '}
          <Box component="strong" sx={{ color: 'primary.main' }}>{settings.referral_bonus_referrer} pts</Box> y tu amigo{' '}
          <Box component="strong" sx={{ color: 'primary.main' }}>{settings.referral_bonus_referred} pts</Box> extra.
        </Typography>
        <TextField
          value={link} slotProps={{
            htmlInput: { readOnly: true, style: { fontFamily: 'ui-monospace, monospace', fontSize: 13 } },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Copiar"><IconButton onClick={copy} edge="end"><ContentCopyRounded fontSize="small" /></IconButton></Tooltip>
                  {typeof navigator !== 'undefined' && navigator.share && (
                    <Tooltip title="Compartir"><IconButton onClick={share}><ShareRounded fontSize="small" /></IconButton></Tooltip>
                  )}
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Tu código</Typography>
            <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'primary.main', letterSpacing: 1 }}>{code}</Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary">{referrals.length} referido{referrals.length !== 1 && 's'}
              {referrals.some((r) => !r.rewarded) && ` · ${referrals.filter((r) => !r.rewarded).length} por confirmar`}
            </Typography>
            {referrals.length > 0 && (
              <AvatarGroup max={5} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 12, borderColor: brand.slate } }}>
                {referrals.map((r, i) => (
                  <Tooltip key={i} title={`${r.name} · ${r.rewarded ? 'ya ganaste el bono' : 'falta su primera visita'}`}>
                    <Avatar sx={{ opacity: r.rewarded ? 1 : 0.45 }}>{initials(r.name)}</Avatar>
                  </Tooltip>
                ))}
              </AvatarGroup>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export default function Account() {
  const { data, loading, error, reload } = useApi('/account')
  const notify = useToast()
  const [confirm, setConfirm] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState(0)

  if (loading) return <Stack spacing={2}><Skeleton variant="rounded" height={180} /><Skeleton variant="rounded" height={260} /></Stack>
  if (error) return <Alert severity="error">{error}</Alert>

  const { user, rewards, history, redemptions, referrals, settings, birthday_gift: gift, next_appointment: next, expiring } = data
  const pending = redemptions.filter((r) => r.status === 'pendiente')

  const doRedeem = async () => {
    setBusy(true)
    try {
      const r = await api(`/redeem/${confirm.id}`, { method: 'POST' })
      setResult(r); setConfirm(null); reload()
    } catch (e) {
      notify(e.message, 'error'); setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PointsHero user={user} rewards={rewards} />

      {gift > 0 && (
        <Alert icon={<CakeRounded />} severity="success" sx={{ mb: 3 }}>
          ¡Este mes es tu cumpleaños, {user.name.split(' ')[0]}! Te regalamos <strong>{gift} pts</strong>.
        </Alert>
      )}
      {expiring && (
        <Alert icon={<HourglassBottomRounded />} severity="warning" sx={{ mb: 3 }}>
          Tienes <strong>{expiring.points} pts</strong> que vencen el <strong>{fmtDate(expiring.date, false)}</strong>. Canjéalos antes de esa fecha.
        </Alert>
      )}
      <Alert
        icon={<EventRounded />} severity="info" variant="outlined" sx={{ mb: 3, alignItems: 'center' }}
        action={<Button component={RouterLink} to="/turnos" size="small" color="inherit">{next ? 'Ver turnos' : 'Reservar'}</Button>}
      >
        {next
          ? <>Tu próximo turno: <strong>{fmtDay(next.start_at.slice(0, 10))} a las {next.start_at.slice(11)}</strong> · {next.service_name}</>
          : 'Reserva tu próximo turno online, sin esperas.'}
      </Alert>
      {!user.birthday && <BirthdayPrompt bonus={settings.birthday_bonus} onSaved={reload} />}

      {pending.length > 0 && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 3 }}>
          Tienes {pending.length} canje{pending.length > 1 && 's'} por reclamar. Muestra el código en la barbería:{' '}
          {pending.map((p) => <Chip key={p.id} size="small" label={p.code} color="warning" sx={{ ml: 0.5, fontFamily: 'monospace' }} />)}
        </Alert>
      )}

      <Typography variant="h6" sx={{ mb: settings.points_expiry_months > 0 ? 0.5 : 2 }}>Canjea tus puntos</Typography>
      {settings.points_expiry_months > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Los puntos vencen a los {settings.points_expiry_months} meses de ganarlos.</Typography>
      )}
      {rewards.length ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, mb: 4 }}>
          {rewards.map((r) => <RewardCard key={r.id} reward={r} points={user.points} onRedeem={setConfirm} />)}
        </Box>
      ) : <EmptyState text="La barbería aún no publicó beneficios." />}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '360px 1fr' }, alignItems: 'start' }}>
        <Stack spacing={2}>
          <QrCard code={user.referral_code} />
          <ReferralCard code={user.referral_code} referrals={referrals} settings={settings} />
        </Stack>
        <Card>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Movimientos" />
            <Tab label={`Mis canjes (${redemptions.length})`} />
          </Tabs>
          <Box sx={{ p: 1 }}>
            {tab === 0 ? <HistoryTable rows={history} /> : (
              redemptions.length ? (
                <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                  {redemptions.map((r) => (
                    <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5 }}>
                      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'primary.main', minWidth: 90 }}>{r.code}</Typography>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{r.reward_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{fmtDate(r.created_at)} · {r.points} pts</Typography>
                      </Box>
                      <StatusChip status={r.status} />
                    </Box>
                  ))}
                </Stack>
              ) : <EmptyState text="Aún no has canjeado beneficios." />
            )}
          </Box>
        </Card>
      </Box>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirmar canje</DialogTitle>
        <DialogContent>
          <Typography>¿Canjear <strong>{confirm?.points_cost} pts</strong> por «{confirm?.name}»?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Te quedarán {user.points - (confirm?.points_cost || 0)} pts. Recibirás un código para reclamarlo en la barbería.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setConfirm(null)}>Cancelar</Button>
          <Button variant="contained" onClick={doRedeem} disabled={busy}>Canjear</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!result} onClose={() => setResult(null)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: 'center', pt: 4 }}>
          <CheckCircleRounded color="success" sx={{ fontSize: 56 }} />
          <Typography variant="h6" sx={{ mt: 1 }}>¡Canje realizado!</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Muestra este código en la barbería para reclamar «{result?.reward}».</Typography>
          <Box sx={{ py: 2, borderRadius: 2, border: '2px dashed', borderColor: 'primary.main', bgcolor: brand.ink }}>
            <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 32, fontWeight: 800, color: 'primary.main', letterSpacing: 2 }}>{result?.code}</Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}><Button variant="contained" fullWidth onClick={() => setResult(null)}>Entendido</Button></DialogActions>
      </Dialog>
    </>
  )
}
