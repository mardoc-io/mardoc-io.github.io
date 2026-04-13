# End-to-end tests (Playwright)

These tests drive a real headless Chromium browser against a real Next.js
dev server, exercising MarDoc end-to-end as a user would. They complement
the unit + component tests in `src/__tests__/`, which catch regressions
at the module level, with smoke-level tests that catch **integration**
regressions the unit tests miss.

## What lives here

- `critical-flows.spec.ts` — the canonical user stories. Each test guards
  a named flow ("comment on a markdown file", "comment on an HTML file in
  a PR", etc). Breaking any of these is a P0.
- `fixtures/` — shared setup helpers and selectors.

## What does NOT belong here

- Unit tests for pure functions (use vitest)
- Component-level tests for a single React component (use vitest +
  @testing-library/react)
- Anything that needs mocks. If you need to mock, it's a vitest test.

## Running locally

```
npm run e2e            # headless
npm run e2e:ui         # interactive UI mode with time-travel debugging
```

The config boots `npm run dev` on port 3000 automatically.

## Running in CI

GitHub Actions (`.github/workflows/test.yml`) runs the suite against a
production build (`next start`). Tests MUST be deterministic — no
sleep-based waits, always `waitFor`.
