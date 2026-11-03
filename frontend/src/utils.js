const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function fmtDate(s, withTime = true) {
  if (!s) return '—'
  const [d, t] = s.split(' ')
  const [y, m, day] = d.split('-')
  const base = `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`
  return withTime && t ? `${base}, ${t}` : base
}

// Los clientes del registro rápido sin correo tienen uno interno que no se debe mostrar.
export const realEmail = (email) => (email && !email.endsWith('@sin-correo.local') ? email : '')

// Clave inicial legible: sin caracteres que se confunden al dictarlos (0/O, 1/l/I).
const PASSWORD_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789'
export const generatePassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join('')

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
