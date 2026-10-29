# SiteGap Renderer

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33?logo=playwright&logoColor=white)
![gRPC](https://img.shields.io/badge/gRPC-v1-244c5a?logo=grpc&logoColor=white)

A headless Chromium gRPC rendering microservice for [SiteGap AI](https://github.com/Luxion07/sitegap-ai).

---

## What it does

When `sitegap-ai` audits a website, its basic scraper (`fetch` + `cheerio`) extracts homepage text. Client-rendered sites (React/Vue SPAs) serve an empty HTML shell and render content with JavaScript, causing the basic scraper to fail with `EXTRACTION_EMPTY`.

`sitegap-renderer` solves this by running the page in headless Chromium and extracting the rendered text.

- **Single RPC:** `Render(url)` returns readable text (capped at 40,000 characters) and the final URL after redirects.
- **SSRF Protection:** Every outgoing browser request (navigation, redirects, iframes, scripts, XHR) is validated against an IP blocklist (private, loopback, link-local, cloud metadata).
- **Isolation:** Fresh `BrowserContext` per request. No cookies, storage, or cache persist across calls.
- **Bounded Concurrency:** Fixed slots (default 2). Excess requests are rejected immediately with `RESOURCE_EXHAUSTED` (no queueing).
- **Zero Secrets:** The service holds no database connections, Redis instances, or API keys.

See [`docs/SPEC.md`](docs/SPEC.md) for the functional specification and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system design.

---

## API Contract (v1)

Defined in [`proto/sitegap/renderer/v1/renderer.proto`](proto/sitegap/renderer/v1/renderer.proto):

```proto
syntax = "proto3";

package sitegap.renderer.v1;

service Renderer {
  rpc Render(RenderRequest) returns (RenderResponse);
}

message RenderRequest {
  string url = 1;
}

message RenderResponse {
  string text = 1;      // readable text, whitespace collapsed, capped at 40,000 chars
  string final_url = 2; // URL after redirects
}
```

The service also implements standard `grpc.health.v1.Health`.

---

## Configuration

Environment variables (validated at startup):

| Variable | Default | Description |
|---|---|---|
| `RENDERER_ADDRESS` | `0.0.0.0:50051` | Address the gRPC server listens on |
| `RENDERER_SLOTS` | `2` | Number of concurrent render slots |
| `RENDERER_MAX_RENDER_MS` | `20000` | Hard cap on one render duration |

---

## Development

### Prerequisites

- Node.js 22+
- pnpm 9+

### Commands

> Note: Implementation commands will be enabled as phases land (see [`TASKS.md`](TASKS.md)).

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm start:dev

# Build for production
pnpm build

# Run unit tests
pnpm test

# Run e2e tests
pnpm test:e2e
```

### Calling with `grpcurl`

```bash
# Render a URL
grpcurl -plaintext -d '{"url": "https://example.com"}' \
  localhost:50051 sitegap.renderer.v1.Renderer/Render

# Check service health
grpcurl -plaintext localhost:50051 grpc.health.v1.Health/Check
```
