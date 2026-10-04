import { Box, Card, CardContent, Typography } from '@mui/material'

export default function StatCard({ label, value, icon, hint, accent }) {
  return (
    <Card>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="overline" sx={{ lineHeight: 1.4 }}>{label}</Typography>
          <Box sx={{
            width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center',
            bgcolor: accent ? 'rgba(229,169,59,0.14)' : 'rgba(148,163,184,0.12)',
            color: accent ? 'primary.main' : 'text.secondary', '& svg': { fontSize: 19 },
          }}>{icon}</Box>
        </Box>
        <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: accent ? 'primary.main' : 'text.primary' }}>
          {value}
        </Typography>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </CardContent>
    </Card>
  )
}
