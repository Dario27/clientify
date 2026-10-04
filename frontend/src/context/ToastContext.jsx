import { createContext, useCallback, useContext, useState } from 'react'
import { Alert, Snackbar } from '@mui/material'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const notify = useCallback((message, severity = 'success') => {
    setToast({ message, severity, key: Date.now() })
  }, [])
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <Snackbar
        key={toast?.key}
        open={!!toast}
        autoHideDuration={4000}
        onClose={(_, r) => r !== 'clickaway' && setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
