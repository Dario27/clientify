import { useEffect, useState } from 'react'

// El navegador avisa una sola vez (beforeinstallprompt) y puede hacerlo antes de que un componente se monte,
// así que el evento se guarda a nivel de módulo y los componentes se suscriben a los cambios.
let deferred = null
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** { installed, canInstall, ios, install }: estado y acción para ofrecer la instalación de la app. */
export default function useInstallPrompt() {
  const [, rerender] = useState(0)
  useEffect(() => {
    const fn = () => rerender((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice
    deferred = null // el evento solo se puede usar una vez
    notify()
  }

  return { installed: isStandalone(), canInstall: !!deferred, ios: isIOS() && !isStandalone(), install }
}
