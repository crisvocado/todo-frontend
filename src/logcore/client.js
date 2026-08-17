// logcore client — posts structured log entries to the logcore HTTP gateway.
// The API key is unique per service, so the gateway resolves identity itself.

const ENDPOINT = import.meta.env.VITE_LOGCORE_ENDPOINT ?? ''
const API_KEY = import.meta.env.VITE_LOGCORE_KEY ?? ''
const SERVICE = import.meta.env.VITE_LOGCORE_SERVICE ?? 'todo-frontend'
const ENV = import.meta.env.VITE_LOGCORE_ENV ?? 'dev'
const SOURCE_PROJECT = import.meta.env.VITE_LOGCORE_SOURCE_PROJECT ?? 'todo-frontend'

const SCHEMA_VERSION = 1

export const isEnabled = Boolean(ENDPOINT && API_KEY)

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Deterministic id so a retried delivery of the same event dedupes server-side.
async function buildInsertId(raw) {
  const data = new TextEncoder().encode(raw)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(digest))
}

function serializeError(error) {
  if (!error) return undefined
  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
      stack_trace: error.stack ?? '',
    }
  }
  return { type: 'Error', message: String(error), stack_trace: '' }
}

export async function buildEntry({
  severity,
  message,
  error,
  labels,
  context,
  fingerprint,
  trace,
}) {
  const timestamp = new Date().toISOString()
  const err = serializeError(error)
  const insertId = await buildInsertId(
    `${timestamp}${SERVICE}${message}${err?.stack_trace ?? ''}`,
  )

  const entry = {
    timestamp,
    severity,
    message,
    service: SERVICE,
    env: ENV,
    source_project: SOURCE_PROJECT,
    insert_id: insertId,
  }

  if (trace) entry.trace = trace
  if (err) entry.error = err
  if (labels) entry.labels = labels
  if (context) entry.context = context
  if (fingerprint) entry.fingerprint = fingerprint

  return entry
}

export async function log(severity, message, options = {}) {
  if (!isEnabled) return

  try {
    const entry = await buildEntry({ severity, message, ...options })
    await fetch(`${ENDPOINT}/v1/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ schema_version: SCHEMA_VERSION, entries: [entry] }),
      keepalive: true,
    })
  } catch {
    // Logging must never break the app.
  }
}

export const logcore = {
  debug: (message, options) => log('DEBUG', message, options),
  info: (message, options) => log('INFO', message, options),
  warning: (message, options) => log('WARNING', message, options),
  error: (message, options) => log('ERROR', message, options),
  critical: (message, options) => log('CRITICAL', message, options),
}

export default logcore
