<p align="center">
  <img src="assets/banner.jpg" alt="@versui/sw-plugin banner" width="100%">
</p>
<h1 align="center">@versui/sw-plugin</h1>
<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/Service_Worker-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/Walrus-0F1419?style=for-the-badge&logo=sui&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</p>

---

```bash
npm install @versui/sw-plugin
```

```js
import { create_versui_handler } from '@versui/sw-plugin'

const versui = create_versui_handler()

self.addEventListener('message', e => {
  if (e.data.type === 'VERSUI_RESOURCES') {
    versui.load(e.data)
  }
})

self.addEventListener('fetch', e => {
  if (versui.handles(e.request)) {
    e.respondWith(versui.handle(e))
    return
  }
})
```

*Service Worker plugin for fetching assets from Walrus decentralized storage*

## Features

- Multi-aggregator failover with 5s timeout per aggregator
- Automatic MIME type detection
- Path normalization (query strings, trailing slashes)
- Client notifications for loading/success/error states

## When You Need This

> [!NOTE]
> Sites without a custom Service Worker do **not** need this package - Versui Worker generates one automatically.

Required when your site has its own `sw.js` and deploys to Versui.

## API

### `create_versui_handler()`

Returns handler with:

| Method | Description |
|--------|-------------|
| `load({ resources, aggregators })` | Initialize with resource map and aggregator URLs |
| `handles(request)` | Check if request should be handled |
| `handle(event)` | Handle fetch event, return Response from Walrus |
| `fetch_from_walrus(path)` | Direct fetch (no notifications) |

### Client Messages

| Message | Fields | When |
|---------|--------|------|
| `VERSUI_LOADING` | `{ type, path }` | Starting fetch |
| `VERSUI_SUCCESS` | `{ type }` | First successful fetch after `load()` |
| `VERSUI_ERROR` | `{ type, error }` | All aggregators failed |

## Exports

```js
import { create_versui_handler, MIME_TYPES } from '@versui/sw-plugin'
```

## License

[MIT](LICENSE)
