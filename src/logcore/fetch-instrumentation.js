// `fetch` has no interceptor, so the wrapper is installed explicitly from the
// entry point and hands back its own uninstall. It exists because the app
// handles its request failures inline — a swallowed `catch` reaches no global
// handler, so without this the failures that matter most report nothing.

import { logcore } from './client.js'

function safePath(url) {
  // Path only. A query string carries user input and sometimes tokens.
  try {
    return new URL(url, typeof location === 'undefined' ? undefined : location.href).pathname
  } catch {
    return String(url).split('?')[0]
  }
}

export function installFetchLogging(client = logcore, options = {}) {
  const scope = options.scope ?? (typeof globalThis === 'undefined' ? null : globalThis)
  if (!scope?.fetch) return () => {}

  const originalFetch = scope.fetch
  // The client posts with this same fetch; logging its own delivery would
  // recurse on every failure.
  const ownEndpoint = options.ignoreUrl ?? ''

  scope.fetch = async function instrumentedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input))
    const method = (init?.method ?? input?.method ?? 'GET').toUpperCase()
    const isOwnDelivery = ownEndpoint && url.startsWith(ownEndpoint)

    try {
      const response = await originalFetch.call(this, input, init)
      if (!isOwnDelivery && !response.ok) {
        client.log('WARNING', `${method} ${safePath(url)} responded ${response.status}`, {
          context: { method, path: safePath(url), status: response.status },
        })
      }
      return response
    } catch (error) {
      if (!isOwnDelivery) {
        client.logError(error, `${method} ${safePath(url)} failed`, {
          context: { method, path: safePath(url) },
        })
      }
      // The caller's own error handling is untouched.
      throw error
    }
  }

  return () => {
    scope.fetch = originalFetch
  }
}
