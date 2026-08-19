import { logError } from './client'

/**
 * Instala los handlers globales de error y devuelve la función que los quita.
 * Un efecto global localizado y reversible: sin el desinstalador, cada montaje
 * en tests o en HMR dejaría un handler colgado.
 */
export function installGlobalHandlers(target = window) {
  function onError(event) {
    logError(event.message || 'uncaught error', event.error, {
      labels: { handler: 'onerror' },
    })
  }

  function onUnhandledRejection(event) {
    logError('unhandled promise rejection', event.reason, {
      labels: { handler: 'unhandledrejection' },
    })
  }

  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onUnhandledRejection)

  return function uninstallGlobalHandlers() {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
