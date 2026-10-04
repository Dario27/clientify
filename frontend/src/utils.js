const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function fmtDate(s, withTime = true) {
  if (!s) return '—'
  const [d, t] = s.split(' ')
  const [y, m, day] = d.split('-')
  const base = `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`
  return withTime && t ? `${base}, ${t}` : base
}

export const fmtPts = (n) => `${n > 0 ? '+' : ''}${n}`

export const TX_LABELS = {
  bienvenida: 'Bienvenida',
  referido: 'Referido',
  visita: 'Visita',
  canje: 'Canje',
  reembolso: 'Devolución',
  ajuste: 'Ajuste',
}

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
