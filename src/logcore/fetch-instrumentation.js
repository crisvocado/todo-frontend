// La app atrapa sus propios fallos de red en cada `catch`, así que nunca llegan
// a los handlers globales. fetch no tiene interceptores, de modo que se parchea
// desde aquí: un solo efecto global, instalado explícitamente y reversible.

import { logError, readConfig } from './client'

function requestUrl(input) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input?.url ?? ''
}

export function installFetchLogging(target = globalThis) {
  const original = target.fetch
  if (typeof original !== 'function') return () => {}

  const { url: logcoreUrl } = readConfig()

  target.fetch = async function instrumentedFetch(input, init) {
    const url = requestUrl(input)
    // Sin esto, un fallo al enviar un log genera otro log: bucle.
    const isLogcoreCall = Boolean(logcoreUrl) && url.startsWith(logcoreUrl)

    try {
      const response = await original.call(this, input, init)
      if (!isLogcoreCall && response.status >= 500) {
        logError(new Error(`${response.status} on ${url}`), {
          message: `HTTP ${response.status} ${init?.method ?? 'GET'} ${url}`,
          // Solo método, URL y estado: cuerpos y cabeceras pueden llevar PII.
          context: { method: init?.method ?? 'GET', url, status: response.status },
        })
      }
      return response
    } catch (error) {
      if (!isLogcoreCall) {
        logError(error, {
          message: `Fallo de red en ${init?.method ?? 'GET'} ${url}`,
          context: { method: init?.method ?? 'GET', url },
        })
      }
      throw error
    }
  }

  return function uninstallFetchLogging() {
    target.fetch = original
  }
}
