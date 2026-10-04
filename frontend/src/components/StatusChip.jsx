import { Chip } from '@mui/material'

const MAP = {
  pendiente: { label: 'Pendiente', color: 'warning' },
  entregado: { label: 'Entregado', color: 'success' },
  cancelado: { label: 'Cancelado', color: 'error' },
}

export default function StatusChip({ status }) {
  const s = MAP[status] || { label: status, color: 'default' }
  return <Chip size="small" variant="outlined" label={s.label} color={s.color} />
}
