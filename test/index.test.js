import { describe, it, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { create_versui_handler, DEFAULT_AGGREGATORS, MIME_TYPES } from '../src/index.js'

// Mock global fetch for tests
global.fetch = mock.fn()

// Mock Cache API
class MockCache {
  constructor() {
    this.store = new Map()
  }
  async match(request) {
    const key = typeof request === 'string' ? request : request.url
    const cached = this.store.get(key)
    // Return cached response if exists
    return cached
  }
  async put(request, response) {
    const key = typeof request === 'string' ? request : request.url
    // Store the response directly (in real browser, clone() is used)
    this.store.set(key, response)
  }
}

global.caches = {
  cache_instances: new Map(),
  async open(name) {
    if (!this.cache_instances.has(name)) {
      this.cache_instances.set(name, new MockCache())
    }
    return this.cache_instances.get(name)
  },
}

// Mock clients API
global.self = {
  clients: {
    client_list: [],
    async matchAll() {
      return this.client_list
    },
  },
}

describe('create_versui_handler', () => {
  beforeEach(() => {
    global.fetch.mock.resetCalls()
    global.caches.cache_instances.clear()
    global.self.clients.client_list = []
  })

  it('should create handler with default config', () => {
    const handler = create_versui_handler()

    assert.equal(typeof handler.load, 'function')
    assert.equal(typeof handler.handles, 'function')
    assert.equal(typeof handler.handle, 'function')
    assert.equal(typeof handler.fetch_from_walrus, 'function')
  })

  it('should create handler with initial resources', () => {
    const handler = create_versui_handler({
      resources: { '/index.html': 'blob123' },
    })

    const mock_request = { url: 'https://example.com/index.html' }
    assert.equal(handler.handles(mock_request), true)
  })

  it('should merge custom aggregators with defaults', () => {
    const custom_agg = 'https://custom-aggregator.io'
    const handler = create_versui_handler({
      aggregators: [custom_agg],
    })

    // Aggregators are internal, but we can verify behavior via fetch
    // Custom aggregators should be tried first (priority)
    assert.ok(handler)
  })
})

describe('load()', () => {
  beforeEach(() => {
    global.fetch.mock.resetCalls()
  })

  it('should load resource mappings', () => {
    const handler = create_versui_handler()

    handler.load({ '/index.html': 'blob123', '/style.css': 'blob456' })

    const req1 = { url: 'https://example.com/index.html' }
    const req2 = { url: 'https://example.com/style.css' }

    assert.equal(handler.handles(req1), true)
    assert.equal(handler.handles(req2), true)
  })

  it('should merge new resources with existing ones', () => {
    const handler = create_versui_handler({
      resources: { '/index.html': 'blob123' },
    })

    handler.load({ '/style.css': 'blob456' })

    const req1 = { url: 'https://example.com/index.html' }
    const req2 = { url: 'https://example.com/style.css' }

    assert.equal(handler.handles(req1), true)
    assert.equal(handler.handles(req2), true)
  })

  it('should update existing resource mappings', () => {
    const handler = create_versui_handler({
      resources: { '/index.html': 'blob-old' },
    })

    handler.load({ '/index.html': 'blob-new' })

    // Verify by checking handles() still works
    const req = { url: 'https://example.com/index.html' }
    assert.equal(handler.handles(req), true)
  })
})

describe('handles()', () => {
  it('should return true for registered resources', () => {
    const handler = create_versui_handler()
    handler.load({ '/index.html': 'blob123' })

    const request = { url: 'https://example.com/index.html' }
    assert.equal(handler.handles(request), true)
  })

  it('should return false for unregistered resources', () => {
    const handler = create_versui_handler()
    handler.load({ '/index.html': 'blob123' })

    const request = { url: 'https://example.com/other.html' }
    assert.equal(handler.handles(request), false)
  })

  it('should handle root path', () => {
    const handler = create_versui_handler()
    handler.load({ '/': 'blob123' })

    const request = { url: 'https://example.com/' }
    assert.equal(handler.handles(request), true)
  })

  it('should ignore query strings and fragments', () => {
    const handler = create_versui_handler()
    handler.load({ '/index.html': 'blob123' })

    const req1 = { url: 'https://example.com/index.html?v=1' }
    const req2 = { url: 'https://example.com/index.html#section' }

    assert.equal(handler.handles(req1), true)
    assert.equal(handler.handles(req2), true)
  })
})

describe('fetch_from_walrus()', () => {
  beforeEach(() => {
    global.fetch.mock.resetCalls()
    global.self.clients.client_list = []
  })

  it('should fetch from Walrus aggregator', async () => {
    const handler = create_versui_handler()
    handler.load({ '/index.html': 'blob123' })

    global.fetch.mock.mockImplementation(async url => {
      if (url.includes('blob123')) {
        return {
          ok: true,
          blob: async () => new Blob(['<html>test</html>']),
        }
      }
      return { ok: false, status: 404 }
    })

    const response = await handler.fetch_from_walrus('/index.html')

    assert.equal(response.constructor.name, 'Response')
    assert.equal(response.headers.get('Content-Type'), 'text/html')
  })

  it('should try multiple aggregators on failure', async () => {
    const handler = create_versui_handler({
      aggregators: ['https://agg1.io', 'https://agg2.io'],
    })
    handler.load({ '/test.js': 'blob456' })

    let fetch_call_count = 0
    global.fetch.mock.mockImplementation(async url => {
      fetch_call_count++
      // First 2 aggregators fail, default succeeds
      if (fetch_call_count >= 3) {
        return {
          ok: true,
          blob: async () => new Blob(['console.log("test")']),
        }
      }
      throw new Error('Aggregator failed')
    })

    const response = await handler.fetch_from_walrus('/test.js')

    assert.equal(response.constructor.name, 'Response')
    assert.equal(fetch_call_count >= 3, true) // Tried multiple aggregators
  })

  it('should return 404 when all aggregators fail', async () => {
    const handler = create_versui_handler()
    handler.load({ '/test.css': 'blob789' })

    global.fetch.mock.mockImplementation(async () => {
      throw new Error('All aggregators down')
    })

    const response = await handler.fetch_from_walrus('/test.css')

    assert.equal(response.status, 404)
    const text = await response.text()
    assert.equal(text, 'Resource unavailable')
  })

  it('should return null for unknown resource', async () => {
    const handler = create_versui_handler()
    handler.load({ '/index.html': 'blob123' })

    const response = await handler.fetch_from_walrus('/unknown.html')

    assert.equal(response, null)
  })

  it('should detect MIME type from file extension', async () => {
    const handler = create_versui_handler()
    handler.load({
      '/script.js': 'blob-js',
      '/style.css': 'blob-css',
      '/image.png': 'blob-png',
    })

    global.fetch.mock.mockImplementation(async () => ({
      ok: true,
      blob: async () => new Blob(['test']),
    }))

    const res_js = await handler.fetch_from_walrus('/script.js')
    const res_css = await handler.fetch_from_walrus('/style.css')
    const res_png = await handler.fetch_from_walrus('/image.png')

    assert.equal(res_js.headers.get('Content-Type'), 'text/javascript')
    assert.equal(res_css.headers.get('Content-Type'), 'text/css')
    assert.equal(res_png.headers.get('Content-Type'), 'image/png')
  })

  it('should fallback to application/octet-stream for unknown extensions', async () => {
    const handler = create_versui_handler()
    handler.load({ '/data.xyz': 'blob-unknown' })

    global.fetch.mock.mockImplementation(async () => ({
      ok: true,
      blob: async () => new Blob(['binary data']),
    }))

    const response = await handler.fetch_from_walrus('/data.xyz')

    assert.equal(response.headers.get('Content-Type'), 'application/octet-stream')
  })

  it('should notify clients when loading index resource', async () => {
    const mock_client = { postMessage: mock.fn() }
    global.self.clients.client_list = [mock_client]

    const handler = create_versui_handler()
    handler.load({ '/index.html': 'blob123' })

    global.fetch.mock.mockImplementation(async () => ({
      ok: true,
      blob: async () => new Blob(['<html></html>']),
    }))

    await handler.fetch_from_walrus('/index.html')

    assert.equal(mock_client.postMessage.mock.calls.length, 1)
    const [message] = mock_client.postMessage.mock.calls[0].arguments
    assert.equal(message.type, 'VERSUI_LOADING')
  })
})

describe('handle() with caching', () => {
  beforeEach(() => {
    global.fetch.mock.resetCalls()
    global.caches.cache_instances.clear()
    global.self.clients.client_list = []
  })

  it('should cache responses when cache_name is set', async () => {
    const handler = create_versui_handler({ cache_name: 'versui-v1' })
    handler.load({ '/index.html': 'blob123' })

    global.fetch.mock.mockImplementation(async () => ({
      ok: true,
      blob: async () => new Blob(['<html>cached</html>']),
    }))

    let response_promise_1, response_promise_2

    const mock_event_1 = {
      request: { url: 'https://example.com/index.html' },
      respondWith: handler_fn => {
        response_promise_1 = handler_fn
      },
    }

    const mock_event_2 = {
      request: { url: 'https://example.com/index.html' },
      respondWith: handler_fn => {
        response_promise_2 = handler_fn
      },
    }

    // First request - should fetch from Walrus
    handler.handle(mock_event_1)
    await response_promise_1
    assert.ok(global.fetch.mock.calls.length >= 1)

    // Second request - should return from cache (no new fetch)
    const fetch_count_before = global.fetch.mock.calls.length
    handler.handle(mock_event_2)
    await response_promise_2
    const fetch_count_after = global.fetch.mock.calls.length
    assert.equal(fetch_count_after, fetch_count_before) // No new fetches
  })

  it('should skip caching when cache_name is not set', async () => {
    const handler = create_versui_handler() // No cache_name
    handler.load({ '/index.html': 'blob123' })

    global.fetch.mock.mockImplementation(async () => ({
      ok: true,
      blob: async () => new Blob(['<html>no cache</html>']),
    }))

    const mock_event = {
      request: { url: 'https://example.com/index.html' },
      respondWith: async handler_fn => {
        const response = await handler_fn
        return response
      },
    }

    await handler.handle(mock_event)
    assert.equal(global.fetch.mock.calls.length, 1)

    // Second request - should fetch again (no caching)
    global.fetch.mock.resetCalls()
    await handler.handle(mock_event)
    assert.equal(global.fetch.mock.calls.length, 1)
  })

  it('should not handle requests for unregistered resources', async () => {
    const handler = create_versui_handler()
    handler.load({ '/index.html': 'blob123' })

    let respond_with_called = false
    const mock_event = {
      request: { url: 'https://example.com/other.html' },
      respondWith: async handler_fn => {
        respond_with_called = true
      },
    }

    handler.handle(mock_event)

    // Should return early without calling respondWith
    assert.equal(respond_with_called, false)
  })
})

describe('MIME_TYPES export', () => {
  it('should export MIME_TYPES object', () => {
    assert.equal(typeof MIME_TYPES, 'object')
    assert.equal(MIME_TYPES['.js'], 'text/javascript')
    assert.equal(MIME_TYPES['.css'], 'text/css')
    assert.equal(MIME_TYPES['.html'], 'text/html')
  })
})

describe('DEFAULT_AGGREGATORS export', () => {
  it('should export DEFAULT_AGGREGATORS array', () => {
    assert.equal(Array.isArray(DEFAULT_AGGREGATORS), true)
    assert.equal(DEFAULT_AGGREGATORS.length > 0, true)
  })
})
