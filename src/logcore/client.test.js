import { beforeEach, describe, expect, it, vi } from 'vitest'

import { log, logError } from './client'
import { errorFrom, parseStack } from './parse-stack'

function capturePostedEntry() {
  const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }))
  vi.stubGlobal('fetch', fetchSpy)
  return () => {
    const [url, init] = fetchSpy.mock.calls.at(-1)
    return { url, init, entry: JSON.parse(init.body).entries[0] }
  }
}

describe('logcore client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the envelope the gateway expects', () => {
    const posted = capturePostedEntry()

    logError('checkout failed', new TypeError('undefined is not an object'))

    const { url, init } = posted()
    expect(url).toBe(`${import.meta.env.VITE_LOGCORE_URL}/v1/logs`)
    expect(init.headers['x-api-key']).toBe(import.meta.env.VITE_LOGCORE_KEY)
    // Un {"entries": [...]} pelado es un 422 por falta de schema_version.
    expect(JSON.parse(init.body).schema_version).toBe(1)
    // No puede bloquear la navegación ni perderse al descargarse la página.
    expect(init.keepalive).toBe(true)
  })

  it('keeps the entry flat and omits source_project', () => {
    const posted = capturePostedEntry()

    logError('boom', new Error('boom'))

    const { entry } = posted()
    expect(entry.service).toBe('todo-frontend')
    expect(entry.env).toBe('dev')
    // Presente pero vacío sería un 422: el navegador no corre en ningún GCP.
    expect(entry).not.toHaveProperty('source_project')
    expect(entry.timestamp).toMatch(/Z$/)
    // El esquema exige exactamente 32 dígitos hex.
    expect(entry.insert_id).toMatch(/^[0-9a-f]{32}$/)
  })

  it('reports a bad value with no exception to throw', () => {
    const posted = capturePostedEntry()

    log('ERROR', 'completed count does not match the list', {
      context: { counted: 0, expected: 3 },
      fingerprint: 'completed-count-mismatch',
    })

    const { entry } = posted()
    // Sin `error` sigue siendo una entrada válida: el fallo que da un número
    // equivocado no lanza, y ningún handler global puede verlo.
    expect(entry).not.toHaveProperty('error')
    expect(entry.context).toEqual({ counted: 0, expected: 3 })
    expect(entry.fingerprint).toBe('completed-count-mismatch')
  })

  it('never throws when the transport fails', () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))

    expect(() => logError('boom', new Error('boom'))).not.toThrow()
  })
})

describe('parse-stack', () => {
  it('parses V8 frames keeping line and column', () => {
    const frames = parseStack(
      [
        'TypeError: nope',
        '    at checkout (https://app.example.com/assets/index-a1b2c3.js:1:48213)',
        '    at https://app.example.com/assets/index-a1b2c3.js:1:9042',
        '    at run (https://app.example.com/node_modules/react-dom.js:1:10)',
      ].join('\n'),
    )

    expect(frames[0]).toEqual({
      function: 'checkout',
      file: 'https://app.example.com/assets/index-a1b2c3.js',
      line: 1,
      // Un bundle pone todo en la línea 1: sin columna no hay symbolication.
      column: 48213,
      inApp: true,
    })
    expect(frames[1].function).toBe('<anonymous>')
    expect(frames[2].inApp).toBe(false)
  })

  it('puts the root cause first and keeps the thrown error identity', () => {
    const root = new Error('connection reset')
    root.stack = 'Error: connection reset\n    at read (https://app/db.js:1:10)'
    const wrapper = new TypeError('could not load todos', { cause: root })
    wrapper.stack = 'TypeError: could not load todos\n    at load (https://app/api.js:1:20)'

    const error = errorFrom(wrapper)

    expect(error.type).toBe('TypeError')
    expect(error.message).toBe('could not load todos')
    // logcore agrupa por el primer frame inApp. Parando en el envoltorio, todo
    // lo que esa capa relanza colapsaría en un único issue.
    expect(error.stack[0].function).toBe('read')
    expect(error.stack.map((frame) => frame.function)).toContain('load')
  })

  it('never returns the raw stack string', () => {
    expect(Array.isArray(errorFrom(new Error('boom')).stack)).toBe(true)
    expect(errorFrom('not an error')).toEqual({
      type: 'UnknownError',
      message: 'not an error',
      stack: [],
    })
  })
})
