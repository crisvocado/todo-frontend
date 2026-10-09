import { logError } from './client.js'

let isInitialized = false
let originalConsoleError = null
let errorListener = null
let rejectionListener = null

export function initGlobalErrorHandlers() {
  if (isInitialized) {
    return () => uninstallGlobalErrorHandlers()
  }
  isInitialized = true

  // Intercept console.error
  if (typeof console !== 'undefined' && console.error) {
    originalConsoleError = console.error
    console.error = function logcoreConsoleError(...args) {
      try {
        let msg = ''
        let err = null
        for (const arg of args) {
          if (arg instanceof Error) {
            err = arg
          } else if (!msg && typeof arg === 'string') {
            msg = arg
          }
        }
        if (!msg) {
          msg = err
            ? err.message
            : args
                .map((a) =>
                  typeof a === 'object' ? JSON.stringify(a) : String(a),
                )
                .join(' ')
        }
        logError(msg, err)
      } catch {
        // Logging must never break execution
      }
      return originalConsoleError.apply(console, args)
    }
  }

  // Window error listener
  if (typeof window !== 'undefined' && window.addEventListener) {
    errorListener = function onWindowError(event) {
      try {
        const error = event.error || new Error(event.message || 'Script error')
        const message = event.message || error.message || 'Uncaught error'
        logError(message, error)
      } catch {
        // Logging must never break execution
      }
    }
    window.addEventListener('error', errorListener)

    rejectionListener = function onUnhandledRejection(event) {
      try {
        const reason = event.reason
        const error =
          reason instanceof Error
            ? reason
            : new Error(String(reason || 'Unhandled Promise Rejection'))
        const message = error.message || 'Unhandled Promise Rejection'
        logError(message, error)
      } catch {
        // Logging must never break execution
      }
    }
    window.addEventListener('unhandledrejection', rejectionListener)
  }

  return () => uninstallGlobalErrorHandlers()
}

export function uninstallGlobalErrorHandlers() {
  if (!isInitialized) return
  isInitialized = false

  if (originalConsoleError && typeof console !== 'undefined') {
    console.error = originalConsoleError
    originalConsoleError = null
  }

  if (typeof window !== 'undefined' && window.removeEventListener) {
    if (errorListener) {
      window.removeEventListener('error', errorListener)
      errorListener = null
    }
    if (rejectionListener) {
      window.removeEventListener('unhandledrejection', rejectionListener)
      rejectionListener = null
    }
  }
}
