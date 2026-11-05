import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import InstallMobileRounded from '@mui/icons-material/InstallMobileRounded'
import useInstallPrompt from '../hooks/useInstallPrompt'

/** Tarjeta para instalar la app en el celular. No se muestra si ya está instalada o el navegador no puede. */
export default function InstallApp() {
  const { installed, canInstall, ios, install } = useInstallPrompt()
  if (installed || (!canInstall && !ios)) return null
  return (
    <Card>
      <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h6">Instala la app</Typography>
          <Typography variant="body2" color="text.secondary">
            {ios
              ? 'En iPhone: toca el botón Compartir del navegador y luego «Agregar a pantalla de inicio».'
              : 'Ábrela con un toque desde tu pantalla de inicio, como cualquier otra app.'}
          </Typography>
        </Box>
        {canInstall && <Button variant="contained" startIcon={<InstallMobileRounded />} onClick={install}>Instalar</Button>}
      </CardContent>
    </Card>
  )
}
