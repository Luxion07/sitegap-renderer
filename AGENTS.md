# Project Instructions for AI Agents

Read these files before implementation:

1. `/docs/SPEC.md`
2. `/docs/ARCHITECTURE.md`
3. `/TASKS.md`

NestJS and Playwright change their APIs between versions. Before using an API,
check the installed version's types or docs in `node_modules`, not memory.

## Scope

This is a small gRPC service: it opens one URL in headless Chromium and returns
the page's readable text. Its only client is the audit worker in sitegap-ai.
The design is recorded in ADR-0001 in the sitegap-ai repository.

Do not add:

- HTTP/REST or GraphQL APIs
- Queue consumers (BullMQ, Redis)
- A database, cache, or any other persistence
- Secrets or credentials of any kind
- Screenshots, PDFs, or HTML snapshots
- Multi-page crawling or link following
- Cookies, logins, or sessions that outlive one request
- Browsers other than Chromium
- Retries — the caller already retries the whole job

unless explicitly requested and the docs are updated first.

## Implementation Rules

- Use pnpm, Node 22 and TypeScript in strict mode.
- Use NestJS with the gRPC transport from `@nestjs/microservices`.
- The contract lives in `proto/sitegap/renderer/v1/renderer.proto`. Once
  sitegap-ai uses v1, it is frozen; breaking changes go into a `v2` package.
- Keep the gRPC controller thin: validate input, call a service, map errors to
  status codes. Logic belongs in services.
- Every request the browser makes goes through the SSRF guard. Never add a flag
  or env variable that turns it off. Tests use an explicit test policy instead.
- One Chromium per process. One `BrowserContext` per request, closed in
  `finally`.
- Bounded concurrency: reject requests over the limit, never queue them.
- Keep text extraction rules and caps identical to sitegap-ai's
  `basic-scraper.ts`. Change both or neither.
- Keep the SSRF guard's test cases in step with sitegap-ai's
  `url-safety.test.ts`.
- Return the gRPC status codes listed in `docs/SPEC.md`, with safe messages and
  no stack traces.
- Never commit secrets.
- Ask before changing architecture.
- Cover branching logic, validation, and security code with Jest tests in the
  same phase that introduces it:
  - unit tests build modules with `Test.createTestingModule` and replace
    Playwright and DNS with `overrideProvider`;
  - e2e tests call the service over real gRPC, with real Chromium and a local
    HTTP server.
  Do not test thin wrappers around NestJS or Playwright.

## Commit Convention

Follow Conventional Commits:

```text
<type>(<scope>): <subject>

<body — why, not what>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`, `build`,
`style`.

Rules:

- Imperative mood: `add`, not `added` or `adds`.
- Lowercase subject, no trailing period, max 72 characters.
- One commit, one idea. An `and` in the subject usually means two commits.
- The body explains **why** the change was needed — the diff already shows what
  changed.

## Task Discipline

Implement only the current phase from `TASKS.md`.

If a requested change touches future phases, stop and ask for confirmation.

## Learning notes

After finishing a task, suggest to the owner which topic in ~/projects/home-projects/my-library should get a MyProject block about it (what was done, why, trade-off, files). Do not edit my-library from this repo without the owner's confirmation.
