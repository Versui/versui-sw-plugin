# @versui/sw-plugin

Service Worker plugin for fetching assets from Walrus decentralized storage.

## Installation

```bash
npm install @versui/sw-plugin
```

## Usage

### Simple (Auto-generated SW)

If you deployed with `versui deploy`, a service worker is already generated. You don't need this plugin.

### Custom Service Worker

If you have your own service worker and want to integrate Versui:

```js
// sw.js
import { create_versui_handler } from '@versui/sw-plugin'

// Create handler (resources loaded separately for flexibility)
const versui = create_versui_handler()

// Load resources (can be called anytime)
versui.load({
  '/index.html': 'your-quilt-patch-id',
  '/assets/main.js': 'another-patch-id',
  // ... from versui deploy output
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))
self.addEventListener('fetch', e => versui.handle(e))
```

### With Caching + Custom Aggregators

```js
const versui = create_versui_handler({
  cache_name: 'my-app-v1',  // Enables caching
  aggregators: ['https://my-custom-aggregator.com'],  // Prepended to defaults
})

versui.load({ '/index.html': 'blob123' })
```

### Dynamic Updates

Update resources without redeploying your service worker:

```js
self.addEventListener('message', e => {
  if (e.data.type === 'UPDATE_VERSUI') {
    versui.load(e.data.resources)  // Seamless update
  }
})
```

From your app:
```js
navigator.serviceWorker.controller.postMessage({
  type: 'UPDATE_VERSUI',
  resources: { '/index.html': 'new-blob-id' }
})
```

### Combining with Other Logic

```js
self.addEventListener('fetch', e => {
  // Let Versui handle its resources
  if (versui.handles(e.request)) {
    versui.handle(e)
    return
  }

  // Your own logic for other requests
  e.respondWith(fetch(e.request))
})
```

## API

### `create_versui_handler(options)`

**Options (all optional):**
- `resources`: Initial resource map (can also use `.load()` method)
- `aggregators`: Additional aggregators (prepended to defaults for priority)
- `cache_name`: Enable response caching (default: null)

**Returns object with methods:**
- `load(resources)`: Load/update resource mappings (path -> quiltPatchId)
- `handle(event)`: Handle fetch events for Versui resources
- `handles(request)`: Check if request should be handled
- `fetch_from_walrus(pathname)`: Manually fetch a resource

**Example:**
```js
const versui = create_versui_handler({ cache_name: 'v1' })
versui.load({ '/index.html': 'blob123' })
self.addEventListener('fetch', e => versui.handle(e))
```

## License

Apache-2.0
