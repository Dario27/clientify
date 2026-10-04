import { Box, Typography } from '@mui/material'
import { brand } from '../theme'

export default function Logo({ subtitle, size = 'md' }) {
  const s = size === 'lg' ? 40 : 30
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box
        component="svg" viewBox="0 0 32 32" sx={{ width: s, height: s, flexShrink: 0 }}
        aria-hidden
      >
        <rect width="32" height="32" rx="8" fill={brand.slate} />
        <circle cx="16" cy="16" r="9" fill="none" stroke={brand.gold} strokeWidth="3" />
        <circle cx="16" cy="16" r="3.5" fill={brand.gold} />
      </Box>
      <Box sx={{ lineHeight: 1.1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: size === 'lg' ? 22 : 17, letterSpacing: '-0.02em' }}>
          Clientify
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 180 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
