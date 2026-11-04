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

// '1990-03-15' -> '15 mar' (el año no se muestra: solo importa el día y el mes).
export const fmtBirthday = (s) => (s ? `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}` : '')

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

// '2026-11-03' -> 'lun 3 nov'
export function fmtDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`
}

// Turno -> '10:00–10:30'
export const fmtRange = (a) => `${a.start_at.slice(11)}–${a.end_at.slice(11)}`

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const todayISO = () => isoOf(new Date())
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return isoOf(new Date(y, m - 1, d + n))
}

export const fmtPts = (n) => `${n > 0 ? '+' : ''}${n}`

export const TX_LABELS = {
  bienvenida: 'Bienvenida',
  referido: 'Referido',
  visita: 'Visita',
  canje: 'Canje',
  reembolso: 'Devolución',
  ajuste: 'Ajuste',
  cumpleanos: 'Cumpleaños',
  vencimiento: 'Vencimiento',
}

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
