// Dependencias: los frames que salen de aquí se marcan inApp=false para separar
// el código de la app del de sus librerías.
const VENDOR_MARKERS = ['/node_modules/', '/vendor', 'node:']

const MAX_FRAMES = 50

// Chrome/Edge: "    at fn (https://host/assets/index-a1b2.js:1:48213)" y también
// la variante sin nombre de función: "    at https://host/file.js:1:42".
const V8_FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/
// Firefox/Safari: "fn@https://host/file.js:1:48213"
const SPIDERMONKEY_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)$/

function frameFrom(match) {
  const [, rawFunction, file, line, column] = match
  return {
    function: rawFunction?.trim() || '<anonymous>',
    file,
    line: Number(line),
    // Un bundle de producción pone cada frame en la línea 1, así que la
    // columna es lo único que lo localiza en el source map.
    column: Number(column),
    inApp: !VENDOR_MARKERS.some((marker) => file.includes(marker)),
  }
}

/**
 * Convierte el `stack` de un Error en la lista de frames parseados que exige
 * logcore. Una cadena en bruto se rechaza y la entrada se pierde entera.
 *
 * El orden se respeta tal cual: en JS el stack ya viene con el punto que lanzó
 * primero, que es de donde logcore saca la ubicación del issue.
 */
export function parseStack(stack) {
  if (typeof stack !== 'string') return []
  return stack
    .split('\n')
    .map((line) => V8_FRAME.exec(line) || SPIDERMONKEY_FRAME.exec(line))
    .filter(Boolean)
    .map(frameFrom)
    .slice(0, MAX_FRAMES)
}

/**
 * Construye el objeto `error` a partir de un valor lanzado, siguiendo la cadena
 * de `cause` hasta la raíz. Una capa que envuelve el error de otra es normal, y
 * el stack del envoltorio termina en el `throw`: la línea que rompió no está.
 */
export function errorFrom(thrown) {
  if (!(thrown instanceof Error)) {
    return { type: 'UnknownError', message: String(thrown), stack: [] }
  }

  const chain = []
  const seen = new Set()
  let current = thrown
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = current.cause
  }

  const frames = []
  // La causa raíz PRIMERO: el issue debe agrupar por donde se rompió, no por
  // la capa que lo relanzó. Al truncar a 50 la raíz se conserva.
  for (const link of chain.reverse()) {
    if (frames.length) {
      // Marca, no un frame real: file, line y column son opcionales. Con
      // inApp=false no entra en el fingerprint pero sí muestra dónde termina
      // un error y empieza el siguiente.
      frames.push({
        function: `<caused ${link.name}: ${link.message}>`.slice(0, 256),
        inApp: false,
      })
    }
    frames.push(...parseStack(link.stack))
  }

  // type y message son los del error realmente lanzado: es lo que vio la app.
  return {
    type: thrown.name || 'Error',
    message: thrown.message,
    stack: frames.slice(0, MAX_FRAMES),
  }
}
