import { useEffect, useState } from 'react'
import { Box, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { api } from '../api'
import { fmtDay, todayISO } from '../utils'

/**
 * Elige servicio, fecha y hora. `dates` es la lista de fechas con atención (cliente);
 * si es null se muestra un selector de fecha libre (admin). `reloadKey` fuerza volver a pedir las horas.
 */
export default function SlotPicker({ services, dates, value, onChange, reloadKey = 0 }) {
  const { serviceId, date, time } = value
  const [slots, setSlots] = useState(null)
  const set = (patch) => onChange({ ...value, ...patch })

  useEffect(() => {
    if (!serviceId || !date) { setSlots(null); return undefined }
    let cancelled = false
    setSlots(null)
    api(`/slots?service_id=${serviceId}&date=${date}`)
      .then((s) => { if (!cancelled) setSlots(s) })
      .catch(() => { if (!cancelled) setSlots([]) })
    return () => { cancelled = true }
  }, [serviceId, date, reloadKey])

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>1. Servicio</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {services.map((s) => (
            <Chip
              key={s.id} clickable color={s.id === serviceId ? 'primary' : 'default'} variant={s.id === serviceId ? 'filled' : 'outlined'}
              label={`${s.name} · ${s.duration_min} min · $${s.price.toFixed(2)}`}
              onClick={() => set({ serviceId: s.id, time: '' })}
            />
          ))}
        </Box>
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>2. Fecha</Typography>
        {dates ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {dates.map((d) => (
              <Chip
                key={d} clickable color={d === date ? 'primary' : 'default'} variant={d === date ? 'filled' : 'outlined'}
                label={fmtDay(d)} onClick={() => set({ date: d, time: '' })}
              />
            ))}
          </Box>
        ) : (
          <TextField
            type="date" size="small" value={date} onChange={(e) => set({ date: e.target.value, time: '' })}
            slotProps={{ htmlInput: { min: todayISO() } }}
          />
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>3. Hora</Typography>
        {!serviceId || !date ? (
          <Typography variant="body2" color="text.secondary">Elige primero el servicio y la fecha.</Typography>
        ) : slots === null ? (
          <CircularProgress size={22} />
        ) : slots.length ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {slots.map((t) => (
              <Chip
                key={t} clickable color={t === time ? 'primary' : 'default'} variant={t === time ? 'filled' : 'outlined'}
                label={t} onClick={() => set({ time: t })}
              />
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">No quedan horarios ese día. Prueba con otra fecha.</Typography>
        )}
      </Box>
    </Stack>
  )
}
