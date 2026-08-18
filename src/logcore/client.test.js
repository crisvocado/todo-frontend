import { describe, it, expect, vi, afterEach } from 'vitest'

import { buildEntry, log, logError, readConfig, sendEntry } from './client'

const CONFIG = {
  enabled: true,
  url: 'https://logcore.example.com',
  key: 'test-key',
  env: 'dev',
}

function entryWithError() {
  const root = new TypeError("Cannot read properties of undefined (reading 'total')")
  root.stack = [
    'TypeError: Cannot read properties of undefined',
    `    at checkout (${globalThis.location.origin}/assets/index-a1b2c3.js:1:48213)`,
    '    at <anonymous> (https://cdn.example.com/vendor.js:1:9042)',
  ].join('\n')
  return buildEntry({
    severity: 'ERROR',
    message: 'checkout failed',
    error: root,
    config: CONFIG,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// El contrato del módulo. El escenario de demo importa `log` y lo llama así;
// si un onboarding regenera el cliente con otra forma, falla aquí y no más
// tarde, en una rama que ya no aplica.
describe('el contrato del emisor', () => {
  it('expone log(severity, message, options) y logError(error, options)', () => {
    expect(log).toBeTypeOf('function')
    expect(log.length).toBe(2)
    expect(logError).toBeTypeOf('function')
    expect(logError.length).toBe(1)
  })

  it('emite sin excepción, con labels y fingerprint', () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const entry = buildEntry({
      severity: 'ERROR',
      message: 'Completed count mismatch',
      context: { reported: 2, actual: 0 },
      labels: { handler: 'stats-validation' },
      fingerprint: 'todo-frontend:completed-count-mismatch',
      config: CONFIG,
    })

    // Un bug que calcula mal no lanza: sin `error` la entrada sigue siendo
    // válida, y eso es lo que permite reportarlo.
    expect(entry.error).toBeUndefined()
    expect(entry.severity).toBe('ERROR')
    expect(entry.labels).toEqual({ handler: 'stats-validation' })
    expect(entry.fingerprint).toBe('todo-frontend:completed-count-mismatch')
    expect(entry.context).toEqual({ reported: 2, actual: 0 })
  })
})

describe('buildEntry', () => {
  it('keeps the identity fields at the top level', () => {
    const entry = entryWithError()
    expect(entry.service).toBe('todo-frontend')
    expect(entry.env).toBe('dev')
    expect(entry.severity).toBe('ERROR')
    expect(entry.timestamp).toMatch(/Z$/)
  })

  it('builds a 32-char hex insert_id', () => {
    expect(entryWithError().insert_id).toMatch(/^[0-9a-f]{32}$/)
  })

  it('omits source_project, which a browser does not have', () => {
    expect('source_project' in entryWithError()).toBe(false)
  })

  it('omits fingerprint unless one is asked for', () => {
    expect('fingerprint' in entryWithError()).toBe(false)
  })

  it('parses the stack into frames, innermost first', () => {
    const { stack } = entryWithError().error
    expect(stack[0]).toMatchObject({ function: 'checkout', line: 1, column: 48213, inApp: true })
    expect(stack[1].inApp).toBe(false)
  })

  it('puts the root cause first when the error is wrapped', () => {
    const root = new Error('socket hang up')
    root.stack = `Error: socket hang up\n    at read (${globalThis.location.origin}/assets/net.js:1:10)`
    const wrapper = new Error('no se pudo cargar la lista', { cause: root })
    wrapper.stack = `Error: no se pudo cargar la lista\n    at fetchTodos (${globalThis.location.origin}/assets/App.js:1:20)`

    const { error } = buildEntry({
      severity: 'ERROR',
      message: 'fetchTodos failed',
      error: wrapper,
      config: CONFIG,
    })

    expect(error.stack[0].function).toBe('read')
    // type y message son los del error que se lanzó, no los de la causa.
    expect(error.message).toBe('no se pudo cargar la lista')
  })
})

describe('sendEntry', () => {
  it('posts the entry inside a schema_version envelope', () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const entry = entryWithError()
    expect(sendEntry(entry, CONFIG)).toBe(true)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://logcore.example.com/v1/logs')
    expect(init.headers['x-api-key']).toBe('test-key')
    expect(JSON.parse(init.body)).toEqual({ schema_version: 1, entries: [entry] })
  })

  it('does nothing when logging is disabled', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(sendEntry(entryWithError(), { ...CONFIG, enabled: false })).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows a transport failure instead of propagating it', () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('network down')
    })

    expect(() => sendEntry(entryWithError(), CONFIG)).not.toThrow()
  })
})

describe('readConfig', () => {
  it('falls back to dev for an env outside the schema enum', () => {
    const config = readConfig({
      VITE_LOGCORE_ENABLED: 'true',
      VITE_LOGCORE_URL: 'https://logcore.example.com/',
      VITE_LOGCORE_KEY: 'k',
      VITE_LOGCORE_ENV: 'production',
    })
    expect(config.env).toBe('dev')
    expect(config.url).toBe('https://logcore.example.com')
  })
})
