# SiteGap Renderer

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33?logo=playwright&logoColor=white)
![gRPC](https://img.shields.io/badge/gRPC-v1-244c5a?logo=grpc&logoColor=white)

> **Status:** Implementation complete (Phases 1–8). See [`TASKS.md`](TASKS.md).

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

> **Warning (SPEC §8.3 — Network exposure):** The service has **no authentication**. It must listen only on a private network that the worker can reach, never on a public address.

See [`docs/SPEC.md`](docs/SPEC.md) for the functional specification and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system design.

---

## API Contract (v1)

Defined in [`docs/SPEC.md` §4](docs/SPEC.md#4-api-contract-v1):

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
- pnpm 10+

### Commands

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

### Calling

```bash
# Render a URL
grpcurl -plaintext \
  -import-path proto -proto sitegap/renderer/v1/renderer.proto \
  -d '{"url": "https://example.com"}' \
  localhost:50051 sitegap.renderer.v1.Renderer/Render

# Check service health via grpcurl
grpcurl -plaintext \
  -import-path proto -proto grpc/health/v1/health.proto \
  -d '{"service": ""}' \
  localhost:50051 grpc.health.v1.Health/Check
```

---

## Docker

### Pull the published image

Tagged releases are published to GHCR for `linux/amd64` and `linux/arm64`. No login is needed:

```bash
docker pull ghcr.io/luxion07/sitegap-renderer:0.1.0
```

Pushing a tag `vX.Y.Z` publishes image `X.Y.Z` ([`release.yml`](.github/workflows/release.yml)). There is no `latest` tag, so always pin a version.

### Or build it locally

```bash
docker build -t sitegap-renderer .
```

### Run

```bash
docker run -d \
  --name sitegap-renderer \
  -p 127.0.0.1:50051:50051 \
  --shm-size=1gb \
  --security-opt seccomp=seccomp_profile.json \
  ghcr.io/luxion07/sitegap-renderer:0.1.0
```

If you built the image locally, use `sitegap-renderer` as the image name. `seccomp_profile.json` is in the repository root, so run the command from a clone or pass the path to your copy.

Flags explained:
- `-p 127.0.0.1:50051:50051`: Publishes the port on the loopback interface only. The service has no authentication, so it must not be reachable from the network.
- `--security-opt seccomp=seccomp_profile.json`: Docker's default seccomp profile ([moby/profiles@4b8214f](https://github.com/moby/profiles/blob/4b8214fc4971e06172938a1f1554ccff6647ee80/seccomp/default.json)) plus one rule that allows `clone`, `setns` and `unshare`, so Chromium can create the user namespace its sandbox needs under the unprivileged `pwuser`. It replaces Playwright's profile, which is based on an older Docker default: newer runc versions crash on start with it.
- `--shm-size=1gb`: Allocates shared memory for Chromium to prevent browser crashes on complex pages without sharing the host IPC namespace (`--ipc=host` is avoided for security).
- Non-root user: The container runs under the non-root `pwuser` account.
- Init process: `tini` is configured as the container entrypoint for signal forwarding and zombie process reaping.
- Health check: Built-in Docker `HEALTHCHECK` queries standard `grpc.health.v1.Health/Check` via a lightweight script.
