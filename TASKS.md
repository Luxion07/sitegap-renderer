# TASKS.md — SiteGap Renderer

This file is the implementation roadmap for AI coding agents and manual development.

Important rule: implement one phase at a time. Do not skip ahead.

The design comes from ADR-0001 in the sitegap-ai repository
(`docs/adr/0001-headless-renderer-service.md`, action items 2–9). If a task here
disagrees with the ADR, stop and ask.

---

## Global Rules

- Read `/docs/SPEC.md` before implementation.
- Read `/docs/ARCHITECTURE.md` before implementation.
- Do not add features that are not listed in the current phase.
- gRPC only: no HTTP API, no queue consumer.
- The service holds no secrets: no database, Redis or LLM credentials.
- Once sitegap-ai uses `renderer.proto` v1, it is frozen. Breaking changes go
  into a new `v2` package.
- Every request the browser makes goes through the SSRF guard. Tests may allow
  their own local server through an explicit test policy; they never turn the
  guard off.
- Use pnpm and TypeScript.
- Tests use Jest and ship in the same phase as the code: unit tests built with
  `Test.createTestingModule`, e2e tests that call the service over real gRPC.
- Do not commit secrets.
- Ask before changing architecture.

---

## Phase 0 — Testing and CI (ongoing)

Goal: keep the service verifiable at every step.

> **Note:** This phase does not "finish" — each later phase adds the tests for
> the code it introduces.

Tasks:

- [ ] Add the Jest unit suite (`pnpm test`) and e2e suite (`pnpm test:e2e`)
      (together with Phase 2).
- [ ] Add a GitHub Actions workflow running lint, typecheck, unit and e2e tests
      (together with Phase 2).
- [ ] Install Playwright Chromium in CI for the e2e suite (together with Phase 3).
- [ ] Cover input validation (together with Phase 2).
- [ ] Cover browser slots and context cleanup (together with Phase 3).
- [ ] Port the `url-safety.test.ts` cases from sitegap-ai (together with Phase 4).
- [ ] Cover extraction rules and status code mapping (together with Phase 5).
- [ ] Cover health status changes (together with Phase 6).

Acceptance criteria:

- `pnpm test` and `pnpm test:e2e` run locally.
- CI fails when lint, typecheck or tests fail. The repository has no remote
  yet, so until then the same commands run locally.
- New code with branching logic ships with tests in the same phase.

---

## Phase 1 — Documentation

Goal: describe the service before writing code.

Tasks:

- [x] Add `TASKS.md` (this file).
- [x] Add `.gitignore` for editor and agent folders.
- [x] Add `AGENTS.md`: scope, implementation rules, commit convention, task
      discipline.
- [x] Add `CLAUDE.md` containing `@AGENTS.md`.
- [x] Add `docs/SPEC.md`: what the service does, the v1 contract, status codes,
      limits, non-goals.
- [ ] Add `docs/ARCHITECTURE.md`: modules, request flow, browser lifecycle,
      SSRF guard, known gaps (DNS rebinding).
- [ ] Add `README.md`: badges, what the service does, how to run and call it
      (commands filled in as later phases land).

Do not implement:

- Any code or `package.json`.

Acceptance criteria:

- A new reader understands what the service does and why it exists without
  opening sitegap-ai.
- Each later phase in this file maps to a section of SPEC or ARCHITECTURE.

---

## Phase 2 — Scaffold

Goal: a NestJS gRPC server that speaks the v1 contract but does not render yet.

Tasks:

- [ ] Create the NestJS app (TypeScript strict, pnpm, Node 22).
- [ ] Add ESLint and Prettier; scripts `lint`, `typecheck`, `test`, `test:e2e`,
      `format`.
- [ ] Add `proto/sitegap/renderer/v1/renderer.proto` exactly as in the ADR.
- [ ] Generate TypeScript types from the proto (pick the tool in this phase,
      e.g. `ts-proto`).
- [ ] Start the app as a gRPC microservice (`@nestjs/microservices`,
      `Transport.GRPC`).
- [ ] Read config from env and validate it at startup: listen address, slot
      count (default 2). Add `.env.example`.
