# SPEC.md — SiteGap Renderer

This document describes what the service does and the contract it keeps. How it
is built lives in `docs/ARCHITECTURE.md`; the order of work lives in `TASKS.md`.

The design decision behind the service is ADR-0001 in the sitegap-ai repository
(`docs/adr/0001-headless-renderer-service.md`).

---

## 1. Summary

### One-liner

A gRPC service that opens one URL in headless Chromium and returns the page's
readable text.

### Why it exists

sitegap-ai audits a website from the text of its homepage. Its basic scraper
uses `fetch` + `cheerio`, which only sees the HTML the server sends.
Client-rendered sites (React/Vue SPAs, some site builders) send an almost empty
HTML shell and add the text with JavaScript. For those sites the basic scraper
fails with `EXTRACTION_EMPTY`.

The renderer runs the page's JavaScript in a real browser, so the text exists
by the time it is read.

### Client

The only client is the sitegap-ai audit worker. It calls the renderer only when
the basic scraper fails with `EXTRACTION_EMPTY`, and the renderer is optional:
when it is not configured or the call fails, the audit behaves as if the
renderer did not exist.

```text
audit worker
  │ 1. basic scraper (fetch + cheerio)
  │    └─ EXTRACTION_EMPTY?
  │ 2. Render(url), deadline 20 s ─────────► sitegap-renderer
  │ ◄──────────── { text, final_url } ────── (Chromium, no secrets)
  │ 3. RAG tips → LLM → report
```

---

## 2. Scope

### In scope

- One RPC: `Render(url)` → readable text and the final URL.
- The homepage only — the URL that was passed in, after redirects.
- An SSRF guard on every request the browser makes.
- Text extraction with the same rules as the sitegap-ai basic scraper.
- A standard gRPC health service.
- A Docker image.

### Out of scope

- HTTP/REST or GraphQL APIs.
- Queues, databases, caches, or any other persistence.
- Secrets or credentials of any kind.
- Screenshots, PDFs, or HTML snapshots.
- Multi-page crawling or following links.
- Cookies, logins, or sessions that outlive one request.
- Browsers other than Chromium.
- Retries — the caller already retries the whole audit job.
- Authentication — see §8.

---

## 3. Glossary

| Term | Meaning |
|---|---|
| Main document | The HTML page at the requested URL, after redirects. |
| Subresource | Anything the main document loads: scripts, styles, iframes, `fetch`/XHR calls. |
| Slot | Permission to run one render. The service has a fixed number of them. |
| Deadline | The moment the client stops waiting, sent with every gRPC call. |

---

## 4. API Contract (v1)

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

The file lives at `proto/sitegap/renderer/v1/renderer.proto` and is copied
verbatim into sitegap-ai.

### Fields

- `url` — an absolute `http` or `https` URL, at most 2,048 characters. The
  worker has already checked it; the renderer checks it again, because each
  side validates its own input.
- `text` — the page's readable text (§6). It **may be empty or short**.
- `final_url` — the URL of the main document after all redirects.

> **Note (design decision — 2026-10-28): an empty page is not an error.** A page
> with little or no text returns `OK` with whatever text was found, even an
> empty string. The worker already fails audits under 200 characters, so this
> rule stays in one place — the client. The renderer reports what it saw; the
> client decides whether it is enough.

The same applies when the main document is not HTML (for example a PDF): the
response is `OK` with empty `text`. An HTTP error page (404, 500) is treated
like any other page and its text is returned — the basic scraper does the same.

### Versioning

Once sitegap-ai uses `v1`, it is frozen. Adding an optional field is allowed;
renaming, removing, or changing the meaning of a field is not. Breaking changes
go into a new package, `sitegap.renderer.v2`.

---

## 5. Status Codes

| Status | When |
|---|---|
| `OK` | The page rendered. `text` may be empty (§4). |
| `INVALID_ARGUMENT` | `url` is malformed, not http(s), or longer than 2,048 characters. |
| `PERMISSION_DENIED` | The URL, or a redirect hop of the main document, resolves to a blocked address. |
| `DEADLINE_EXCEEDED` | The page did not render before the deadline. |
| `RESOURCE_EXHAUSTED` | All slots are busy. |
| `UNAVAILABLE` | The browser is not connected (starting, crashed, or shutting down). |
| `INTERNAL` | Any other failure. |

