import { extractErrorInfo } from './stack.js'

function getEnvVar(name) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env[name]
    }
  } catch {
    // import.meta may not be available in some environments
  }
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name]
    }
  } catch {
    // process may not be available
  }
  return undefined
}

function normalizeEnv(rawEnv) {
  if (!rawEnv) return 'dev'
  const val = String(rawEnv).toLowerCase().trim()
  if (val === 'prod' || val === 'production') return 'prod'
  if (val === 'staging' || val === 'stage') return 'staging'
  if (val === 'dev' || val === 'development') return 'dev'
  if (val === 'test' || val === 'testing') return 'test'
  if (val === 'local') return 'local'
  return 'dev'
}

function generateInsertId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  let hex = ''
  for (let i = 0; i < 32; i++) {
    hex += Math.floor(Math.random() * 16).toString(16)
  }
  return hex
}

let customSender = null

export function setLogcoreSender(sender) {
  customSender = sender
}

export function createLogEntry({
  severity = 'ERROR',
  message = 'Unknown error',
  error = null,
  context = null,
  labels = null,
  trace = null,
} = {}) {
  const service = getEnvVar('VITE_LOGCORE_SERVICE') || 'todo-frontend'
  const mode = getEnvVar('VITE_LOGCORE_ENV') || getEnvVar('MODE') || 'dev'
  const env = normalizeEnv(mode)

  const entry = {
    timestamp: new Date().toISOString(),
    severity: String(severity).toUpperCase(),
    message: String(message || 'Unknown error').slice(0, 65536),
    service,
    env,
    insert_id: generateInsertId(),
  }

  const parsedError = extractErrorInfo(error)
  if (parsedError) {
    entry.error = parsedError
  }

  if (
    trace &&
    typeof trace === 'object' &&
    trace.traceId &&
    /^[0-9a-f]{32}$/.test(trace.traceId)
  ) {
    entry.trace = {
      traceId: trace.traceId,
      ...(trace.spanId ? { spanId: trace.spanId } : {}),
      ...(typeof trace.sampled === 'boolean' ? { sampled: trace.sampled } : {}),
    }
  }

  if (labels && typeof labels === 'object' && Object.keys(labels).length > 0) {
    const cleanLabels = {}
    let count = 0
    for (const [k, v] of Object.entries(labels)) {
      if (count >= 32) break
      if (/^[a-zA-Z0-9_-]{1,64}$/.test(k)) {
        cleanLabels[k] = String(v).slice(0, 1024)
        count++
      }
    }
    if (Object.keys(cleanLabels).length > 0) {
      entry.labels = cleanLabels
    }
  }

  if (context && typeof context === 'object' && Object.keys(context).length > 0) {
    entry.context = context
  }

  return entry
}

export async function sendLogcoreEntries(entries) {
  if (!entries || entries.length === 0) return

  const envelope = {
    schema_version: 1,
    entries: Array.isArray(entries) ? entries : [entries],
  }

  if (customSender) {
    try {
      return await customSender(envelope)
    } catch {
      // Swallowed: logging must never throw or break the app
      return
    }
  }

  const enabledVal = getEnvVar('VITE_LOGCORE_ENABLED')
  const isEnabled =
    enabledVal === undefined ? true : String(enabledVal).toLowerCase() !== 'false'
  if (!isEnabled) return

  const baseUrl =
    getEnvVar('VITE_LOGCORE_URL') ||
    'https://logcore-dev-352942961463.us-east4.run.app'
  const apiKey = getEnvVar('VITE_LOGCORE_KEY')

  try {
    const url = baseUrl.replace(/\/+$/, '') + '/v1/logs'
    const headers = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers['x-api-key'] = apiKey
    }

    if (typeof fetch === 'function') {
      await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
        keepalive: true,
      })
    }
  } catch {
    // Swallowed: logging must never throw or break the app
  }
}

export function logError(message, errorOrContext, maybeContext) {
  let error = null
  let context = null

  if (
    errorOrContext instanceof Error ||
    (errorOrContext &&
      typeof errorOrContext === 'object' &&
      errorOrContext.message)
  ) {
    error = errorOrContext
    context = maybeContext
  } else if (typeof errorOrContext === 'object' && errorOrContext !== null) {
    context = errorOrContext
  }

  const entry = createLogEntry({
    severity: 'ERROR',
    message: typeof message === 'string' ? message : String(message || 'Error'),
    error,
    context,
  })

  return sendLogcoreEntries([entry])
}
