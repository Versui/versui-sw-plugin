/**
 * @versui/sw-plugin - Service Worker plugin for Walrus decentralized storage
 *
 * Simple usage:
 *   import { create_versui_handler } from '@versui/sw-plugin'
 *   const versui = create_versui_handler({ resources: { '/index.html': 'blobId...' } })
 *   self.addEventListener('fetch', e => versui.handle(e))
 *
 * With custom caching:
 *   const versui = create_versui_handler({
 *     resources: { '/index.html': 'blobId...' },
 *     aggregators: ['https://...', 'https://...'],
 *     cache_name: 'versui-v1',  // Enable caching
 *   })
 */

const DEFAULT_AGGREGATORS = [
  'https://aggregator.walrus-testnet.walrus.space',
  'https://aggregator.testnet.blob.store',
]

const MIME_TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
}

/**
 * Create a Versui fetch handler for your service worker
 * @param {Object} options
 * @param {Object} options.resources - Map of path -> quiltPatchId
 * @param {string[]} [options.aggregators] - Walrus aggregator URLs (with failover)
 * @param {string} [options.cache_name] - Cache name for caching responses (optional)
 * @returns {Object} Handler with handle() and handles() methods
 */
export function create_versui_handler(options) {
  const { resources, aggregators = DEFAULT_AGGREGATORS, cache_name = null } = options

  /**
   * Check if this request should be handled by Versui
   * @param {Request} request
   * @returns {boolean}
   */
  function handles(request) {
    const pathname = new URL(request.url).pathname
    return pathname in resources
  }

  /**
   * Fetch a resource from Walrus aggregators with failover
   * @param {string} pathname
   * @returns {Promise<Response>}
   */
  async function fetch_from_walrus(pathname) {
    const blob_id = resources[pathname]
    if (!blob_id) return null

    // Try each aggregator until one works
    for (const aggregator of aggregators) {
      try {
        const response = await fetch(`${aggregator}/v1/blobs/by-quilt-patch-id/${blob_id}`)
        if (response.ok) {
          const ext = pathname.match(/\.[^.]+$/)?.[0] || ''
          const content_type = MIME_TYPES[ext] || 'application/octet-stream'
          return new Response(await response.blob(), {
            headers: { 'Content-Type': content_type },
          })
        }
      } catch (e) {
        // Try next aggregator
      }
    }

    // All aggregators failed
    return new Response('Resource unavailable', { status: 404 })
  }

  /**
   * Handle a fetch event
   * @param {FetchEvent} event
   */
  function handle(event) {
    const pathname = new URL(event.request.url).pathname
    if (!(pathname in resources)) return // Not our resource

    event.respondWith(
      (async () => {
        // Check cache first if caching is enabled
        if (cache_name) {
          const cache = await caches.open(cache_name)
          const cached = await cache.match(event.request)
          if (cached) return cached
        }

        // Fetch from Walrus
        const response = await fetch_from_walrus(pathname)

        // Cache the response if caching is enabled
        if (cache_name && response && response.ok) {
          const cache = await caches.open(cache_name)
          cache.put(event.request, response.clone())
        }

        return response
      })()
    )
  }

  return { handles, handle, fetch_from_walrus }
}

// Re-export defaults for convenience
export { DEFAULT_AGGREGATORS, MIME_TYPES }
