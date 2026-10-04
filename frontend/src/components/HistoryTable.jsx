import { Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { TX_LABELS, fmtDate, fmtPts } from '../utils'
import EmptyState from './EmptyState'

export default function HistoryTable({ rows = [] }) {
  if (!rows.length) return <EmptyState text="Sin movimientos todavía." />
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Fecha</TableCell>
            <TableCell>Tipo</TableCell>
            <TableCell>Detalle</TableCell>
            <TableCell align="right">Puntos</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{fmtDate(t.created_at)}</TableCell>
              <TableCell><Chip size="small" label={TX_LABELS[t.type] || t.type} sx={{ bgcolor: 'rgba(148,163,184,0.12)' }} /></TableCell>
              <TableCell>{t.description}</TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700} color={t.points > 0 ? 'success.main' : 'error.main'}>
                  {fmtPts(t.points)}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
