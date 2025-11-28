# @versui/sw-plugin

```bash
npm install @versui/sw-plugin
```

```js
// sw.js
import { create_versui_handler } from '@versui/sw-plugin'

const versui = create_versui_handler()
versui.load({ '/index.html': 'your-quilt-patch-id' })

self.addEventListener('fetch', e => versui.handle(e))
```

*Service Worker plugin for fetching assets from Walrus decentralized storage*

## Usage Patterns

### Auto-generated SW (via `versui deploy`)

Service worker already generated. No plugin integration needed.

### Custom Service Worker

```js
// sw.js
import { create_versui_handler } from '@versui/sw-plugin'

const versui = create_versui_handler()

versui.load({
  '/index.html': 'your-quilt-patch-id',
  '/assets/main.js': 'another-patch-id',
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))
self.addEventListener('fetch', e => versui.handle(e))
```

### Caching + Custom Aggregators

```js
const versui = create_versui_handler({
  cache_name: 'my-app-v1',
  aggregators: ['https://my-custom-aggregator.com'],
})

versui.load({ '/index.html': 'blob123' })
```

### Dynamic Updates

```js
self.addEventListener('message', e => {
  if (e.data.type === 'UPDATE_VERSUI') {
    versui.load(e.data.resources)
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
  if (versui.handles(e.request)) {
    versui.handle(e)
    return
  }

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

MIT
