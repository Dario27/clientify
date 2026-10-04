import { Box, Card, CardContent, Typography } from '@mui/material'
import Logo from './Logo'
import { brand } from '../theme'

/** Pantalla dividida: panel de marca + formulario. */
export default function AuthShell({ title, subtitle, children, pub }) {
  const business = pub?.business_name
  const highlights = pub ? [
    [pub.welcome_bonus, 'pts de bienvenida'],
    [pub.referral_bonus_referrer, 'pts por cada referido'],
  ] : []
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      <Box sx={{
        display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between', p: 6,
        background: `radial-gradient(circle at 20% 15%, rgba(229,169,59,0.18), transparent 45%), linear-gradient(160deg, ${brand.slate}, ${brand.night})`,
        borderRight: 1, borderColor: 'divider',
      }}>
        <Logo size="lg" subtitle={business} />
        <Box>
          <Typography variant="h4" sx={{ maxWidth: 420, mb: 2 }}>
            Cada visita suma. <Box component="span" sx={{ color: 'primary.main' }}>Cada punto se canjea.</Box>
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
            Acumula puntos en cada corte, invita a tus amigos y canjéalos por servicios y productos de tu barbería.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 4 }}>
          {highlights.map(([n, l]) => (
            <Box key={l}>
              <Typography sx={{ fontSize: 26, fontWeight: 800, color: 'primary.main' }}>+{n}</Typography>
              <Typography variant="caption" color="text.secondary">{l}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 2, sm: 4 } }}>
        <Box sx={{ width: '100%', maxWidth: 420 }}>
          <Box sx={{ display: { md: 'none' }, mb: 3 }}><Logo size="lg" subtitle={business} /></Box>
          <Card>
            <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
              <Typography variant="h5" sx={{ mb: 0.5 }}>{title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{subtitle}</Typography>
              {children}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  )
}
