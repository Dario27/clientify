import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Alert, Avatar, Box, Button, Card, CardContent, Skeleton, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material'
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded'
import StarsRounded from '@mui/icons-material/StarsRounded'
import RedeemRounded from '@mui/icons-material/RedeemRounded'
import GroupAddRounded from '@mui/icons-material/GroupAddRounded'
import PendingActionsRounded from '@mui/icons-material/PendingActionsRounded'
import useApi from '../../hooks/useApi'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import EmptyState from '../../components/EmptyState'
import { fmtDate, fmtPts, initials } from '../../utils'
import { brand } from '../../theme'

const EARN = brand.gold
const REDEEM = '#60A5FA'

function ActivityChart({ daily }) {
  const max = Math.max(1, ...daily.flatMap((d) => [d.earned, d.redeemed]))
  const total = daily.reduce((a, d) => ({ e: a.e + d.earned, r: a.r + d.redeemed }), { e: 0, r: 0 })
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h6">Puntos últimos 14 días</Typography>
            <Typography variant="body2" color="text.secondary">Otorgados vs. canjeados por día</Typography>
          </Box>
          <Stack direction="row" spacing={3}>
            {[[EARN, 'Otorgados', total.e], [REDEEM, 'Canjeados', total.r]].map(([c, l, v]) => (
              <Box key={l}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: c }} />
                  <Typography variant="caption" color="text.secondary">{l}</Typography>
                </Stack>
                <Typography fontWeight={700}>{v} pts</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: 0.5, sm: 1 }, height: 180, borderBottom: 1, borderColor: 'divider' }}>
          {daily.map((d) => (
            <Tooltip key={d.date} title={`${fmtDate(d.date, false)} · +${d.earned} / −${d.redeemed}`} arrow>
              <Box sx={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', cursor: 'default' }}>
                <Box sx={{ width: '45%', maxWidth: 14, height: `${(d.earned / max) * 100}%`, minHeight: d.earned ? 3 : 0, bgcolor: EARN, borderRadius: '3px 3px 0 0' }} />
                <Box sx={{ width: '45%', maxWidth: 14, height: `${(d.redeemed / max) * 100}%`, minHeight: d.redeemed ? 3 : 0, bgcolor: REDEEM, borderRadius: '3px 3px 0 0' }} />
              </Box>
            </Tooltip>
          ))}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="caption" color="text.secondary">{fmtDate(daily[0]?.date, false)}</Typography>
          <Typography variant="caption" color="text.secondary">Hoy</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { data, loading, error, reload } = useApi('/admin/dashboard')
  const notify = useToast()
  const navigate = useNavigate()

  if (loading) return <Stack spacing={2}><Skeleton variant="rounded" height={110} /><Skeleton variant="rounded" height={300} /></Stack>
  if (error) return <Alert severity="error">{error}</Alert>
  const { stats, daily, pending, activity, top, top_rewards } = data

  const deliver = async (r) => {
    try {
      await api(`/admin/redemptions/${r.id}/entregar`, { method: 'POST' })
      notify(`Canje ${r.code} entregado`); reload()
    } catch (e) { notify(e.message, 'error') }
  }
  const maxReward = Math.max(1, ...top_rewards.map((r) => r.n))

  return (
    <>
      <PageHeader title="Resumen" subtitle="Así va el programa de fidelización de tu barbería." />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(5, 1fr)' }, mb: 2 }}>
        <StatCard label="Clientes" value={stats.clients} hint={`+${stats.new_clients_30d} en 30 días`} icon={<PeopleAltRounded />} />
        <StatCard label="Pts en circulación" value={stats.points_out} hint="Saldo total de clientes" icon={<StarsRounded />} accent />
        <StatCard label="Pts canjeados" value={stats.points_redeemed} hint={`${stats.delivered} entrega${stats.delivered !== 1 ? 's' : ''}`} icon={<RedeemRounded />} />
        <StatCard label="Por atender" value={stats.pending} hint="Canjes pendientes" icon={<PendingActionsRounded />} accent={stats.pending > 0} />
        <StatCard label="Por referido" value={stats.referred} hint={stats.clients ? `${Math.round((stats.referred / stats.clients) * 100)}% del total` : '—'} icon={<GroupAddRounded />} />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, mb: 2 }}>
        <ActivityChart daily={daily} />
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Beneficios más canjeados</Typography>
            <Stack spacing={2}>
              {top_rewards.map((r) => (
                <Box key={r.name}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" noWrap sx={{ pr: 1 }}>{r.name}</Typography>
                    <Typography variant="body2" fontWeight={700}>{r.n}</Typography>
                  </Box>
                  <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(148,163,184,0.12)' }}>
                    <Box sx={{ height: '100%', width: `${(r.n / maxReward) * 100}%`, bgcolor: 'primary.main', borderRadius: 3 }} />
                  </Box>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, mb: 2 }}>
        <Card>
          <CardContent sx={{ p: 3, pb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">Canjes por atender</Typography>
              <Button size="small" component={RouterLink} to="/admin/canjes">Ver todos</Button>
            </Box>
            {pending.length ? (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {pending.map((r) => (
                  <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5 }}>
                    <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'primary.main', minWidth: 84 }}>{r.code}</Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{r.client_name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{r.reward_name}</Typography>
                    </Box>
                    <Button size="small" variant="contained" color="success" onClick={() => deliver(r)}>Entregar</Button>
                  </Box>
                ))}
              </Stack>
            ) : <EmptyState text="No hay canjes pendientes." />}
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 3, pb: 1 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Top clientes</Typography>
            {top.length ? (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {top.map((c, i) => (
                  <Box key={c.id} onClick={() => navigate(`/admin/clientes/${c.id}`)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.25, cursor: 'pointer', '&:hover .name': { color: 'primary.main' } }}>
                    <Typography variant="body2" color="text.secondary" sx={{ width: 16 }}>{i + 1}</Typography>
                    <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: i === 0 ? 'primary.main' : 'rgba(148,163,184,0.2)', color: i === 0 ? 'primary.contrastText' : 'text.primary' }}>{initials(c.name)}</Avatar>
                    <Typography className="name" variant="body2" fontWeight={600} sx={{ flex: 1 }}>{c.name}</Typography>
                    <Typography variant="body2" fontWeight={700} color="primary.main">{c.points} pts</Typography>
                  </Box>
                ))}
              </Stack>
            ) : <EmptyState text="Aún no hay clientes." />}
          </CardContent>
        </Card>
      </Box>

      <Card>
        <CardContent sx={{ p: 3, pb: 1 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Actividad reciente</Typography>
          {activity.length ? (
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Cliente</TableCell><TableCell>Detalle</TableCell><TableCell align="right">Puntos</TableCell></TableRow></TableHead>
                <TableBody>
                  {activity.map((t) => (
                    <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/clientes/${t.user_id}`)}>
                      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{fmtDate(t.created_at)}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t.client_name}</TableCell>
                      <TableCell>{t.description}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: t.points > 0 ? 'success.main' : 'error.main' }}>{fmtPts(t.points)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : <EmptyState text="Sin actividad todavía." />}
        </CardContent>
      </Card>
    </>
  )
}
