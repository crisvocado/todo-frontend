// Logcore gateway client. Posts structured log entries over HTTP; the gateway
// resolves this service's identity from the API key, so no service id is sent.

const SERVICE = 'todo-frontend'

const config = {
  enabled: import.meta.env.VITE_LOGCORE_ENABLED === 'true',
  url: import.meta.env.VITE_LOGCORE_URL,
  key: import.meta.env.VITE_LOGCORE_KEY,
  env: import.meta.env.VITE_LOGCORE_ENV || (import.meta.env.PROD ? 'production' : 'dev'),
}

export function isEnabled() {
  return Boolean(config.enabled && config.url && config.key)
}

// 32 random bytes as hex. Generated once when the entry is built rather than at
// send time, so a retried or beacon-resent delivery of the same entry keeps one
// id and the gateway can drop the duplicate.
function newInsertId() {
  const bytes = new Uint8Array(32)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function serializeError(error) {
  if (!error) return undefined
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      message: error.message || String(error),
      stack_trace: error.stack || '',
    }
  }
  return { type: typeof error, message: String(error), stack_trace: '' }
}

// Fields stay flat: this transport does not pass through Cloud Logging, so
// nothing is promoted or nested. source_project is omitted on purpose — a
// browser has no GCP project and the gateway rejects an empty one.
export function buildEntry({ severity, message, error, context, labels, fingerprint }) {
  const entry = {
    timestamp: new Date().toISOString(),
    severity,
    message,
    service: SERVICE,
    env: config.env,
    insert_id: newInsertId(),
  }

  const serialized = serializeError(error)
  if (serialized) entry.error = serialized
  if (context) entry.context = context
  if (labels) entry.labels = labels
  if (fingerprint) entry.fingerprint = fingerprint

  return entry
}

// Fire-and-forget: never awaited by the UI, never rejects. A log that cannot be
// delivered must not surface as an error in the app that produced it.
export function sendEntries(entries) {
  if (!isEnabled() || entries.length === 0) return Promise.resolve(false)

  return fetch(`${config.url}/v1/logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.key,
    },
    body: JSON.stringify({ schema_version: 1, entries }),
    // keepalive lets the request outlive the page when an error happens during
    // navigation or unload.
    keepalive: true,
  })
    .then((res) => res.ok)
    .catch(() => false)
}

export function log(severity, message, options = {}) {
  return sendEntries([buildEntry({ severity, message, ...options })])
}

export function logError(message, error, options = {}) {
  return log('ERROR', message, { ...options, error })
}
