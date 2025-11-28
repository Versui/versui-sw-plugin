/**
 * @versui/sw-plugin - Service Worker plugin for Walrus decentralized storage
 *
 * Plug-and-play usage (load resources when ready):
 *   import { create_versui_handler } from '@versui/sw-plugin'
 *   const versui = create_versui_handler()
 *   versui.load({ '/index.html': 'blobId...' })
 *   self.addEventListener('fetch', e => versui.handle(e))
 *
 * With options:
 *   const versui = create_versui_handler({
 *     aggregators: ['https://custom-aggregator.io'],  // Prepended to defaults
 *     cache_name: 'versui-v1',  // Enable caching
 *   })
 *   versui.load({ '/index.html': 'blobId...' })
 *
 * Dynamic updates:
 *   self.addEventListener('message', e => {
 *     if (e.data.type === 'UPDATE_VERSUI') {
 *       versui.load(e.data.resources)  // Update resources anytime
 *     }
 *   })
 */

import { MIME_TYPES } from './mime-types.js'

const DEFAULT_AGGREGATORS = [
  'https://aggregator.walrus.site',  // mainnet
  'https://walrus.site',  // mainnet
  'https://aggregator.walrus-testnet.walrus.space',  // testnet fallback
  'https://aggregator.testnet.blob.store',  // testnet fallback
]

/**
 * Create a Versui fetch handler for your service worker
 * @param {Object} [options={}] - Configuration options
 * @param {Object} [options.resources] - (Optional) Initial resource map (path -> quiltPatchId). Can also use load() method.
 * @param {string[]} [options.aggregators] - Additional aggregator URLs (prepended to defaults for priority)
 * @param {string} [options.cache_name] - Cache name for caching responses (optional)
 * @returns {Object} Handler with load(), handle(), and handles() methods
 */
export function create_versui_handler(options = {}) {
  const { resources: initial_resources = {}, aggregators = [], cache_name = null } = options

  // Merge custom aggregators with defaults (custom first for priority)
  const final_aggregators = aggregators.length > 0
    ? [...aggregators, ...DEFAULT_AGGREGATORS]
    : DEFAULT_AGGREGATORS

  // Mutable resources - can be updated via load()
  let resources = { ...initial_resources }

  /**
   * Load or update resource mappings
   * @param {Object} new_resources - Map of path -> quiltPatchId
   * @example
   *   versui.load({ '/index.html': 'blob123', '/style.css': 'blob456' })
   */
  function load(new_resources) {
    resources = { ...resources, ...new_resources }
  }

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
   * Send message to all clients
   * @param {Object} message
   */
  async function notify_clients(message) {
    const clients = await self.clients.matchAll()
    clients.forEach(client => client.postMessage(message))
  }

  /**
   * Fetch a resource from Walrus aggregators with failover
   * @param {string} pathname
   * @returns {Promise<Response>}
   */
  async function fetch_from_walrus(pathname) {
    const blob_id = resources[pathname]
    if (!blob_id) return null

    // Notify loading (only for initial resource, not cached)
    if (pathname === '/' || pathname === '/index.html') {
      notify_clients({ type: 'VERSUI_LOADING', message: 'Site is being fetched from <span class="gradient">Walrus</span> and installed in your browser' })
    }

    // Try each aggregator until one works
    for (const aggregator of final_aggregators) {
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

  // Track if site has been installed
  let site_installed = false

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

          // Notify success on first successful cache (site installed)
          if (!site_installed && (pathname === '/' || pathname === '/index.html')) {
            site_installed = true
            notify_clients({ type: 'VERSUI_SUCCESS' })
          }
        }

        return response
      })()
    )
  }

  return { load, handles, handle, fetch_from_walrus }
}

// Re-export defaults for convenience
export { DEFAULT_AGGREGATORS, MIME_TYPES }
