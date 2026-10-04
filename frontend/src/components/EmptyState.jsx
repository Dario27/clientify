import { Box, Typography } from '@mui/material'

export default function EmptyState({ text, icon }) {
  return (
    <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
      {icon && <Box sx={{ mb: 1, '& svg': { fontSize: 36, opacity: 0.6 } }}>{icon}</Box>}
      <Typography variant="body2">{text}</Typography>
    </Box>
  )
}
