import { errorFrom } from './parse-stack'

const ENDPOINT_PATH = '/v1/logs'
const SCHEMA_VERSION = 1

const config = {
  enabled: import.meta.env.VITE_LOGCORE_ENABLED === 'true',
  url: import.meta.env.VITE_LOGCORE_URL,
  key: import.meta.env.VITE_LOGCORE_KEY,
  // Uno de: prod, staging, dev, test, local. El gateway rechaza cualquier otro.
  env: import.meta.env.VITE_LOGCORE_ENV || 'dev',
  service: 'todo-frontend',
}

// FNV-1a en cuatro pasadas con offsets distintos: 4 x 8 dígitos hex = los 32
// caracteres que exige insert_id. Síncrono a propósito —crypto.subtle es
// asíncrono y esto va en el camino de un handler de error, donde la página
// puede estar a punto de descargarse.
const FNV_OFFSETS = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]

function insertId(raw) {
  return FNV_OFFSETS.map((offset) => {
    let hash = offset
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
  }).join('')
}

function buildEntry(severity, message, { error, context, labels, fingerprint } = {}) {
  const timestamp = new Date().toISOString()
  const parsedError = error === undefined || error === null ? null : errorFrom(error)
  // El frame que lanzó (el 0), no la pila entera: identifica el error y se
  // mantiene estable frente a los frames que cambian en cada render.
  const [top = {}] = parsedError?.stack ?? []
  const entry = {
    timestamp,
    severity,
    message,
    // Este transporte no pasa por Cloud Logging: los campos van planos.
    service: config.service,
    env: config.env,
    insert_id: insertId(
      `${timestamp}${config.service}${message}${top.file ?? ''}${top.line ?? ''}${top.column ?? ''}`,
    ),
  }
  // source_project se omite: el navegador no corre en ningún proyecto GCP y el
  // esquema valida el campo como id de proyecto en cuanto está presente, así
  // que mandar "" sería un 422 mientras que ausente se acepta.
  if (parsedError) entry.error = parsedError
  if (context) entry.context = context
  if (labels) entry.labels = labels
  if (fingerprint) entry.fingerprint = fingerprint
  return entry
}

function send(entry) {
  // keepalive para que la petición sobreviva a la navegación: el error que más
  // importa suele ser el último antes de que la página se descargue.
  // sendBeacon no sirve aquí porque no admite la cabecera x-api-key.
  return fetch(`${config.url}${ENDPOINT_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.key },
    body: JSON.stringify({ schema_version: SCHEMA_VERSION, entries: [entry] }),
    keepalive: true,
  })
}

/**
 * Reporta un evento a logcore. Nunca lanza ni bloquea: un log que no se puede
 * entregar no puede romper la aplicación.
 *
 * Existe sin `error` a propósito. Los fallos que más duelen no lanzan —un
 * contador que da un número equivocado no dispara ningún handler global— y la
 * app es lo único capaz de reportarlos.
 */
export function log(severity, message, options) {
  if (!config.enabled || !config.url || !config.key) return
  try {
    send(buildEntry(severity, message, options))?.catch(() => {})
  } catch {
    // Ignorado: reportar el fallo del reporte no lleva a ninguna parte.
  }
}

export function logError(message, error, options) {
  log('ERROR', message, { ...options, error })
}

// Expuesto para poder verificar la forma del payload sin tocar la red.
export const __testing = { buildEntry, config }