- Messages are short and safe to log on the client. No stack traces, no
  internal hostnames or IP addresses.
- A blocked **subresource** is not an error: it is dropped and the page goes
  on. Only a blocked main document fails the call.
- `INTERNAL` is not in the ADR table. The client should treat it like
  `UNAVAILABLE`: fall back to the basic scraper's result.

---

## 6. Text Extraction

The rules match `extractReadableText` in sitegap-ai's `basic-scraper.ts`, so the
LLM sees comparable input from both providers:

1. Remove `script`, `style`, `noscript`, `nav`, `footer`, `header`, `svg` and
   `iframe` elements.
2. Take the `textContent` of `body` — what cheerio's `.text()` returns.
3. Collapse every run of whitespace into one space and trim.
4. Cut to 40,000 characters.

A change here must also be made in sitegap-ai, and the other way round.

---

## 7. Limits

| Limit | Value | Over the limit |
|---|---|---|
| Concurrent renders | 2 slots (`RENDERER_SLOTS`) | `RESOURCE_EXHAUSTED`, no queue |
| Render time | the client's deadline, never more than 20 s (`RENDERER_MAX_RENDER_MS`) | `DEADLINE_EXCEEDED` |
| Text length | 40,000 characters | text is cut |
| URL length | 2,048 characters | `INVALID_ARGUMENT` |

- A request without a deadline still gets the 20 s cap, so no client can hold a
  slot forever.
- Images, fonts and media are never downloaded — they contain no text.

---

## 8. Security Requirements

### 8.1 SSRF protection

The browser fetches far more than the URL it was given. **Every** request — the
main document, each redirect hop, iframes, scripts, `fetch`/XHR — is checked
before it leaves the browser:

- Only `http` and `https`.
- The hostname is resolved with DNS, and **every** returned address is checked.
  If any of them is blocked, the request is blocked.
- Blocked ranges, the same as sitegap-ai's `url-safety.ts`:
  - IPv4: `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16` (including
    cloud metadata at `169.254.169.254`), `172.16.0.0/12`, `192.168.0.0/16`.
  - IPv6: `::1`, `fe80::/10`, `fc00::/7`, and IPv4-mapped addresses
    (`::ffff:a.b.c.d` and the hex form `::ffff:7f00:1`), which are checked as
    IPv4.
  - Also blocked here: `::` (the unspecified address).
- Service workers are blocked: request interception does not see their
  traffic.
- WebSocket connections are blocked.

There is no flag or env variable that turns the guard off. Tests that need a
local server allow exactly that server through an explicit test policy.

### 8.2 Isolation

- Every request gets a fresh browser context: no cookies, storage or cache
  carry over from one request to the next.
- The Chromium sandbox stays on.
- The service holds no secrets. If a page escapes the browser, it finds nothing
  worth stealing.

### 8.3 Network exposure

The service has **no authentication**. It must listen only on a private network
that the worker can reach, never on a public address.

### 8.4 Known gap: DNS rebinding

The guard resolves a hostname and checks the IP, but Chromium resolves it again
when it connects. A hostile DNS server can answer with a public IP the first
time and a private one the second. Interception cannot close this gap. Before
any public deployment, the renderer must run on a network with no route to
internal services (an egress policy), so a missed check has nothing to reach.

---

## 9. Health Check

The service implements the standard `grpc.health.v1.Health` service.

- `SERVING` only while Chromium is connected.
- `NOT_SERVING` while starting, after the browser disconnects, and during
  shutdown.
- The status is reported for the overall server (`""`) and for
  `sitegap.renderer.v1.Renderer`.

---

## 10. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `RENDERER_ADDRESS` | `0.0.0.0:50051` | Address the gRPC server listens on. |
| `RENDERER_SLOTS` | `2` | Number of renders that can run at once. |
| `RENDERER_MAX_RENDER_MS` | `20000` | Upper bound on one render, whatever the client's deadline. |

Config is validated at startup. An invalid value stops the service from
starting instead of letting it run in a broken state.

---

## 11. Shutdown

On `SIGTERM` the service:

1. reports `NOT_SERVING`;
2. stops accepting new calls;
3. lets in-flight renders finish, up to their deadline;
4. closes Chromium and exits.
