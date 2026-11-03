import { Box } from '@mui/material'
import { QRCodeSVG } from 'qrcode.react'

/** QR con el código del cliente. Fondo blanco fijo para que cualquier lector lo escanee, también en tema oscuro. */
export default function ClientQr({ code, size = 200 }) {
  return (
    <Box sx={{ bgcolor: '#fff', p: 1.5, borderRadius: 2, display: 'inline-flex' }}>
      <QRCodeSVG value={code} size={size} level="M" />
    </Box>
  )
}
