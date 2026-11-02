import { Chip } from '@mui/material'

const MAP = {
  pendiente: { label: 'Pendiente', color: 'warning' },
  entregado: { label: 'Entregado', color: 'success' },
  cancelado: { label: 'Cancelado', color: 'error' },
  reservado: { label: 'Reservado', color: 'info' },
  atendido: { label: 'Atendido', color: 'success' },
  ausente: { label: 'No vino', color: 'warning' },
}

export default function StatusChip({ status }) {
  const s = MAP[status] || { label: status, color: 'default' }
  return <Chip size="small" variant="outlined" label={s.label} color={s.color} />
}
