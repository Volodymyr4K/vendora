# CI helper scripts

- `wait-http.mjs` — waits until URL responds with 2xx
- `run-e2e.mjs` — starts BFF + Web (next start) and runs Playwright tests
- `run-lhci.mjs` — starts BFF and runs Lighthouse CI (web start handled by LHCI)

These scripts are used from root `package.json` for CI gates.
