import { logError, isLogcoreUrl } from './client'

// `fetch` has no interceptor hook, so it is patched here rather than at the
// call sites — the app keeps calling fetch exactly as it did. A 5xx response is
// a resolved promise, not a rejection, so without this the server errors this
// app already swallows would never reach the global handlers.
export function installFetchLogging() {
  const original = window.fetch
  if (typeof original !== 'function') return function uninstall() {}

  window.fetch = async function instrumentedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input))
    const method = init?.method ?? (typeof input === 'object' ? input?.method : undefined) ?? 'GET'

    // Reporting a failed report would loop.
    if (isLogcoreUrl(url)) return original.call(this, input, init)

    try {
      const response = await original.call(this, input, init)
      if (response.status >= 500) {
        // URL, method and status only — bodies and headers can carry PII.
        logError(`HTTP ${response.status} from ${method} ${url}`, {
          labels: { handler: 'fetch', status: String(response.status) },
          context: { url, method },
          fingerprint: `fetch:${method}:${url}:${response.status}`,
        })
      }
      return response
    } catch (error) {
      logError(`Network failure on ${method} ${url}`, {
        error,
        labels: { handler: 'fetch' },
        context: { url, method },
      })
      throw error
    }
  }

  return function uninstallFetchLogging() {
    window.fetch = original
  }
}
