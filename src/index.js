/**
 * @versui/sw-plugin
 * Service Worker plugin for fetching assets from Walrus decentralized storage.
 */

// ============================================================================
// Constants
// ============================================================================

export const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
}

// ============================================================================
// Internal Helpers (Pure)
// ============================================================================

/**
 * Normalize path for consistent lookups.
 * - Strips query strings
 * - Strips trailing slashes (except root)
 * - Ensures leading slash
 * @param {string} url_or_path
 * @returns {string}
 */
const normalize_path = url_or_path => {
  // If full URL, extract pathname (URL handles query string automatically)
  if (url_or_path.startsWith('http')) {
    const { pathname } = new URL(url_or_path)
    // Strip trailing slash (except root)
    if (pathname.length > 1 && pathname.endsWith('/')) {
      return pathname.slice(0, -1)
    }
    return pathname
  }

  // For non-URL paths, manually strip query string
  let normalized = url_or_path
  const query_index = normalized.indexOf('?')
  if (query_index !== -1) {
    normalized = normalized.slice(0, query_index)
  }

  // Ensure leading slash
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized
  }

  // Strip trailing slash (except root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  return normalized
}

/**
 * Get MIME type from file path.
 * @param {string} path
 * @returns {string}
 */
const get_mime_type = path => {
  const dot_index = path.lastIndexOf('.')
  if (dot_index === -1) return 'application/octet-stream'

  const extension = path.slice(dot_index).toLowerCase()
  return MIME_TYPES[extension] ?? 'application/octet-stream'
}

/**
 * Trim trailing slash from URL.
 * @param {string} url
 * @returns {string}
 */
const trim_trailing_slash = url =>
  url.endsWith('/') ? url.slice(0, -1) : url

// ============================================================================
// Internal Helpers (I/O)
// ============================================================================

/**
 * Send message to all clients via postMessage.
 * @param {object} message
 * @returns {Promise<void>}
 */
const notify_clients = async message => {
  const clients = await self.clients.matchAll()
  clients.forEach(client => client.postMessage(message))
}

/**
 * Try aggregators sequentially with 5s timeout each.
 * @param {string} quilt_patch_id
 * @param {string[]} aggregators - URLs with trailing slashes already trimmed
 * @returns {Promise<Response>}
 * @throws {Error} - If all aggregators fail
 */
const try_aggregators = async (quilt_patch_id, aggregators) => {
  let last_error

  for (const aggregator of aggregators) {
    const controller = new AbortController()
    const timeout_id = setTimeout(() => controller.abort(), 5000)

    try {
      const url = `${aggregator}/v1/blobs/${quilt_patch_id}`
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout_id)

      if (response.ok) return response

      last_error = new Error(`${aggregator}: ${response.status}`)
    } catch (error) {
      clearTimeout(timeout_id)
      last_error = error
    }
  }

  throw last_error
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Versui handler instance.
 * @returns {VersuiHandler}
 */
export function create_versui_handler() {
  // Instance state (closure-scoped)
  let resources = new Map()
  let aggregators = []
  let success_notified = false

  /**
   * Load resources and aggregators from bootstrap message.
   * @param {object} data
   * @param {Record<string, string>} data.resources - Map of path to quilt_patch_id
   * @param {string[]} data.aggregators - Ordered list of aggregator URLs
   */
  const load = ({ resources: res, aggregators: agg }) => {
    // Validate aggregators
    if (!Array.isArray(agg) || agg.length === 0) {
      throw new Error('load() requires non-empty aggregators array')
    }

    // Validate resources
    if (res === null || typeof res !== 'object' || Array.isArray(res)) {
      throw new Error('load() requires resources object')
    }

    // Validate each aggregator URL
    for (const url of agg) {
      try {
        new URL(url)
      } catch {
        throw new Error(`Invalid aggregator URL: ${url}`)
      }
    }

    // Clear and store resources with normalized paths
    resources = new Map()
    for (const [path, id] of Object.entries(res)) {
      resources.set(normalize_path(path), id)
    }

    // Store aggregators with trailing slashes trimmed
    aggregators = agg.map(trim_trailing_slash)

    // Reset success notification flag
    success_notified = false
  }

  /**
   * Check if handler should process this request.
   * @param {Request} request
   * @returns {boolean}
   */
  const handles = request => {
    const normalized = normalize_path(request.url)
    return resources.has(normalized)
  }

  /**
   * Handle fetch event, return Response from Walrus.
   * @param {FetchEvent} event
   * @returns {Promise<Response>}
   * @throws {Error} - Synchronously if not initialized
   */
  const handle = event => {
    // Guard: throw sync if not initialized
    if (aggregators.length === 0) {
      throw new Error('Handler not initialized - call load() first')
    }

    // Return async handling
    return (async () => {
      const path = normalize_path(event.request.url)
      const quilt_patch_id = resources.get(path)

      // Notify loading start
      await notify_clients({ type: 'VERSUI_LOADING', path })

      try {
        const response = await try_aggregators(quilt_patch_id, aggregators)

        // Notify first success
        if (!success_notified) {
          await notify_clients({ type: 'VERSUI_SUCCESS' })
          success_notified = true
        }

        // Return response with correct MIME type
        return new Response(response.body, {
          status: 200,
          headers: { 'Content-Type': get_mime_type(path) }
        })
      } catch (error) {
        // Notify error
        await notify_clients({ type: 'VERSUI_ERROR', error: error.message })

        // Return 502
        return new Response('Walrus fetch failed', {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'Content-Type': 'text/plain' }
        })
      }
    })()
  }

  /**
   * Direct fetch helper (no notifications).
   * @param {string} path
   * @returns {Promise<Response>}
   * @throws {Error} - If not initialized or path not found
   */
  const fetch_from_walrus = async path => {
    // Guard: throw if not initialized
    if (aggregators.length === 0) {
      throw new Error('Handler not initialized - call load() first')
    }

    const normalized = normalize_path(path)
    const quilt_patch_id = resources.get(normalized)

    if (!quilt_patch_id) {
      throw new Error(`Resource not found: ${normalized}`)
    }

    return try_aggregators(quilt_patch_id, aggregators)
  }

  return {
    load,
    handles,
    handle,
    fetch_from_walrus
  }
}
