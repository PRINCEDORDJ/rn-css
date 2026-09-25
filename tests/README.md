# Tests

Automated tests use Node's built-in test runner (`node:test`) — no extra
dependencies.

## Running

```bash
npm test
```

> Requires Node 21+ (the runner passes a glob pattern to `node --test`).
> The CLI itself still supports Node 18+.

## Coverage

| Module | Tests |
|---|---|
| `projectDetector.js` | Detects expo, react-native, TypeScript, NativeWind, PM; malformed JSON |
| `packageManager.js` | Correct install commands for npm/yarn/pnpm/bun × dev |
| `configuration.js` | Create/idempotency, babel & tailwind smart-merge, metro preserve+wrap, backups |
| `verification.js` | Pass/fail results for each check, incl. global.css import and shadowing |
| `cli.js` | New vs. existing project routing, project name validation |
