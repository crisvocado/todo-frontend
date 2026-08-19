import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { buildEntry, createLogcoreClient } from './client.js'
import { buildError, parseStack } from './stack.js'
import { installGlobalHandlers } from './global-handlers.js'
import { installFetchLogging } from './fetch-instrumentation.js'
import ErrorBoundary from './ErrorBoundary.jsx'

const CONFIG = { url: 'https://logcore.test', apiKey: 'ablog_pub_test', env: 'dev' }

function clientWithSpy(overrides = {}) {
  const send = vi.fn()
  return { send, client: createLogcoreClient({ ...CONFIG, send, ...overrides }) }
}

describe('buildEntry', () => {
  it('keeps every field at the top level and omits source_project', () => {
    const entry = buildEntry('ERROR', 'checkout failed', {}, { env: 'dev' })

    expect(entry.service).toBe('todo-frontend')
    expect(entry.env).toBe('dev')
    // The browser runs in no GCP project, and an empty source_project is a 422.
    expect(entry).not.toHaveProperty('source_project')
    expect(entry).not.toHaveProperty('logging.googleapis.com/labels')
  })

  it('builds a 32-char hex insert_id', () => {
    const { insert_id: insertId } = buildEntry('ERROR', 'boom')

    expect(insertId).toMatch(/^[0-9a-f]{32}$/)
  })

  it('falls back to ERROR for a severity outside the enum', () => {
    expect(buildEntry('LOUD', 'boom').severity).toBe('ERROR')
  })

  it('carries context, labels and fingerprint when given', () => {
    const entry = buildEntry('WARNING', 'slow', {
      context: { todoId: 4 },
      labels: { area: 'list' },
      fingerprint: 'slow-list',
    })

    expect(entry.context).toEqual({ todoId: 4 })
    expect(entry.labels).toEqual({ area: 'list' })
    expect(entry.fingerprint).toBe('slow-list')
  })
})

describe('stack parsing', () => {
  it('parses V8 frames innermost first and keeps the column', () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading 'total')",
      '    at checkout (https://app.example.com/assets/index-a1b2c3.js:1:48213)',
      '    at https://app.example.com/assets/vendor.js:1:9042',
    ].join('\n')

    const frames = parseStack(stack)

    expect(frames[0]).toMatchObject({
      function: 'checkout',
      file: 'https://app.example.com/assets/index-a1b2c3.js',
      line: 1,
      column: 48213,
    })
    expect(frames[1].function).toBe('<anonymous>')
  })

  it('parses SpiderMonkey frames', () => {
    const frames = parseStack('fetchTodos@https://app.example.com/main.js:12:7')

    expect(frames[0]).toMatchObject({ function: 'fetchTodos', line: 12, column: 7 })
  })

  it('marks dependency frames as not inApp', () => {
    const frames = parseStack('    at render (https://app/node_modules/react/index.js:1:2)')

    expect(frames[0].inApp).toBe(false)
  })

  it('puts the root cause first and keeps the raised type', () => {
    const cause = new TypeError('row missing')
    const wrapper = new Error('could not load todos', { cause })

    const error = buildError(wrapper)

    // The wrapper's own stack stops at the throw; the root's is where it broke.
    expect(error.type).toBe('Error')
    expect(error.message).toBe('could not load todos')
    expect(error.stack.some((frame) => frame.function.startsWith('<raised '))).toBe(true)
    expect(error.stack.every((frame) => typeof frame === 'object')).toBe(true)
  })

  it('survives a thrown string', () => {
    expect(buildError('just a string')).toMatchObject({ message: 'just a string' })
  })
})

describe('createLogcoreClient', () => {
  it('posts the envelope with the schema version and the api key', () => {
    const { send, client } = clientWithSpy()

    client.log('ERROR', 'boom')

    const [url, apiKey, body] = send.mock.calls[0]
    expect(url).toBe('https://logcore.test/v1/logs')
    expect(apiKey).toBe('ablog_pub_test')
    // A bare { entries } is a 422.
    expect(body.schema_version).toBe(1)
    expect(body.entries).toHaveLength(1)
  })

  it('stays inactive without a url or a key, rather than posting nowhere', () => {
    const { send, client } = clientWithSpy({ url: undefined })

    client.log('ERROR', 'boom')

    expect(client.isActive()).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('never lets a transport failure reach the caller', () => {
    const { client } = clientWithSpy({
      send: () => Promise.reject(new Error('network down')),
    })

    expect(() => client.log('ERROR', 'boom')).not.toThrow()
  })

  it('never lets a synchronous transport failure reach the caller', () => {
    const { client } = clientWithSpy({
      send: () => {
        throw new Error('exploded')
      },
    })

    expect(() => client.log('ERROR', 'boom')).not.toThrow()
  })
})

describe('installGlobalHandlers', () => {
  it('reports an unhandled rejection and uninstalls cleanly', () => {
    const { send, client } = clientWithSpy()
    const uninstall = installGlobalHandlers(client)

    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: new Error('nope') }),
    )
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][2].entries[0].context.source).toBe('unhandledrejection')

    uninstall()
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: new Error('nope') }),
    )
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('installFetchLogging', () => {
  const scope = {}
  afterEach(() => {
    delete scope.fetch
  })

  it('reports a non-ok response without touching what the caller receives', async () => {
    const { send, client } = clientWithSpy()
    scope.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    installFetchLogging(client, { scope })

    const response = await scope.fetch('https://api.test/todos?token=secret')

    expect(response.status).toBe(500)
    const entry = send.mock.calls[0][2].entries[0]
    expect(entry.severity).toBe('WARNING')
    // Path only: a query string carries user input and sometimes tokens.
    expect(entry.context).toEqual({ method: 'GET', path: '/todos', status: 500 })
    expect(JSON.stringify(entry)).not.toContain('secret')
  })

  it('reports a network failure and rethrows the original error', async () => {
    const { send, client } = clientWithSpy()
    const failure = new TypeError('Failed to fetch')
    scope.fetch = vi.fn().mockRejectedValue(failure)
    installFetchLogging(client, { scope })

    await expect(scope.fetch('https://api.test/todos', { method: 'POST' })).rejects.toBe(
      failure,
    )
    expect(send.mock.calls[0][2].entries[0].severity).toBe('ERROR')
  })

  it('ignores its own delivery, so a failing gateway cannot recurse', async () => {
    const { send, client } = clientWithSpy()
    scope.fetch = vi.fn().mockRejectedValue(new Error('gateway down'))
    installFetchLogging(client, { scope, ignoreUrl: 'https://logcore.test' })

    await expect(scope.fetch('https://logcore.test/v1/logs')).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('restores the original fetch on uninstall', () => {
    const original = vi.fn()
    scope.fetch = original
    const uninstall = installFetchLogging(clientWithSpy().client, { scope })

    expect(scope.fetch).not.toBe(original)
    uninstall()
    expect(scope.fetch).toBe(original)
  })
})

describe('ErrorBoundary', () => {
  it('reports a render crash and shows the fallback instead of a blank page', () => {
    const { send, client } = clientWithSpy()
    const Boom = () => {
      throw new Error('render exploded')
    }
    // React logs the caught error itself; the noise is not the test's concern.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary client={client}>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(send.mock.calls[0][2].entries[0].error.message).toBe('render exploded')
    consoleError.mockRestore()
  })
})
