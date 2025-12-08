# @versui/sw-plugin

Service Worker plugin for fetching assets from Walrus decentralized storage.

## Overview

Required integration for sites deployed to Versui that have their own Service Worker. Handles Walrus asset fetching with multi-aggregator failover.

Sites without a custom SW do not need this - the Versui Worker generates one automatically.

## Installation

```bash
npm install @versui/sw-plugin
```

## Usage

```js
import { create_versui_handler } from '@versui/sw-plugin'

const versui = create_versui_handler()

self.addEventListener('message', e => {
  if (e.data.type === 'VERSUI_RESOURCES') {
    versui.load(e.data)  // { resources, aggregators }
  }
})

self.addEventListener('fetch', e => {
  if (versui.handles(e.request)) {
    e.respondWith(versui.handle(e))
    return
  }
  // Your existing fetch logic...
})
```

## API

### `create_versui_handler()`

Factory function returning a handler object.

### `handler.load({ resources, aggregators })`

Load resources and aggregators from Versui bootstrap message.

- `resources`: Map of path to quilt_patch_id
- `aggregators`: Ordered list of aggregator URLs to try

### `handler.handles(request)`

Check if this handler should process the request.

### `handler.handle(event)`

Handle fetch event, return Response from Walrus.

### `handler.fetch_from_walrus(path)`

Direct fetch helper for advanced use cases (no client notifications).

## Client Messages

The handler sends these messages to clients via postMessage:

| Message | Fields | When |
|---------|--------|------|
| `VERSUI_LOADING` | `{ type, path }` | Starting fetch for asset |
| `VERSUI_SUCCESS` | `{ type }` | First successful Walrus fetch per handler instance |
| `VERSUI_ERROR` | `{ type, error }` | All aggregators failed for a request |

## License

MIT
