// Handlers globales: recogen lo que no atrapa ningún try/catch ni el boundary.

import { logError } from './client'

export function installGlobalHandlers(target = globalThis) {
  const onError = (event) => {
    logError(event.error ?? new Error(event.message), {
      message: event.message,
      context: { handler: 'window.onerror' },
    })
  }

  const onUnhandledRejection = (event) => {
    const reason = event.reason
    logError(reason instanceof Error ? reason : new Error(String(reason)), {
      context: { handler: 'unhandledrejection' },
    })
  }

  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onUnhandledRejection)

  return function uninstallGlobalHandlers() {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
