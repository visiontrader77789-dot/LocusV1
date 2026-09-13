# Contributing to Locus

Thanks for considering contributing to Locus. Locus is a local-first workspace that stores everything in the browser, so the contribution rules below exist to protect that core promise.

## Ground rules

- **Stay local-first.** No backend, no accounts, no telemetry, no analytics. Features must work offline and must never send user data anywhere.
- **No new runtime dependencies without discussion.** The app deliberately ships with a small, pinned dependency set. Ask in an issue before proposing a new package.
- **Keep the storage contract intact.** `lib/storage/` and `lib/core/` are the data layer. Schema changes must go through the validators and the migration path (`lib/core/validate.ts`, `lib/core/migration.ts`) and stay backwards/forwards compatible with exports.
- **Match the existing patterns.** Look at how neighboring components are written before writing your own. Keep the design language consistent.

## Development setup

```bash
npm install
npm run dev        # start the dev server (http://localhost:3000)
npm test           # run the unit test suite once
npm run test:watch # run tests in watch mode
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # static export to out/
```

### Verifying a production-like build

Locus is a static export (Next.js `output: "export"`). To check your changes in the released form:

```bash
npm run build
npx serve out -s -l 3000
# open http://127.0.0.1:3000
```

`npm run dev` (Next.js dev server) is fine for day-to-day work; the static export is the real artifact.

## Running tests

Unit tests live next to the code they test (`*.test.ts`) and run under [Vitest](https://vitest.dev). The storage layer, serialization, validation, and editor helpers all have coverage there — when you touch those areas, keep the tests green.

The full pre-merge checklist:

```bash
npm run typecheck
npm run lint
npm test
npm run build    # must complete without errors
```

## Submitting changes

1. Fork the repository and create a branch off `main` (or `develop` if one exists).
2. Make your change with tests where relevant.
3. Run the pre-merge checklist above.
4. Open a pull request with a description of what you changed and why.

- Keep PRs focused. If a change is large, open an issue first so the approach can be discussed.
- Write a clear commit message in the same style as existing history.

## Reporting issues

- **Bugs:** include the browser and OS, the app version or commit, and what you expected versus what happened.
- **Data-loss reports:** be explicit — Locus is local-only, so losing a workspace is the worst possible outcome. See [SECURITY.md](SECURITY.md) for the private reporting path.

## Licensing

The repository has not yet been assigned a license. By submitting a pull request you agree to your contribution being licensed under whatever license the maintainer eventually selects. If that is a problem for you, say so before contributing.