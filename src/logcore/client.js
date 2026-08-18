// logcore gateway client. Builds entries in the http wire shape (all fields
// flat — this path never passes through Cloud Logging) and posts them to
// <VITE_LOGCORE_URL>/v1/logs. The API key is unique per service, so the
// gateway resolves the sender itself; no service_id is sent from the browser.

const SERVICE = 'todo-frontend'

const SEVERITIES = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']

// Vite only exposes VITE_-prefixed variables to browser code. Read them per
// call rather than at module load so the module stays stubbable in tests.
function readConfig() {
  const env = import.meta.env
  return {
    enabled: env.VITE_LOGCORE_ENABLED === 'true',
    url: env.VITE_LOGCORE_URL,
    key: env.VITE_LOGCORE_KEY,
    env: env.VITE_LOGCORE_ENV || 'dev',
    sourceProject: env.VITE_LOGCORE_SOURCE_PROJECT || '',
  }
}

// FNV-1a over the entry's identifying content, four seeds wide. Deterministic
// on purpose: a retry of the same entry carries the same insert_id, so the
// gateway dedups it instead of recording a second occurrence.
function insertId(parts) {
  const input = parts.join('|')
  const seeds = [0x811c9dc5, 0x01000193, 0x9dc5811c, 0x193010000 >>> 0]
  return seeds
    .map((seed) => {
      let hash = seed >>> 0
      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
      }
      return hash.toString(16).padStart(8, '0')
    })
    .join('')
}

function describeError(error) {
  if (!error) return undefined
  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
      stack_trace: error.stack || '',
    }
  }
  return { type: typeof error, message: String(error), stack_trace: '' }
}

export function buildEntry(severity, message, options = {}) {
  const config = readConfig()
  const timestamp = new Date().toISOString()
  const error = describeError(options.error)

  const entry = {
    timestamp,
    severity: SEVERITIES.includes(severity) ? severity : 'ERROR',
    message: String(message ?? ''),
    service: SERVICE,
    env: config.env,
    source_project: config.sourceProject,
    insert_id: insertId([timestamp, severity, message, error?.stack_trace ?? '']),
  }

  if (error) entry.error = error
  if (options.labels) entry.labels = options.labels
  if (options.context) entry.context = options.context
  if (options.fingerprint) entry.fingerprint = options.fingerprint

  return entry
}

// Fire-and-forget: never awaited, never throws, never blocks the render path.
// keepalive lets the request outlive a page unload.
export function send(entry) {
  const config = readConfig()
  if (!config.enabled || !config.url || !config.key) return false

  try {
    fetch(`${config.url}/v1/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.key,
      },
      body: JSON.stringify({ entries: [entry] }),
      keepalive: true,
    }).catch(() => {})
    return true
  } catch {
    // A failed log must never surface to the user.
    return false
  }
}

export function log(severity, message, options) {
  return send(buildEntry(severity, message, options))
}

export function logError(message, options) {
  return log('ERROR', message, options)
}
