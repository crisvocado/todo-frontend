// Global handlers for what never reaches a React error boundary: errors thrown
// outside rendering, and promise rejections nobody caught.

import { logcore } from './client.js'

export function installGlobalHandlers(client = logcore) {
  if (typeof window === 'undefined') return () => {}

  const onError = (event) => {
    client.logError(event.error ?? event.message, undefined, {
      context: { source: 'window.onerror' },
    })
  }

  const onUnhandledRejection = (event) => {
    client.logError(event.reason, undefined, {
      context: { source: 'unhandledrejection' },
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  // Every global effect is reversible.
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
