// Cliente de logcore: construye la entrada y la envía al gateway.
// Nada de lo que hay aquí puede romper la app ni bloquear la navegación.

import { errorFromException } from './parse-stack'

const SERVICE = 'todo-frontend'

const VALID_ENVS = ['prod', 'staging', 'dev', 'test', 'local']

export function readConfig(env = import.meta.env) {
  const declaredEnv = env.VITE_LOGCORE_ENV
  return {
    enabled: env.VITE_LOGCORE_ENABLED === 'true',
    url: (env.VITE_LOGCORE_URL ?? '').replace(/\/+$/, ''),
    key: env.VITE_LOGCORE_KEY ?? '',
    env: VALID_ENVS.includes(declaredEnv) ? declaredEnv : 'dev',
  }
}

function hash32(input, seed) {
  let value = seed >>> 0
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value.toString(16).padStart(8, '0')
}

// El esquema exige exactamente 32 caracteres hex. Cuatro rondas FNV-1a con
// semillas distintas dan esos 32 sin depender de crypto.subtle, que es async y
// no sirve dentro de un handler de error.
function insertId(parts) {
  const raw = parts.join('|')
  return [0x811c9dc5, 0x01000193, 0xdeadbeef, 0x9e3779b9]
    .map((seed) => hash32(raw, seed))
    .join('')
}

export function buildEntry({
  severity,
  message,
  error,
  context,
  labels,
  fingerprint,
  config,
}) {
  const timestamp = new Date().toISOString()
  const parsed = error ? errorFromException(error) : null
  const topFrame = parsed?.stack?.[0] ?? {}

  const entry = {
    timestamp,
    severity,
    message,
    service: SERVICE,
    env: config.env,
    insert_id: insertId([
      timestamp,
      SERVICE,
      message,
      topFrame.file ?? '',
      topFrame.line ?? '',
      topFrame.column ?? '',
    ]),
  }
  // source_project se omite a propósito: el navegador no corre en ningún
  // proyecto de GCP y el esquema valida el campo si viene presente.
  if (parsed) entry.error = parsed
  if (context) entry.context = context
  if (labels) entry.labels = labels
  // Solo para agrupar a mano. Sin fingerprint, logcore lo deriva del mensaje y
  // del stack, que es lo que se quiere en el caso normal.
  if (fingerprint) entry.fingerprint = fingerprint
  return entry
}

export function sendEntry(entry, config = readConfig()) {
  if (!config.enabled || !config.url || !config.key) return false

  try {
    // keepalive: el envío tiene que sobrevivir a que la página se descargue.
    globalThis.fetch(`${config.url}/v1/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.key },
      body: JSON.stringify({ schema_version: 1, entries: [entry] }),
      keepalive: true,
    })?.catch?.(() => {})
    return true
  } catch {
    // Un fallo de transporte no puede propagarse al flujo del usuario.
    return false
  }
}

// Emite sin exigir una excepción: hay fallos que no lanzan y que solo se
// detectan comparando un valor contra el que debería ser.
export function log(severity, message, { error, context, labels, fingerprint } = {}) {
  const config = readConfig()
  if (!config.enabled) return null
  const entry = buildEntry({
    severity,
    message,
    error,
    context,
    labels,
    fingerprint,
    config,
  })
  sendEntry(entry, config)
  return entry
}

export function logError(error, { message, context, severity = 'ERROR' } = {}) {
  return log(severity, message ?? String(error?.message ?? error), {
    error,
    context,
  })
}