- [ ] `Render` validates `url`: malformed or not http(s) → `INVALID_ARGUMENT`.
      Any other URL → `UNIMPLEMENTED` for now.
- [ ] Enable shutdown hooks so `SIGTERM` closes the app cleanly.
- [ ] Extend `.gitignore` with Node build output, coverage and env files.
- [ ] Tests: unit for URL validation; e2e where a real gRPC client calls
      `Render`.

Do not implement:

- Playwright.
- SSRF guard.
- Health service.
- Dockerfile.

Acceptance criteria:

- `pnpm install`, `pnpm build` and `pnpm start` work.
- `grpcurl` calling `Render` gets `INVALID_ARGUMENT` for a bad URL and
  `UNIMPLEMENTED` for a good one.
- Lint, typecheck and tests pass.

---

## Phase 3 — Browser Lifecycle

Goal: manage Chromium safely — one browser, isolated contexts, bounded load.

> **Note:** `Render` stays `UNIMPLEMENTED` until Phase 5, so it never opens a
> page without the Phase 4 guard. This phase is tested through the browser
> service directly.

Tasks:

- [ ] Add Playwright (Chromium only).
- [ ] Browser service: launch one Chromium at startup, close it on shutdown.
- [ ] Open a fresh `BrowserContext` per request and close it in `finally` — also
      on errors and timeouts.
- [ ] Slot limiter: at most N renders at once (default 2). Over the limit, reject
      immediately with `RESOURCE_EXHAUSTED`; no internal queue.
- [ ] Bound each render by a timeout given by the caller (the gRPC deadline in
      Phase 5), never longer than `RENDERER_MAX_RENDER_MS` (SPEC §7).
- [ ] Decide what happens when Chromium crashes or disconnects (relaunch, or exit
      and let the container restart). Record it in `docs/ARCHITECTURE.md`.
- [ ] Tests: unit with a mocked browser (`overrideProvider`) — context closed on
      error, slot released, extra request rejected; e2e — real Chromium opens a
      local static page.

Acceptance criteria:

- Two renders run in parallel; a third is rejected immediately.
- No contexts or Chromium processes are left behind after errors or shutdown.

---

## Phase 4 — SSRF Guard

Goal: no request made by the browser reaches a blocked address.

Tasks:

- [ ] Port `assertSafeUrl` from sitegap-ai: http(s) only, DNS resolved, every
      resolved address checked, IPv4 and IPv6.
- [ ] Port the `url-safety.test.ts` cases, so both implementations are held to
      the same tests.
- [ ] Handle IPv6 literals. `URL.hostname` keeps the brackets (`[::1]`), and URLs
      store IPv4-mapped addresses in hex (`[::ffff:127.0.0.1]` becomes
      `[::ffff:7f00:1]`), which the sitegap-ai regex does not unwrap. Strip the
      brackets, unwrap both forms, block `::`. Consider `net.BlockList` instead
      of string prefixes. Add a test case for each form.
- [ ] Intercept every request with `context.route('**/*')` — documents, iframes,
      scripts, `fetch`/XHR — and abort blocked ones.
- [ ] Redirects: Playwright calls the route handler only for the first URL of a
      redirect chain. Verify this, and check every hop another way (e.g.
      `route.fetch({ maxRedirects: 0 })` and validate `Location`). If this
      changes the ADR design, record it in `docs/ARCHITECTURE.md`.
- [ ] Create contexts with `serviceWorkers: 'block'`.
- [ ] Block WebSockets (`context.routeWebSocket`).
- [ ] Abort `image`, `font` and `media` requests in the same handler.
- [ ] A blocked main document (the entered URL or a redirect hop) fails the
      render with `PERMISSION_DENIED`. A blocked subresource is dropped and the
      page goes on.
- [ ] Test setup: the local test server itself runs on 127.0.0.1, so e2e tests
      allow exactly its origin through an overridden policy provider. The guard
      stays on.
- [ ] Tests: unit — ported cases and IPv6 literal cases; e2e with a local HTTP
      server — a page whose script calls a loopback address gets that request
      blocked, and a redirect to a loopback address is blocked.

