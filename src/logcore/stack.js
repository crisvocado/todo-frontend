function parseSingleErrorStack(error) {
  if (!error || typeof error !== 'object') {
    return []
  }

  const stackStr = error.stack
  if (!stackStr || typeof stackStr !== 'string') {
    return []
  }

  const lines = stackStr.split('\n')
  const frames = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Skip the error message line (e.g. "Error: something" or "TypeError: ...")
    if (
      line.startsWith(error.name || 'Error') ||
      line === error.message ||
      /^[a-zA-Z0-9_$]+Error:/.test(line)
    ) {
      continue
    }

    // Chrome / V8 format:
    // "at functionName (http://localhost/file.js:10:20)"
    // "at async functionName (http://localhost/file.js:10:20)"
    // "at http://localhost/file.js:10:20"
    // "at new Component (http://localhost/file.js:10:20)"
    const v8MatchWithParen = line.match(
      /^at (?:async )?(?:new )?(?:(.+?)\s+\((.+?)(?::(\d+))?(?::(\d+))?\)|(.+?)(?::(\d+))?(?::(\d+))?\))$/,
    )
    const v8MatchNoParen = line.match(/^at (?:async )?(.+?)(?::(\d+))?(?::(\d+))?$/)

    // Firefox / Safari format:
    // "functionName@http://localhost/file.js:10:20"
    // "@http://localhost/file.js:10:20"
    // "async*functionName@http://localhost/file.js:10:20"
    const ffMatch = line.match(/^(?:async\*)?(?:([^@]*)@)?(.+?)(?::(\d+))?(?::(\d+))?$/)

    let fnName = null
    let file = null
    let lineNum = null
    let colNum = null

    if (v8MatchWithParen && v8MatchWithParen[2]) {
      fnName = v8MatchWithParen[1] || '<anonymous>'
      file = v8MatchWithParen[2] || null
      lineNum = v8MatchWithParen[3] ? parseInt(v8MatchWithParen[3], 10) : null
      colNum = v8MatchWithParen[4] ? parseInt(v8MatchWithParen[4], 10) : null
    } else if (v8MatchNoParen) {
      fnName = '<anonymous>'
      file = v8MatchNoParen[1] || null
      lineNum = v8MatchNoParen[2] ? parseInt(v8MatchNoParen[2], 10) : null
      colNum = v8MatchNoParen[3] ? parseInt(v8MatchNoParen[3], 10) : null
    } else if (ffMatch && (ffMatch[1] !== undefined || line.includes('@'))) {
      fnName = ffMatch[1] || '<anonymous>'
      file = ffMatch[2] || null
      lineNum = ffMatch[3] ? parseInt(ffMatch[3], 10) : null
      colNum = ffMatch[4] ? parseInt(ffMatch[4], 10) : null
    }

    if (fnName || file) {
      const cleanFn = (fnName || '<anonymous>').slice(0, 256)
      const cleanFile = file ? file.slice(0, 1024) : null
      const inApp = cleanFile
        ? !cleanFile.includes('node_modules') &&
          !cleanFile.startsWith('node:') &&
          !cleanFile.includes('/@vite/') &&
          !cleanFile.includes('/vite/') &&
          !cleanFile.includes('cdn.') &&
          !cleanFile.startsWith('chrome-extension://') &&
          !cleanFile.startsWith('moz-extension://')
        : true

      frames.push({
        function: cleanFn,
        file: cleanFile,
        line: lineNum !== null && !isNaN(lineNum) && lineNum >= 0 ? lineNum : null,
        column: colNum !== null && !isNaN(colNum) && colNum >= 0 ? colNum : null,
        inApp,
      })

      if (frames.length >= 50) {
        break
      }
    }
  }

  return frames
}

export function parseStackTrace(error) {
  if (!error || typeof error !== 'object') {
    return null
  }

  // Follow error.cause to root: innermost / root first
  const chain = []
  let curr = error
  const visited = new Set()
  while (curr && !visited.has(curr)) {
    visited.add(curr)
    chain.push(curr)
    curr = curr.cause && typeof curr.cause === 'object' ? curr.cause : null
  }

  // Root is at the end of chain, so reverse it: [root, ..., wrapper, error]
  chain.reverse()

  const allFrames = []
  for (const err of chain) {
    const frames = parseSingleErrorStack(err)
    for (const f of frames) {
      allFrames.push(f)
      if (allFrames.length >= 50) {
        return allFrames
      }
    }
  }

  return allFrames.length > 0 ? allFrames : null
}

export function extractErrorInfo(err) {
  if (!err) return null

  if (err instanceof Error || (typeof err === 'object' && err.message)) {
    const errorObj = {
      type: (err.name || err.constructor?.name || 'Error').slice(0, 256),
      message: String(err.message || err.name || 'Error').slice(0, 65536),
    }

    const parsedStack = parseStackTrace(err)
    if (parsedStack && parsedStack.length > 0) {
      errorObj.stack = parsedStack
    }

    return errorObj
  }

  if (typeof err === 'string') {
    return {
      type: 'Error',
      message: err.slice(0, 65536),
    }
  }

  return null
}
