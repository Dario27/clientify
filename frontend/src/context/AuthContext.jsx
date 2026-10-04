import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setUser(await api('/me'))
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const login = async (email, password) => {
    const u = await api('/login', { method: 'POST', body: { email, password } })
    setUser(u)
    return u
  }
  const register = async (payload) => {
    const u = await api('/register', { method: 'POST', body: payload })
    setUser(u)
    return u
  }
  const logout = async () => {
    await api('/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
