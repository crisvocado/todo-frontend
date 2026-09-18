/**
 * Global error handlers and console interceptor for Logcore.
 */

import { captureError } from './client.js'

let isLogging = false

/**
 * Initializes global uncaught error listeners and console.error interception.
 * Returns an uninstaller function to restore original handlers.
 */
export function initGlobalHandlers(options = {}) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  // 1. Uncaught window error listener
  const onError = (event) => {
    try {
      if (event.error) {
        captureError(event.error, {
          context: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          },
        })
      } else if (event.message) {
        const synthetic = new Error(event.message)
        captureError(synthetic, {
          context: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          },
        })
      }
    } catch {
      // Never crash on error handler failure
    }
  }

  // 2. Unhandled promise rejection listener
  const onUnhandledRejection = (event) => {
    try {
      const reason = event.reason
      if (reason instanceof Error) {
        captureError(reason)
      } else {
        const msg = typeof reason === 'string' ? reason : JSON.stringify(reason) || 'Unhandled Promise Rejection'
        captureError(new Error(msg))
      }
    } catch {
      // Never crash on rejection handler failure
    }
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  // 3. Intercept console.error without replacing application logger
  const originalConsoleError = console.error
  console.error = function (...args) {
    try {
      originalConsoleError.apply(console, args)
    } catch {
      // Ignore console failures
    }

    if (isLogging) return
    isLogging = true

    try {
      let foundError = null
      const messageParts = []

      for (const arg of args) {
        if (arg instanceof Error) {
          if (!foundError) foundError = arg
        } else if (typeof arg === 'object' && arg !== null) {
          try {
            messageParts.push(JSON.stringify(arg))
          } catch {
            messageParts.push(String(arg))
          }
        } else {
          messageParts.push(String(arg))
        }
      }

      const message = messageParts.join(' ') || (foundError && foundError.message) || 'console.error captured'
      captureError(foundError || new Error(message), { message })
    } catch {
      // Forwarding must never disrupt execution
    } finally {
      isLogging = false
    }
  }

  // Return uninstaller
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    console.error = originalConsoleError
  }
}
