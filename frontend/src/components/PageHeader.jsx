import { Box, Typography } from '@mui/material'

export default function PageHeader({ title, subtitle, action }) {
  return (
    <Box sx={{ display: 'flex', alignItems: { sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
      <Box sx={{ flex: 1 }}>
        <Typography variant="h5">{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
      </Box>
      {action}
    </Box>
  )
}
