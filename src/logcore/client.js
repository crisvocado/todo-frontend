// Logcore browser client.
//
// Entries are POSTed to the logcore gateway, which resolves this service's
// identity from the API key. That is why nothing here declares a service_id and
// why every field sits at the top level: this path never passes through Cloud
// Logging, so no key needs promoting into a `logging.googleapis.com/*` slot.

const LOGS_PATH = '/v1/logs'

// Read per call rather than at module load so the module stays exercisable with
// the environment stubbed, and so importing it never touches the network.
function readConfig() {
  const env = import.meta.env ?? {}
  return {
    endpoint: env.VITE_LOGCORE_ENDPOINT || '',
    apiKey: env.VITE_LOGCORE_KEY || '',
    service: env.VITE_LOGCORE_SERVICE || 'todo-frontend',
    environment: env.VITE_LOGCORE_ENV || 'dev',
    sourceProject: env.VITE_LOGCORE_SOURCE_PROJECT || '',
  }
}

function fnv1a(input, seed) {
  let hash = seed
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// Derived from the entry's own content instead of being random: a report that
// gets retried after a failed POST collapses into one record on the logcore
// side rather than inflating the issue count.
function insertId(entry) {
  const key = [
    entry.timestamp,
    entry.severity,
    entry.message,
    entry.error?.stack_trace ?? '',
  ].join('|')

  return [2166136261, 2166136289, 2166136309, 2166136337]
    .map((seed) => fnv1a(key, seed))
    .join('')
}

function normalizeError(error) {
  if (!error) return undefined
  if (!(error instanceof Error)) {
    return { type: typeof error, message: String(error) }
  }
  return {
    type: error.name,
    message: error.message,
    stack_trace: error.stack ?? '',
  }
}

export function buildEntry({
  severity = 'ERROR',
  message,
  error,
  context,
  labels,
  fingerprint,
  trace,
} = {}) {
  const config = readConfig()

  const entry = {
    timestamp: new Date().toISOString(),
    severity,
    message: message || 'Unknown error',
    service: config.service,
    env: config.environment,
    source_project: config.sourceProject,
  }

  const normalized = normalizeError(error)
  if (normalized) entry.error = normalized
  if (context) entry.context = context
  if (labels) entry.labels = labels
  if (fingerprint) entry.fingerprint = fingerprint
  if (trace) entry.trace = trace

  entry.insert_id = insertId(entry)

  return entry
}

// Fire-and-forget: never awaited, never throws, and `keepalive` lets the report
// outlive the page so an error thrown during unload still reaches logcore.
export function sendEntry(entry) {
  const config = readConfig()
  if (!config.endpoint || !config.apiKey) return false

  try {
    fetch(`${config.endpoint}${LOGS_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify({ entries: [entry] }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // A logging failure must never surface in the user's flow.
  }

  return true
}

export function logError(message, options = {}) {
  const entry = buildEntry({ ...options, message })
  sendEntry(entry)
  return entry
}

export function isLogcoreUrl(url) {
  const { endpoint } = readConfig()
  return Boolean(endpoint) && String(url).startsWith(`${endpoint}${LOGS_PATH}`)
}
