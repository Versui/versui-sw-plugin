import { describe, test, beforeEach, mock } from 'node:test'
import assert from 'node:assert'

import { create_versui_handler, MIME_TYPES } from '../src/index.js'

// ============================================================================
// MIME_TYPES constant
// ============================================================================

describe('MIME_TYPES', () => {
  test('contains common web asset mappings', () => {
    assert.strictEqual(MIME_TYPES['.html'], 'text/html')
    assert.strictEqual(MIME_TYPES['.js'], 'text/javascript')
    assert.strictEqual(MIME_TYPES['.mjs'], 'text/javascript')
    assert.strictEqual(MIME_TYPES['.css'], 'text/css')
    assert.strictEqual(MIME_TYPES['.json'], 'application/json')
    assert.strictEqual(MIME_TYPES['.svg'], 'image/svg+xml')
    assert.strictEqual(MIME_TYPES['.png'], 'image/png')
    assert.strictEqual(MIME_TYPES['.jpg'], 'image/jpeg')
    assert.strictEqual(MIME_TYPES['.jpeg'], 'image/jpeg')
    assert.strictEqual(MIME_TYPES['.gif'], 'image/gif')
    assert.strictEqual(MIME_TYPES['.webp'], 'image/webp')
    assert.strictEqual(MIME_TYPES['.ico'], 'image/x-icon')
    assert.strictEqual(MIME_TYPES['.woff'], 'font/woff')
    assert.strictEqual(MIME_TYPES['.woff2'], 'font/woff2')
    assert.strictEqual(MIME_TYPES['.ttf'], 'font/ttf')
    assert.strictEqual(MIME_TYPES['.wasm'], 'application/wasm')
    assert.strictEqual(MIME_TYPES['.txt'], 'text/plain')
    assert.strictEqual(MIME_TYPES['.xml'], 'application/xml')
  })
})

// ============================================================================
// create_versui_handler factory
// ============================================================================

describe('create_versui_handler', () => {
  test('returns object with load, handles, handle, fetch_from_walrus methods', () => {
    const handler = create_versui_handler()

    assert.strictEqual(typeof handler.load, 'function')
    assert.strictEqual(typeof handler.handles, 'function')
    assert.strictEqual(typeof handler.handle, 'function')
    assert.strictEqual(typeof handler.fetch_from_walrus, 'function')
  })
})

// ============================================================================
// load() method
// ============================================================================

describe('load()', () => {
  let handler

  beforeEach(() => {
    handler = create_versui_handler()
  })

  test('throws if aggregators is empty array', () => {
    assert.throws(
      () => handler.load({ resources: {}, aggregators: [] }),
      { message: 'load() requires non-empty aggregators array' }
    )
  })

  test('throws if aggregators is not an array', () => {
    assert.throws(
      () => handler.load({ resources: {}, aggregators: 'not-array' }),
      { message: 'load() requires non-empty aggregators array' }
    )
  })

  test('throws if aggregators is undefined', () => {
    assert.throws(
      () => handler.load({ resources: {} }),
      { message: 'load() requires non-empty aggregators array' }
    )
  })

  test('throws if resources is not an object', () => {
    assert.throws(
      () => handler.load({ resources: 'not-object', aggregators: ['https://example.com'] }),
      { message: 'load() requires resources object' }
    )
  })

  test('throws if resources is undefined', () => {
    assert.throws(
      () => handler.load({ aggregators: ['https://example.com'] }),
      { message: 'load() requires resources object' }
    )
  })

  test('throws if resources is null', () => {
    assert.throws(
      () => handler.load({ resources: null, aggregators: ['https://example.com'] }),
      { message: 'load() requires resources object' }
    )
  })

  test('throws if resources is an array', () => {
    assert.throws(
      () => handler.load({ resources: [], aggregators: ['https://example.com'] }),
      { message: 'load() requires resources object' }
    )
  })

  test('throws if any aggregator URL is invalid', () => {
    assert.throws(
      () => handler.load({ resources: {}, aggregators: ['not-a-valid-url'] }),
      { message: 'Invalid aggregator URL: not-a-valid-url' }
    )
  })

  test('throws on invalid URL in middle of array', () => {
    assert.throws(
      () => handler.load({
        resources: {},
        aggregators: ['https://valid.com', 'invalid', 'https://also-valid.com']
      }),
      { message: 'Invalid aggregator URL: invalid' }
    )
  })

  test('accepts empty resources object', () => {
    assert.doesNotThrow(() => {
      handler.load({ resources: {}, aggregators: ['https://example.com'] })
    })
  })

  test('stores resources and makes them available via handles()', () => {
    handler.load({
      resources: { '/index.html': 'abc123', '/app.js': 'def456' },
      aggregators: ['https://example.com']
    })

    assert.strictEqual(handler.handles({ url: 'https://site.com/index.html' }), true)
    assert.strictEqual(handler.handles({ url: 'https://site.com/app.js' }), true)
    assert.strictEqual(handler.handles({ url: 'https://site.com/missing.js' }), false)
  })

  test('normalizes resource paths (ensures leading slash)', () => {
    handler.load({
      resources: { 'app.js': 'abc123' },
      aggregators: ['https://example.com']
    })

    assert.strictEqual(handler.handles({ url: 'https://site.com/app.js' }), true)
  })

  test('trims trailing slashes from aggregators', () => {
    // This is internal - we verify via behavior in fetch tests
    assert.doesNotThrow(() => {
      handler.load({
        resources: { '/index.html': 'abc123' },
        aggregators: ['https://example.com/', 'https://backup.com/']
      })
    })
  })
})

