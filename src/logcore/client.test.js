import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// The module reads its config once at import time, so stub the env first and
// re-import per test.
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_LOGCORE_ENABLED', 'true')
  vi.stubEnv('VITE_LOGCORE_URL', 'https://logcore.example')
  vi.stubEnv('VITE_LOGCORE_KEY', 'test-key')
  vi.stubEnv('VITE_LOGCORE_ENV', 'dev')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

test('posts an envelope with a flat entry', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)

  const { logError } = await import('./client.js')
  await logError('checkout failed', new Error('boom'))

  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://logcore.example/v1/logs')
  expect(init.headers['x-api-key']).toBe('test-key')

  const body = JSON.parse(init.body)
  expect(body.schema_version).toBe(1)

  const entry = body.entries[0]
  expect(entry.service).toBe('todo-frontend')
  expect(entry.env).toBe('dev')
  expect(entry.severity).toBe('ERROR')
  expect(entry.insert_id).toMatch(/^[0-9a-f]{64}$/)
  expect(entry.error.type).toBe('Error')
  // A browser has no GCP project; the gateway rejects the field when present.
  expect(entry).not.toHaveProperty('source_project')

  // Emit the real entry so it can be checked against the logcore schema.
  console.log('EMITTED_ENTRY ' + init.body)
})

test('a failing transport never rejects', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

  const { logError } = await import('./client.js')
  await expect(logError('boom', new Error('boom'))).resolves.toBe(false)
})

test('sends nothing when disabled', async () => {
  vi.stubEnv('VITE_LOGCORE_ENABLED', 'false')
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  const { logError } = await import('./client.js')
  await logError('boom', new Error('boom'))

  expect(fetchMock).not.toHaveBeenCalled()
})
