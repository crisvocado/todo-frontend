// Convierte el `stack` de un Error (una cadena) en la lista de frames que pide
// logcore. Un string en ese campo se rechaza y el log se pierde.

const CHROME_FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/
const FIREFOX_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)$/

const MAX_FRAMES = 50

function isInApp(file) {
  if (file.includes('/node_modules/')) return false
  // El bundle propio se sirve desde el mismo origen; lo de fuera es CDN o
  // extensión del navegador.
  return file.startsWith(globalThis.location?.origin ?? '')
}

function parseFrame(line) {
  const match = CHROME_FRAME.exec(line) || FIREFOX_FRAME.exec(line)
  if (!match) return null
  const [, fn, file, lineNumber, column] = match
  return {
    function: fn || '<anonymous>',
    file,
    line: Number(lineNumber),
    // Imprescindible: en un bundle de producción todo cae en la línea 1 y la
    // columna es lo único que sitúa el frame en el source map.
    column: Number(column),
    inApp: isInApp(file),
  }
}

export function parseStack(stack) {
  if (typeof stack !== 'string') return []
  // El orden nativo de JS ya es el que espera logcore: el sitio que lanzó
  // primero.
  return stack.split('\n').map(parseFrame).filter(Boolean)
}

export function errorFromException(error) {
  const chain = []
  const seen = new Set()
  let current = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = current.cause
  }

  const frames = []
  // La causa raíz va primero: logcore agrupa por el primer frame inApp, y si
  // se queda en el envoltorio todos los errores de esa capa caen en un mismo
  // issue.
  for (const link of chain.reverse()) {
    if (frames.length > 0) {
      // Marca de separación entre eslabones, no un frame real.
      frames.push({
        function: `<raised ${link.name ?? 'Error'}: ${link.message ?? ''}>`.slice(0, 256),
        inApp: false,
      })
    }
    frames.push(...parseStack(link.stack))
  }

  return {
    // type y message son los del error que se lanzó de verdad.
    type: error?.name ?? 'Error',
    message: String(error?.message ?? error),
    stack: frames.slice(0, MAX_FRAMES),
  }
}