// ============================================================================
// handles() method
// ============================================================================

describe('handles()', () => {
  let handler

  beforeEach(() => {
    handler = create_versui_handler()
  })

  test('returns false before load() is called', () => {
    assert.strictEqual(handler.handles({ url: 'https://site.com/index.html' }), false)
  })

  test('returns true for loaded paths', () => {
    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://example.com']
    })

    assert.strictEqual(handler.handles({ url: 'https://site.com/index.html' }), true)
  })

  test('returns false for unknown paths', () => {
    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://example.com']
    })

    assert.strictEqual(handler.handles({ url: 'https://site.com/other.html' }), false)
  })

  test('normalizes request URL - strips query string', () => {
    handler.load({
      resources: { '/app.js': 'abc123' },
      aggregators: ['https://example.com']
    })

    assert.strictEqual(handler.handles({ url: 'https://site.com/app.js?v=123' }), true)
    assert.strictEqual(handler.handles({ url: 'https://site.com/app.js?foo=bar&baz=qux' }), true)
  })

  test('normalizes request URL - strips trailing slash', () => {
    handler.load({
      resources: { '/about': 'abc123' },
      aggregators: ['https://example.com']
    })

    assert.strictEqual(handler.handles({ url: 'https://site.com/about/' }), true)
  })

  test('handles root path correctly (does not strip trailing slash from root)', () => {
    handler.load({
      resources: { '/': 'abc123' },
      aggregators: ['https://example.com']
    })

    assert.strictEqual(handler.handles({ url: 'https://site.com/' }), true)
  })

  test('is case sensitive', () => {
    handler.load({
      resources: { '/App.js': 'abc123' },
      aggregators: ['https://example.com']
    })

    assert.strictEqual(handler.handles({ url: 'https://site.com/App.js' }), true)
    assert.strictEqual(handler.handles({ url: 'https://site.com/app.js' }), false)
  })
})

// ============================================================================
// handle() method
// ============================================================================

