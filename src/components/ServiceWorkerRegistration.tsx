import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (!window.isSecureContext) return

    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  }, [])

  return null
}