Acceptance criteria:

- Every ported sitegap-ai test case passes.
- A page cannot reach a private, loopback, link-local or metadata address
  through navigation, redirects, subresources, `fetch`, service workers or
  WebSockets.

---

## Phase 5 — Text Extraction and Render

Goal: `Render` returns the page's readable text, using the same rules as the
sitegap-ai basic scraper.

Tasks:

- [ ] Choose when a page counts as rendered (`load`, `networkidle`, or waiting
      for text), always bounded by the client deadline.
- [ ] Extract text with the same rules as `basic-scraper.ts`: remove `script`,
      `style`, `noscript`, `nav`, `footer`, `header`, `svg`, `iframe`; take the
      body text; collapse whitespace; trim; cap at 40,000 characters.
- [ ] Use `textContent` (what cheerio's `.text()` returns), not `innerText`,
      unless we decide otherwise — they differ on hidden elements and line
      breaks.
- [ ] Return `final_url`, the URL after redirects.
- [ ] Read the deadline from the gRPC call; stop and close the context when it
      passes or the client cancels.
- [ ] Map errors to the status codes in SPEC §5: `INVALID_ARGUMENT`,
      `PERMISSION_DENIED`, `DEADLINE_EXCEEDED`, `RESOURCE_EXHAUSTED`,
      `UNAVAILABLE`, `INTERNAL`.
- [ ] A page with no text, or a non-HTML main document, returns `OK` with empty
      `text` (SPEC §4). The client keeps its 200-character rule.
- [ ] Wire `Render` to the browser service, the guard and the extractor.
- [ ] Tests: unit — extraction rules, the cap, status mapping; e2e — a page
      whose text appears only after JavaScript runs returns that text, and a
      redirect returns the right `final_url`.

Acceptance criteria:

- `grpcurl` calling `Render` on a local JS-only page returns its text.
- For a static page, the text matches what `basic-scraper.ts` extracts from the
  same HTML.
- Errors arrive as the status codes from the ADR.

---

## Phase 6 — Health Check

Goal: let the worker and Docker see whether the renderer can take requests.

Tasks:

- [ ] Add the standard `grpc.health.v1` service.
- [ ] Report `SERVING` only while the browser is connected; `NOT_SERVING` after
      a disconnect and during shutdown.
- [ ] Tests: unit — status follows browser events; e2e — `Check` returns
      `SERVING`.

Acceptance criteria:

- A health probe against a running service returns `SERVING`.
- Killing Chromium makes the service stop reporting `SERVING` (how exactly
  follows the Phase 3 crash decision).

---

## Phase 7 — Docker

Goal: run the renderer in a container with the least privilege it needs.

Tasks:

- [ ] Dockerfile on `mcr.microsoft.com/playwright`, pinned to the exact
      Playwright version in `package.json`.
- [ ] Multi-stage build: a build stage, and a runtime stage with production
      dependencies only.
- [ ] Run as a non-root user.
- [ ] Add an init process for zombie reaping (`tini` or `docker run --init`).
- [ ] Keep the Chromium sandbox on — no `--no-sandbox`. Use the seccomp profile
      from the Playwright docs if the sandbox needs it.
- [ ] Give Chromium enough shared memory with `--shm-size`. Avoid `--ipc=host`,
      which shares the host's IPC namespace with a process running untrusted
      JavaScript.
- [ ] Docker `HEALTHCHECK` using the gRPC health service.
- [ ] Add `.dockerignore`.
- [ ] README: build and run commands.

Acceptance criteria:

- `docker build` and `docker run` work, and `grpcurl` can call `Render` against
  the container.
- The process inside the container runs as a non-root user.
- `docker stop` shuts the service down cleanly within the grace period.

---

## Out of Scope for This Repository

- Publishing the image to GHCR — there is no remote yet (second half of ADR
  action item 8).
- The gRPC client, the escalation rule and the docker-compose service — these
  live in sitegap-ai (ADR action items 10–13).
- An egress network policy — required before any public deployment (ADR,
  "Known gap: DNS rebinding").