describe('handle()', () => {
  let handler
  let mock_fetch
  let mock_clients
  let posted_messages

  beforeEach(() => {
    handler = create_versui_handler()
    posted_messages = []

    // Mock self.clients
    mock_clients = {
      matchAll: mock.fn(async () => [
        { postMessage: msg => posted_messages.push(msg) }
      ])
    }

    // Mock fetch
    mock_fetch = mock.fn(async () => new Response('test content', { status: 200 }))

    // Inject mocks via globalThis for Service Worker environment simulation
    globalThis.self = { clients: mock_clients }
    globalThis.fetch = mock_fetch
  })

  test('throws synchronously if called before load()', () => {
    const event = { request: { url: 'https://site.com/index.html' } }

    assert.throws(
      () => handler.handle(event),
      { message: 'Handler not initialized - call load() first' }
    )
  })

  test('does NOT send VERSUI_ERROR when throwing due to missing init', () => {
    const event = { request: { url: 'https://site.com/index.html' } }

    try {
      handler.handle(event)
    } catch {
      // Expected
    }

    assert.strictEqual(posted_messages.length, 0)
  })

  test('sends VERSUI_LOADING notification with path', async () => {
    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://example.com']
    })

    const event = { request: { url: 'https://site.com/index.html' } }
    await handler.handle(event)

    const loading_msg = posted_messages.find(m => m.type === 'VERSUI_LOADING')
    assert.ok(loading_msg, 'VERSUI_LOADING message should be sent')
    assert.strictEqual(loading_msg.path, '/index.html')
  })

  test('returns response with correct MIME type', async () => {
    handler.load({
      resources: { '/app.js': 'abc123' },
      aggregators: ['https://example.com']
    })

    const event = { request: { url: 'https://site.com/app.js' } }
    const response = await handler.handle(event)

    assert.strictEqual(response.headers.get('Content-Type'), 'text/javascript')
  })

  test('returns response with status 200', async () => {
    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://example.com']
    })

    const event = { request: { url: 'https://site.com/index.html' } }
    const response = await handler.handle(event)

    assert.strictEqual(response.status, 200)
  })

  test('constructs correct aggregator URL', async () => {
    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://example.com']
    })

    const event = { request: { url: 'https://site.com/index.html' } }
    await handler.handle(event)

    const { calls } = mock_fetch.mock
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].arguments[0], 'https://example.com/v1/blobs/abc123')
  })

  test('trims trailing slash from aggregator when constructing URL', async () => {
    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://example.com/']
    })

    const event = { request: { url: 'https://site.com/index.html' } }
    await handler.handle(event)

    const { calls } = mock_fetch.mock
    assert.strictEqual(calls[0].arguments[0], 'https://example.com/v1/blobs/abc123')
  })

  test('sends VERSUI_SUCCESS only on first successful fetch after load()', async () => {
    handler.load({
      resources: { '/index.html': 'abc123', '/app.js': 'def456' },
      aggregators: ['https://example.com']
    })

    // First fetch
    await handler.handle({ request: { url: 'https://site.com/index.html' } })

    const success_messages_1 = posted_messages.filter(m => m.type === 'VERSUI_SUCCESS')
    assert.strictEqual(success_messages_1.length, 1)

    // Second fetch
    await handler.handle({ request: { url: 'https://site.com/app.js' } })

    const success_messages_2 = posted_messages.filter(m => m.type === 'VERSUI_SUCCESS')
    assert.strictEqual(success_messages_2.length, 1, 'Should still be only 1 VERSUI_SUCCESS')
  })

  test('resets success_notified flag on new load()', async () => {
    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://example.com']
    })

    await handler.handle({ request: { url: 'https://site.com/index.html' } })

    // Reload with new resources
    handler.load({
      resources: { '/index.html': 'new123' },
      aggregators: ['https://example.com']
    })

    posted_messages = []

    await handler.handle({ request: { url: 'https://site.com/index.html' } })

    const success_messages = posted_messages.filter(m => m.type === 'VERSUI_SUCCESS')
    assert.strictEqual(success_messages.length, 1, 'Should send VERSUI_SUCCESS again after reload')
  })

  test('falls back through aggregators on failure', async () => {
    let call_count = 0
    mock_fetch = mock.fn(async (url) => {
      call_count++
      if (url.includes('first.com')) {
        return new Response('', { status: 500 })
      }
      return new Response('success', { status: 200 })
    })
    globalThis.fetch = mock_fetch

    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://first.com', 'https://second.com']
    })

    const response = await handler.handle({ request: { url: 'https://site.com/index.html' } })

    assert.strictEqual(call_count, 2)
    assert.strictEqual(response.status, 200)
  })

  test('sends VERSUI_ERROR when all aggregators fail', async () => {
    mock_fetch = mock.fn(async () => new Response('', { status: 500 }))
    globalThis.fetch = mock_fetch

    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://first.com', 'https://second.com']
    })

    await handler.handle({ request: { url: 'https://site.com/index.html' } })

    const error_msg = posted_messages.find(m => m.type === 'VERSUI_ERROR')
    assert.ok(error_msg, 'VERSUI_ERROR message should be sent')
    assert.ok(error_msg.error, 'Should contain error message')
  })

  test('returns 502 Bad Gateway when all aggregators fail', async () => {
    mock_fetch = mock.fn(async () => new Response('', { status: 500 }))
    globalThis.fetch = mock_fetch

    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://first.com']
    })

    const response = await handler.handle({ request: { url: 'https://site.com/index.html' } })

    assert.strictEqual(response.status, 502)
    assert.strictEqual(response.statusText, 'Bad Gateway')
    assert.strictEqual(response.headers.get('Content-Type'), 'text/plain')
  })

  test('handles fetch timeout (5s per aggregator)', async () => {
    mock_fetch = mock.fn(async (url, options) => {
      // Simulate slow response - will be aborted
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve(new Response('slow', { status: 200 })), 10000)
        options?.signal?.addEventListener('abort', () => {
          clearTimeout(timeout)
          reject(new Error('Aborted'))
        })
      })
    })
    globalThis.fetch = mock_fetch

    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://slow.com']
    })

    const start = Date.now()
    const response = await handler.handle({ request: { url: 'https://site.com/index.html' } })
    const duration = Date.now() - start

    // Should timeout around 5s (with some tolerance)
    assert.ok(duration < 6000, `Should timeout around 5s, took ${duration}ms`)
    assert.strictEqual(response.status, 502)
  })

  test('uses default MIME type for unknown extensions', async () => {
    handler.load({
      resources: { '/data.xyz': 'abc123' },
      aggregators: ['https://example.com']
    })

    const event = { request: { url: 'https://site.com/data.xyz' } }
    const response = await handler.handle(event)

    assert.strictEqual(response.headers.get('Content-Type'), 'application/octet-stream')
  })

  test('normalizes path from request URL', async () => {
    handler.load({
      resources: { '/app.js': 'abc123' },
      aggregators: ['https://example.com']
    })

    // With query string
    const event = { request: { url: 'https://site.com/app.js?v=123' } }
    const response = await handler.handle(event)

    assert.strictEqual(response.status, 200)
  })
})

