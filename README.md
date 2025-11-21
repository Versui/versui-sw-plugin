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

const versui = create_versui_handler({
  resources: {
    '/index.html': 'your-quilt-patch-id',
    '/assets/main.js': 'another-patch-id',
    // ... from versui deploy output
  },
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))
self.addEventListener('fetch', e => versui.handle(e))
```

### With Caching

```js
const versui = create_versui_handler({
  resources: { ... },
  cache_name: 'my-app-v1',  // Enables caching
})
```

### Custom Aggregators

```js
const versui = create_versui_handler({
  resources: { ... },
  aggregators: [
    'https://aggregator.walrus.space',
    'https://my-custom-aggregator.com',
  ],
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

**Options:**
- `resources` (required): Object mapping paths to quilt patch IDs
- `aggregators`: Array of Walrus aggregator URLs (default: testnet aggregators)
- `cache_name`: Cache name for response caching (default: null = no caching)

**Returns:**
- `handle(event)`: Call this in your fetch event listener
- `handles(request)`: Check if a request should be handled by Versui
- `fetch_from_walrus(pathname)`: Manually fetch a resource

## License

Apache-2.0
