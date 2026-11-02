import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Avatar, Box, Button, Card, Chip, LinearProgress, Link, Stack, Tab, Tabs, Typography } from '@mui/material'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import CakeRounded from '@mui/icons-material/CakeRounded'
import CardGiftcardRounded from '@mui/icons-material/CardGiftcardRounded'
import SentimentSatisfiedAltRounded from '@mui/icons-material/SentimentSatisfiedAltRounded'
import useApi from '../../hooks/useApi'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { fmtBirthday, initials } from '../../utils'

function WhatsAppButton({ url, label = 'WhatsApp' }) {
  if (!url) return <Chip size="small" label="Sin teléfono" variant="outlined" />
  return (
    <Button component="a" href={url} target="_blank" rel="noopener noreferrer" size="small" variant="outlined" color="success" startIcon={<WhatsAppIcon />}>
      {label}
    </Button>
  )
}

function Row({ client, detail, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, flexWrap: 'wrap' }}>
      <Avatar sx={{ width: 36, height: 36, fontSize: 13, bgcolor: 'rgba(148,163,184,0.2)', color: 'text.primary' }}>{initials(client.name)}</Avatar>
      <Box sx={{ flex: 1, minWidth: 180 }}>
        <Link component={RouterLink} to={`/admin/clientes/${client.id}`} underline="hover" color="text.primary" fontWeight={600}>{client.name}</Link>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{detail}</Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center">{children}</Stack>
    </Box>
  )
}

const when = (days) => (days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`)

function Inactive({ data }) {
  const list = data.clients
  if (!list.length) return <EmptyState icon={<SentimentSatisfiedAltRounded />} text={`Nadie lleva más de ${data.days_limit} días sin venir. ¡Buen trabajo!`} />
  return (
    <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
      {list.map((c) => (
        <Row
          key={c.id} client={c}
          detail={`${c.last_visit ? `Última visita hace ${c.days} días` : `Nunca vino · se registró hace ${c.days} días`} · ${c.points} pts`}
        >
          <WhatsAppButton url={c.whatsapp_url} label="Invitar a volver" />
        </Row>
      ))}
    </Stack>
  )
}

function Birthdays({ data, reload }) {
  const notify = useToast()
  const gift = async (c) => {
    try { const r = await api(`/admin/clients/${c.id}/birthday-gift`, { method: 'POST' }); notify(`Se regalaron ${r.points} pts a ${c.name}`); reload() }
    catch (e) { notify(e.message, 'error') }
  }
  if (!data.clients.length) return <EmptyState icon={<CakeRounded />} text="No hay cumpleaños en los próximos 30 días. Los clientes cargan su fecha al registrarse o desde su cuenta." />
  return (
    <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
      {data.clients.map((c) => (
        <Row key={c.id} client={c} detail={`${when(c.days)} · ${fmtBirthday(c.birthday)}`}>
          <WhatsAppButton url={c.whatsapp_url} label="Saludar" />
          {c.granted
            ? <Chip size="small" color="success" variant="outlined" label="Regalo entregado" />
            : data.bonus > 0 && <Button size="small" variant="contained" startIcon={<CardGiftcardRounded />} onClick={() => gift(c)}>Regalar {data.bonus} pts</Button>}
        </Row>
      ))}
    </Stack>
  )
}

export default function Reactivar() {
  const [tab, setTab] = useState(0)
  const inactive = useApi('/admin/inactive')
  const birthdays = useApi('/admin/birthdays')
  const error = inactive.error || birthdays.error

  return (
    <>
      <PageHeader title="Reactivar clientes" subtitle="Escríbeles por WhatsApp para que vuelvan y saluda a quienes cumplen años." />
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`Inactivos${inactive.data ? ` (${inactive.data.clients.length})` : ''}`} />
          <Tab label={`Cumpleaños${birthdays.data ? ` (${birthdays.data.clients.length})` : ''}`} />
        </Tabs>
        {(tab === 0 ? inactive : birthdays).loading && <LinearProgress />}
        <Box sx={{ p: 1 }}>
          {tab === 0 && inactive.data && <Inactive data={inactive.data} />}
          {tab === 1 && birthdays.data && <Birthdays data={birthdays.data} reload={birthdays.reload} />}
        </Box>
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        El mensaje se abre ya escrito en WhatsApp y lo envías tú. Puedes cambiar los textos y los días en Configuración.
      </Typography>
    </>
  )
}