// ============================================================================
// fetch_from_walrus() method
// ============================================================================

describe('fetch_from_walrus()', () => {
  let handler
  let mock_fetch
  let mock_clients
  let posted_messages

  beforeEach(() => {
    handler = create_versui_handler()
    posted_messages = []

    mock_clients = {
      matchAll: mock.fn(async () => [
        { postMessage: msg => posted_messages.push(msg) }
      ])
    }

    mock_fetch = mock.fn(async () => new Response('test content', { status: 200 }))

    globalThis.self = { clients: mock_clients }
    globalThis.fetch = mock_fetch
  })

  test('throws if not initialized', async () => {
    await assert.rejects(
      () => handler.fetch_from_walrus('/index.html'),
      { message: 'Handler not initialized - call load() first' }
    )
  })

  test('throws if path not in resources', async () => {
    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://example.com']
    })

    await assert.rejects(
      () => handler.fetch_from_walrus('/missing.html'),
      { message: 'Resource not found: /missing.html' }
    )
  })

  test('returns response without sending notifications', async () => {
    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://example.com']
    })

    const response = await handler.fetch_from_walrus('/index.html')

    assert.strictEqual(response.status, 200)
    assert.strictEqual(posted_messages.length, 0, 'Should not send any notifications')
  })

  test('normalizes path before lookup', async () => {
    handler.load({
      resources: { '/app.js': 'abc123' },
      aggregators: ['https://example.com']
    })

    // With query string
    const response = await handler.fetch_from_walrus('/app.js?v=123')

    assert.strictEqual(response.status, 200)
  })

  test('throws when all aggregators fail', async () => {
    mock_fetch = mock.fn(async () => new Response('', { status: 500 }))
    globalThis.fetch = mock_fetch

    handler.load({
      resources: { '/index.html': 'abc123' },
      aggregators: ['https://first.com']
    })

    await assert.rejects(
      () => handler.fetch_from_walrus('/index.html'),
      /500/
    )
  })
})
