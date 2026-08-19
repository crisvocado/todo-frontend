// Parsing of `error.stack` into the frame objects logcore expects. The raw
// string is rejected by the schema, and the log is lost with it.

const MAX_FRAMES = 50

// "    at fetchTodos (https://app/assets/index-a1b2.js:1:4821)" and the
// anonymous "    at https://app/assets/index-a1b2.js:1:4821".
const CHROME_FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/
// "fetchTodos@https://app/assets/index-a1b2.js:1:4821" — Firefox and Safari.
const SPIDERMONKEY_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/

function isInApp(file) {
  if (!file) return false
  if (file.includes('node_modules')) return false
  if (file.startsWith('node:')) return false
  if (/^\w+-extension:\/\//.test(file)) return false
  // Anything served from another origin is a CDN or a third-party script.
  const origin = typeof location === 'undefined' ? '' : location.origin
  return origin ? file.startsWith(origin) : true
}

export function parseStack(stack) {
  if (typeof stack !== 'string') return []

  const frames = []
  for (const line of stack.split('\n')) {
    const match = CHROME_FRAME.exec(line) || SPIDERMONKEY_FRAME.exec(line)
    if (!match) continue
    const [, fnName, file, lineNumber, column] = match
    frames.push({
      function: fnName || '<anonymous>',
      file,
      line: Number(lineNumber),
      // A production bundle puts every frame on line 1, so the column is the
      // only thing that locates the frame in the source map.
      column: Number(column),
      inApp: isInApp(file),
    })
  }
  // Already innermost first in every engine: the throw site is at index 0, and
  // logcore takes the first in-app frame as the issue's top location.
  return frames
}

function nameOf(error) {
  return error?.name || error?.constructor?.name || 'Error'
}

function messageOf(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return String(error?.message ?? error)
  } catch {
    return 'unknown error'
  }
}

export function buildError(error) {
  // `cause` is the JS exception chain. The wrapper's own stack stops at the
  // `throw`, so the line that actually broke is only in the root's.
  const chain = []
  const seen = new Set()
  let current = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = current.cause
  }
  if (chain.length === 0) chain.push(error)

  const frames = []
  // Root cause first, so the issue keys on where it actually broke rather than
  // on whichever layer re-threw.
  for (let i = chain.length - 1; i >= 0; i--) {
    const link = chain[i]
    if (frames.length > 0) {
      // A marker, not a real frame: it shows where one error ends and the next
      // begins, and inApp=false keeps it out of the fingerprint material.
      frames.push({
        function: `<raised ${nameOf(link)}: ${messageOf(link)}>`.slice(0, 256),
        inApp: false,
      })
    }
    frames.push(...parseStack(link?.stack))
  }

  return {
    type: nameOf(error),
    message: messageOf(error),
    stack: frames.slice(0, MAX_FRAMES),
  }
}
