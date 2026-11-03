import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import jsQR from 'jsqr'
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded'
import PersonAddRounded from '@mui/icons-material/PersonAddRounded'
import PageHeader from '../../components/PageHeader'
import QuickRegisterDialog from '../../components/QuickRegisterDialog'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'

export default function Scan() {
  const navigate = useNavigate()
  const notify = useToast()
  const videoRef = useRef(null)
  const lookingUp = useRef(false)
  const [code, setCode] = useState('')
  const [camera, setCamera] = useState('idle') // idle | on | error
  const [cameraMsg, setCameraMsg] = useState('')
  const [quick, setQuick] = useState(false)

  const lookup = useCallback(async (value) => {
    const c = value.trim()
    if (!c || lookingUp.current) return
    lookingUp.current = true
    try {
      const { id } = await api(`/admin/clients/by-code/${encodeURIComponent(c)}`)
      navigate(`/admin/clientes/${id}`)
    } catch (e) {
      notify(e.message, 'error')
      setTimeout(() => { lookingUp.current = false }, 1500) // evita repetir el aviso en cada fotograma
    }
  }, [navigate, notify])

  // La cámara solo funciona en HTTPS o localhost; si no, queda el campo de código.
  const secure = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

  useEffect(() => {
    if (camera !== 'on') return undefined
    let stream
    let raf
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const tick = () => {
      const v = videoRef.current
      if (stopped || !v) return
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        ctx.drawImage(v, 0, 0)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const hit = jsQR(img.data, img.width, img.height)
        if (hit?.data) lookup(hit.data)
      }
      raf = requestAnimationFrame(tick)
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return undefined }
        stream = s
        videoRef.current.srcObject = s
        return videoRef.current.play().then(tick)
      })
      .catch(() => { setCameraMsg('No se pudo abrir la cámara. Revisa el permiso del navegador.'); setCamera('error') })
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [camera, lookup])

  return (
    <>
      <PageHeader
        title="Escanear cliente"
        subtitle="Escanea el QR de su cuenta o escribe su código para abrir su ficha."
        action={<Button variant="outlined" startIcon={<PersonAddRounded />} onClick={() => setQuick(true)}>Registro rápido</Button>}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Cámara</Typography>
            {camera === 'on' ? (
              <Stack spacing={2}>
                <Box component="video" ref={videoRef} muted playsInline sx={{ width: '100%', borderRadius: 2, bgcolor: 'black', aspectRatio: '1 / 1', objectFit: 'cover' }} />
                <Button color="inherit" onClick={() => setCamera('idle')}>Apagar cámara</Button>
              </Stack>
            ) : (
              <Stack spacing={2}>
                {!secure && (
                  <Alert severity="info">
                    La cámara solo se puede usar desde una dirección segura (HTTPS). Mientras tanto, escribe el código o usa un lector de QR con cable o Bluetooth.
                  </Alert>
                )}
                {camera === 'error' && <Alert severity="warning">{cameraMsg}</Alert>}
                <Button variant="contained" startIcon={<QrCodeScannerRounded />} disabled={!secure} onClick={() => setCamera('on')}>Abrir cámara</Button>
              </Stack>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent component="form" onSubmit={(e) => { e.preventDefault(); lookup(code) }} sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>Código del cliente</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Un lector de QR escribe el código aquí solo y envía con Enter.
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Código" value={code} autoFocus onChange={(e) => setCode(e.target.value.toUpperCase())}
                slotProps={{ htmlInput: { style: { fontFamily: 'monospace', letterSpacing: 1 } }, input: { startAdornment: <InputAdornment position="start"><QrCodeScannerRounded fontSize="small" /></InputAdornment> } }}
              />
              <Button type="submit" variant="contained" disabled={!code.trim()}>Buscar cliente</Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
      <QuickRegisterDialog open={quick} onClose={() => setQuick(false)} />
    </>
  )
}
