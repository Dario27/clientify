import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert, Box, Button, Card, CardContent, LinearProgress, Skeleton, Stack, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material'
import PaidRounded from '@mui/icons-material/PaidRounded'
import ContentCutRounded from '@mui/icons-material/ContentCutRounded'
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded'
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded'
import useApi from '../../hooks/useApi'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import EmptyState from '../../components/EmptyState'
import { fmtDate, fmtMoney } from '../../utils'
import { brand } from '../../theme'

const PERIODS = [[7, '7 días'], [30, '30 días'], [90, '3 meses'], [365, '1 año']]
const GROUP = { 7: 1, 30: 1, 90: 7, 365: 30 } // cuántos días se agrupan en cada barra
const GROUP_NAME = { 1: 'día', 7: 'semana', 30: 'mes' }

const delta = (now, before) => (before > 0 ? `${now >= before ? '+' : '−'}${Math.abs(Math.round(((now - before) / before) * 100))} % vs. período anterior` : 'Sin datos del período anterior')
const pct = (x) => (x == null ? 'Aún sin datos' : `${String(x).replace('.', ',')} %`)

function IncomeChart({ daily, days }) {
  const size = GROUP[days]
  const bars = []
  for (let i = 0; i < daily.length; i += size) {
    const chunk = daily.slice(i, i + size)
    bars.push({
      from: chunk[0].date, to: chunk[chunk.length - 1].date,
      income: chunk.reduce((a, d) => a + d.income, 0), visits: chunk.reduce((a, d) => a + d.visits, 0),
    })
  }
  const max = Math.max(1, ...bars.map((b) => b.income))
  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6">Ingresos por {GROUP_NAME[size]}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Suma de lo cobrado en las visitas registradas.</Typography>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: 0.5, sm: days > 30 ? 1 : 0.75 }, height: 180, borderBottom: 1, borderColor: 'divider' }}>
          {bars.map((b) => (
            <Tooltip key={b.from} arrow title={`${b.from === b.to ? fmtDate(b.from, false) : `${fmtDate(b.from, false)} – ${fmtDate(b.to, false)}`} · ${fmtMoney(b.income)} · ${b.visits} visita${b.visits !== 1 ? 's' : ''}`}>
              <Box sx={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}>
                <Box sx={{ width: '100%', height: `${(b.income / max) * 100}%`, minHeight: b.income ? 3 : 0, bgcolor: brand.gold, borderRadius: '3px 3px 0 0' }} />
              </Box>
            </Tooltip>
          ))}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="caption" color="text.secondary">{fmtDate(daily[0].date, false)}</Typography>
          <Typography variant="caption" color="text.secondary">Hoy</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

function Services({ services }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>Servicios más vendidos</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Por ingresos en el período.</Typography>
        {services.length ? (
          <Stack spacing={2}>
            {services.map((s) => (
              <Box key={s.concept}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{s.concept}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{fmtMoney(s.income)} · {s.visits} visita{s.visits !== 1 ? 's' : ''}</Typography>
                </Box>
                <LinearProgress variant="determinate" value={s.share} sx={{ height: 6, borderRadius: 3, mt: 0.75 }} />
              </Box>
            ))}
          </Stack>
        ) : <EmptyState icon={<ContentCutRounded />} text="Sin visitas con monto en este período." />}
      </CardContent>
    </Card>
  )
}

function Retention({ r }) {
  const buckets = [['Hasta 30 días', r.last_visit.d30], ['31 a 60 días', r.last_visit.d60], ['61 a 90 días', r.last_visit.d90], ['Más de 90 días', r.last_visit.older], ['Nunca vinieron', r.never]]
  const max = Math.max(1, ...buckets.map((b) => b[1]))
  const back = r.with_visits ? Math.round((100 * r.returning) / r.with_visits) : null
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>Clientes que vuelven</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Con todas las visitas registradas, sin importar el período.</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
          {[
            ['Volvieron en 30 días', pct(r.r30.rate), r.r30.eligible ? `de ${r.r30.eligible} que llegaron hace más de un mes` : ''],
            ['Volvieron en 60 días', pct(r.r60.rate), r.r60.eligible ? `de ${r.r60.eligible} que llegaron hace más de dos meses` : ''],
            ['Con 2 visitas o más', back == null ? 'Aún sin datos' : `${back} %`, `${r.returning} de ${r.with_visits} clientes`],
            ['Vienen cada', r.avg_gap_days == null ? 'Aún sin datos' : `${String(r.avg_gap_days).replace('.', ',')} días`, 'en promedio'],
          ].map(([label, value, hint]) => (
            <Box key={label}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 800, color: 'primary.main', lineHeight: 1.2 }}>{value}</Typography>
              <Typography variant="caption" color="text.secondary">{hint}</Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Última visita de los {r.clients} clientes</Typography>
        <Stack spacing={1.25}>
          {buckets.map(([label, n]) => (
            <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '120px 1fr 28px', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body2" color="text.secondary">{label}</Typography>
              <LinearProgress variant="determinate" value={(n / max) * 100} sx={{ height: 6, borderRadius: 3 }} />
              <Typography variant="body2" fontWeight={700} align="right">{n}</Typography>
            </Box>
          ))}
        </Stack>
        <Button component={RouterLink} to="/admin/reactivar" size="small" sx={{ mt: 2 }}>Ver clientes inactivos</Button>
      </CardContent>
    </Card>
  )
}

export default function Reportes() {
  const [days, setDays] = useState(30)
  const { data, loading, error } = useApi(`/admin/reports?days=${days}`)
  const s = data?.summary

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="Cómo va el negocio: ingresos, servicios y clientes que vuelven."
        action={
          <ToggleButtonGroup exclusive size="small" color="primary" value={days} onChange={(_, v) => v && setDays(v)}>
            {PERIODS.map(([d, label]) => <ToggleButton key={d} value={d} sx={{ px: 1.75 }}>{label}</ToggleButton>)}
          </ToggleButtonGroup>
        }
      />
      {error && <Alert severity="error">{error}</Alert>}
      {!data && loading && <Stack spacing={2}><Skeleton variant="rounded" height={110} /><Skeleton variant="rounded" height={260} /></Stack>}
      {data && (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
            <StatCard accent label="Ingresos" value={fmtMoney(s.income)} icon={<PaidRounded />} hint={delta(s.income, s.previous.income)} />
            <StatCard label="Visitas" value={s.visits} icon={<ContentCutRounded />} hint={delta(s.visits, s.previous.visits)} />
            <StatCard label="Ticket promedio" value={fmtMoney(s.ticket)} icon={<ReceiptLongRounded />} hint="Por visita" />
            <StatCard label="Clientes atendidos" value={s.clients} icon={<PeopleAltRounded />} hint={`${s.new_clients} nuevo${s.new_clients !== 1 ? 's' : ''} en el período`} />
          </Box>
          <IncomeChart daily={data.daily} days={days} />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <Services services={data.services} />
            <Retention r={data.retention} />
          </Box>
        </Stack>
      )}
    </>
  )
}
