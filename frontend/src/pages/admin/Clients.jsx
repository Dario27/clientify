import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Avatar, Box, Button, Card, Chip, InputAdornment, LinearProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import SearchRounded from '@mui/icons-material/SearchRounded'
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded'
import PersonAddRounded from '@mui/icons-material/PersonAddRounded'
import useApi from '../../hooks/useApi'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import QuickRegisterDialog from '../../components/QuickRegisterDialog'
import { fmtDate, initials, realEmail } from '../../utils'

export default function Clients() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t) }, [q])
  const { data, loading, error } = useApi(`/admin/clients${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`)
  const navigate = useNavigate()
  const [quick, setQuick] = useState(false)

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={data ? `${data.length} cliente${data.length !== 1 ? 's' : ''}${debounced ? ' encontrados' : ' registrados'}` : ' '}
        action={
          <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' }, width: { xs: '100%', sm: 'auto' } }}>
          <Button variant="contained" startIcon={<PersonAddRounded />} onClick={() => setQuick(true)} sx={{ whiteSpace: 'nowrap' }}>Registro rápido</Button>
          <TextField
            placeholder="Buscar por nombre, correo o teléfono" value={q} onChange={(e) => setQ(e.target.value)}
            sx={{ width: { xs: '100%', sm: 320 } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }}
          />
          </Box>
        }
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        {loading && <LinearProgress />}
        {data && (data.length ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Cliente</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Teléfono</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Referido por</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Referidos</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Última visita</TableCell>
                  <TableCell align="right">Puntos</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((c) => (
                  <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/clientes/${c.id}`)}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 34, height: 34, fontSize: 13, bgcolor: 'rgba(148,163,184,0.2)', color: 'text.primary' }}>{initials(c.name)}</Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>{c.name}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{realEmail(c.email) || 'Sin correo'}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>{c.phone || '—'}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{c.referrer_name || <Typography variant="body2" color="text.secondary">—</Typography>}</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{c.n_referrals || '—'}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, color: 'text.secondary' }}>{c.last_visit ? fmtDate(c.last_visit, false) : 'Sin visitas'}</TableCell>
                    <TableCell align="right"><Chip size="small" label={`${c.points} pts`} color="primary" variant="outlined" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <EmptyState icon={<PeopleAltRounded />} text={debounced ? `Sin resultados para «${debounced}».` : 'Aún no hay clientes. Comparte el enlace de registro.'} />
        ))}
      </Card>
      <QuickRegisterDialog open={quick} onClose={() => setQuick(false)} />
    </>
  )
}
