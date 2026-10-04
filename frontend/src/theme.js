import { createTheme, alpha } from '@mui/material/styles'

// Paleta "Trust & Reward"
export const brand = {
  night: '#0A1128',   // Azul Noche Profundo — fondo dominante
  gold: '#E5A93B',    // Oro Viejo / Mostaza — puntos y acciones clave
  slate: '#1E293B',   // Pizarra Oscuro — tarjetas, bordes, interacción
  light: '#F8FAFC',   // Texto principal (sobre oscuro)
  ink: '#0F172A',     // Texto sobre oro / superficies profundas
  muted: '#94A3B8',   // Texto secundario (slate-400)
  line: '#334155',    // Bordes sutiles (slate-700)
}

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: brand.gold, contrastText: brand.ink },
    secondary: { main: '#60A5FA', contrastText: brand.ink },
    success: { main: '#34D399', contrastText: brand.ink },
    error: { main: '#F87171' },
    warning: { main: brand.gold },
    background: { default: brand.night, paper: brand.slate },
    text: { primary: brand.light, secondary: brand.muted },
    divider: alpha(brand.muted, 0.16),
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter Variable", Inter, system-ui, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    overline: { fontWeight: 600, letterSpacing: '0.08em', color: brand.muted },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: brand.night, fontVariantNumeric: 'tabular-nums' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: alpha(brand.muted, 0.14) },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { backgroundColor: brand.slate, borderColor: alpha(brand.muted, 0.14) } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10, paddingInline: 16 } },
    },
    MuiTextField: { defaultProps: { fullWidth: true, size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: brand.ink,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(brand.muted, 0.22) },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: alpha(brand.muted, 0.12) },
        head: { color: brand.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: brand.ink, borderColor: alpha(brand.muted, 0.12) } } },
    MuiAppBar: { styleOverrides: { root: { backgroundColor: alpha(brand.night, 0.85), backdropFilter: 'blur(8px)' } } },
    MuiDialog: { styleOverrides: { paper: { backgroundColor: brand.slate, backgroundImage: 'none' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
  },
})

export default theme
