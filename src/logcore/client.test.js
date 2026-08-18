import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildEntry, sendEntry, logError } from './client'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('buildEntry', () => {
  it('emits every field the http transport requires at the top level', () => {
    const entry = buildEntry({ message: 'checkout failed' })

    for (const field of [
      'timestamp',
      'severity',
      'message',
      'service',
      'env',
      'source_project',
      'insert_id',
    ]) {
      expect(entry).toHaveProperty(field)
    }
    expect(entry.severity).toBe('ERROR')
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  })

  it('flattens an Error into type, message and stack_trace', () => {
    const entry = buildEntry({ message: 'boom', error: new TypeError('bad') })

    expect(entry.error.type).toBe('TypeError')
    expect(entry.error.message).toBe('bad')
    expect(entry.error.stack_trace).toContain('TypeError')
  })

  it('derives the same insert_id for an identical report', () => {
    vi.setSystemTime(new Date('2026-08-17T18:30:00.000Z'))
    const first = buildEntry({ message: 'boom' })
    const second = buildEntry({ message: 'boom' })

    expect(first.insert_id).toBe(second.insert_id)
    expect(buildEntry({ message: 'other' }).insert_id).not.toBe(first.insert_id)
  })
})

describe('sendEntry', () => {
  it('posts a single-entry batch with the api key header', () => {
    vi.stubEnv('VITE_LOGCORE_ENDPOINT', 'https://logcore.test')
    vi.stubEnv('VITE_LOGCORE_KEY', 'test-key')
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const entry = logError('checkout failed')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://logcore.test/v1/logs')
    expect(init.headers['x-api-key']).toBe('test-key')
    expect(init.keepalive).toBe(true)
    expect(JSON.parse(init.body)).toEqual({ entries: [entry] })
  })

  it('stays silent when the gateway is not configured', () => {
    vi.stubEnv('VITE_LOGCORE_ENDPOINT', '')
    vi.stubEnv('VITE_LOGCORE_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(sendEntry(buildEntry({ message: 'boom' }))).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never propagates a transport failure to the caller', () => {
    vi.stubEnv('VITE_LOGCORE_ENDPOINT', 'https://logcore.test')
    vi.stubEnv('VITE_LOGCORE_KEY', 'test-key')
    vi.stubGlobal('fetch', () => {
      throw new Error('offline')
    })

    expect(() => logError('boom')).not.toThrow()
  })
})
