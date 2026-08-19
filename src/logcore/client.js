// logcore client: builds a log entry and posts it to the gateway.
//
// The gateway resolves the sender from the API key, so the entry carries no
// service_id and no source_project — the app runs in no GCP project, and the
// schema rejects that field when it is present but empty.

import { buildError } from './stack.js'

const SERVICE = 'todo-frontend'
const ENDPOINT_PATH = '/v1/logs'
const SEVERITIES = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']

function insertId(input) {
  // Four FNV-1a passes with different offset bases: 4 x 8 hex chars is exactly
  // the 32 the schema requires (a full SHA-256 digest is 64 and is rejected).
  // Deterministic on purpose, so the same error redelivered is deduped.
  const bases = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
  return bases
    .map((base) => {
      let hash = base >>> 0
      for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
      }
      return hash.toString(16).padStart(8, '0')
    })
    .join('')
}

export function buildEntry(severity, message, options = {}, config = {}) {
  const { error, context, labels, fingerprint } = options
  const service = config.service || SERVICE
  const env = config.env || 'dev'
  const timestamp = new Date().toISOString()
  const errorObject = error === undefined || error === null ? undefined : buildError(error)
  const topFrame = errorObject?.stack?.[0] ?? {}

  const entry = {
    timestamp,
    severity: SEVERITIES.includes(severity) ? severity : 'ERROR',
    message: String(message ?? ''),
    service,
    env,
    // The throw site rather than the whole stack: it identifies the error while
    // staying stable across the frames around it that vary per interaction.
    insert_id: insertId(
      `${timestamp}${service}${message}${topFrame.file ?? ''}${topFrame.line ?? ''}`,
    ),
  }
  if (errorObject) entry.error = errorObject
  if (context) entry.context = context
  if (labels) entry.labels = labels
  if (fingerprint) entry.fingerprint = fingerprint
  return entry
}

function defaultSend(url, apiKey, body) {
  // keepalive so the request survives a page unload — sendBeacon cannot be used
  // here because it carries no custom headers, and the key travels in one.
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
    keepalive: true,
  })
}

/**
 * @param {object} config
 * @param {string} config.url    logcore gateway base URL
 * @param {string} config.apiKey per-service key; the gateway stamps identity from it
 * @param {string} [config.env]  one of prod, staging, dev, test, local
 * @param {boolean} [config.enabled]
 * @param {Function} [config.send] transport override, so the client is testable
 *   with no network and no credentials
 */
export function createLogcoreClient(config = {}) {
  const { url, apiKey, env, service, enabled = true, send = defaultSend } = config
  const active = Boolean(enabled && url && apiKey)

  function log(severity, message, options = {}) {
    if (!active) return
    try {
      const entry = buildEntry(severity, message, options, { env, service })
      // A bare { entries } is a 422: the envelope declares its schema version.
      const body = { schema_version: 1, entries: [entry] }
      const result = send(`${url.replace(/\/$/, '')}${ENDPOINT_PATH}`, apiKey, body)
      // Fire and forget: a log that cannot be delivered must never surface in
      // the UI or reject into the caller's flow.
      if (result && typeof result.catch === 'function') result.catch(() => {})
    } catch {
      // Same reason — reporting an error must not become one.
    }
  }

  return {
    isActive: () => active,
    log,
    logError: (error, message, options = {}) =>
      log('ERROR', message ?? `${error?.name ?? 'Error'}: ${error?.message ?? error}`, {
        ...options,
        error,
      }),
  }
}

const viteEnv = import.meta.env ?? {}

// The app's client. Every variable needs Vite's VITE_ prefix or it simply is
// not present in browser code, and the client silently never sends anything.
export const logcore = createLogcoreClient({
  url: viteEnv.VITE_LOGCORE_URL,
  apiKey: viteEnv.VITE_LOGCORE_KEY,
  env: viteEnv.VITE_LOGCORE_ENV || 'dev',
  enabled: viteEnv.VITE_LOGCORE_ENABLED !== 'false',
})
