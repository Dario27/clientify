import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Link,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material'
import SearchRounded from '@mui/icons-material/SearchRounded'
import RedeemRounded from '@mui/icons-material/RedeemRounded'
import useApi from '../../hooks/useApi'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import EmptyState from '../../components/EmptyState'
import { fmtDate } from '../../utils'

export default function Redemptions() {
  const [status, setStatus] = useState('pendiente')
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [cancel, setCancel] = useState(null)
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t) }, [q])
  const { data, error, reload } = useApi(`/admin/redemptions?status=${status}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`)
  const notify = useToast()

  const act = async (r, action) => {
    try {
      await api(`/admin/redemptions/${r.id}/${action}`, { method: 'POST' })
      notify(action === 'entregar' ? `Canje ${r.code} entregado` : `Canje ${r.code} cancelado; se devolvieron ${r.points} pts`)
      setCancel(null); reload()
    } catch (e) { notify(e.message, 'error') }
  }

  return (
    <>
      <PageHeader
        title="Canjes"
        subtitle="Valida el código que muestra el cliente y entrega su beneficio."
        action={
          <TextField placeholder="Código, ej. C-4F9A1C" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 260 } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
        }
      />
      <ToggleButtonGroup value={status} exclusive size="small" onChange={(_, v) => v && setStatus(v)} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <ToggleButton value="pendiente">Pendientes</ToggleButton>
        <ToggleButton value="entregado">Entregados</ToggleButton>
        <ToggleButton value="cancelado">Cancelados</ToggleButton>
        <ToggleButton value="todos">Todos</ToggleButton>
      </ToggleButtonGroup>
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        {data && (data.length ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Código</TableCell><TableCell>Cliente</TableCell><TableCell>Beneficio</TableCell>
                  <TableCell align="right">Puntos</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Solicitado</TableCell>
                  <TableCell>Estado</TableCell><TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{r.code}</TableCell>
                    <TableCell><Link component={RouterLink} to={`/admin/clientes/${r.user_id}`} color="inherit" fontWeight={600}>{r.client_name}</Link></TableCell>
                    <TableCell>{r.reward_name}</TableCell>
                    <TableCell align="right">{r.points}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</TableCell>
                    <TableCell><StatusChip status={r.status} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {r.status === 'pendiente' ? (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button size="small" variant="contained" color="success" onClick={() => act(r, 'entregar')}>Entregar</Button>
                          <Button size="small" color="error" onClick={() => setCancel(r)}>Cancelar</Button>
                        </Stack>
                      ) : <Typography variant="caption" color="text.secondary">{fmtDate(r.resolved_at)}</Typography>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : <EmptyState icon={<RedeemRounded />} text={dq ? `Ningún canje coincide con «${dq}».` : 'No hay canjes en esta vista.'} />)}
      </Card>

      <Dialog open={!!cancel} onClose={() => setCancel(null)} maxWidth="xs" fullWidth>
        <DialogTitle>¿Cancelar canje {cancel?.code}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Se devolverán {cancel?.points} pts a {cancel?.client_name}{' '}y, si es un producto, se repondrá el stock.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCancel(null)}>Volver</Button>
          <Button color="error" variant="contained" onClick={() => act(cancel, 'cancelar')}>Cancelar canje</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
