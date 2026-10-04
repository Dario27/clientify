import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'

/** Carga un recurso GET y expone { data, loading, error, reload }. */
export default function useApi(path) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      setError(null)
      setData(await api(path))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { reload() }, [reload])
  return { data, loading, error, reload }
}
