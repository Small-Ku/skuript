# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the userscript source. The active feature area is `src/novele/`: UI in `src/novele/app/`, extraction and navigation in `src/novele/core/`, and the entrypoint in `src/novele/index.ts`. Shared helpers live in `src/util/`, shared theme assets and SVG icons in `src/style/`, and build tooling in [`build.ts`](build.ts). Output goes to `dist/novele.user.js`.

## Build, Test, and Development Commands
Use Bun for local work:

- `bun run build` builds the production userscript into `dist/`.
- `bun run build:dev` creates a development build.
- `bun run build:watch` rebuilds on file changes.
- `bun run dev` runs the dev build with the local server/watch flow from `build.ts`.
- `bun run clean` removes `dist/`.
- `biome check --write <paths...>` is the Biome cleanup pass. Use `.` for the full repo, or touched paths during broader refactors and file moves.

There is no dedicated `npm test` or `bun test` suite yet.

Validation rules:

- `biome check --write .` and `bun run build` are the minimum local gate for any code change.
- If `biome check --write` skips unsafe fixes or leaves diagnostics, resolve them manually.
- For broad refactors or file moves, run `biome check --write` on the touched paths before the final repo-wide pass.
- Keep Biome scoped to real source files. Exclude `.temp\`, generated output, dependencies, coverage artifacts, and generated icon trees.
- When adding or tightening Biome rules, start with the active source area and widen only after the config is quiet.
- Treat lint cleanup as code cleanup. Remove dead imports, dead variables, obsolete helpers, and stale suppressions before weakening rules.

## Coding Style & Naming Conventions
This repo uses TypeScript, TSX, and SCSS. Follow the existing style:

- Use tabs for indentation in source files.
- Prefer small, focused modules under `src/novele/core/` and `src/util/`.
- Use `camelCase` for functions and variables, `PascalCase` for types/components, and kebab-style filenames only where already established by the repo.
- Keep comments sparse and practical. Use targeted `biome-ignore` comments only when needed.
- Keep Biome suppressions narrow and truthful. Remove unused suppressions instead of stacking new ones.
- Remove internal-only state or returned fields when nothing consumes them. Keep reactive state only when it still drives UI or derived behavior.
- Delete orphaned modules and empty legacy folders once imports have moved. Do not keep dead paths around just to avoid a cleanup diff.
- For site-support fixes, prefer additive selector or URL-normalization fallbacks. Preserve broad supported-host behavior unless the live DOM proves it wrong.

The build pipeline (in `build.ts` and `bun_plugins/`) recognizes special TypeScript JSDoc annotations to optimize bundle size, safely mangle properties, or strip debug code:
- `@dev-only` Strips dev-only modules, declarations, object properties, and unused imports/variables.
- `@dense-enum-values <values>` Compresses string literal arrays in-place to minimize bundle size.
- `@mangle-preserve` Prevents property name mangling (e.g., for JSON serialization/storage compatibility).
- `@mangle-force` Forces mangling of `private` class properties that conflict with the DOM safelist by renaming them to `_mf_<name>`.

## Architecture Overview
- Treat the Novele reader as one pipeline. Extraction changes often require matching updates in `src/novele/core/extract/`, `src/novele/core/queue.ts`, `src/novele/app/reader-data.ts`, and `src/novele/app/overlays.ts`.
- A parser fix for one supported host can affect link discovery, page extraction, and the reader or overlay state that consumes the result.

## Testing Guidelines
Use the smallest procedure that proves the change.

For ordinary UI or reader changes:

1. Run `bun run build`.
2. Reload the userscript on a real supported page.
3. Verify the intended behavior changed and no touched flow regressed.

For extraction or queue changes, verify all of the following on a real supported page:

- chapter links resolve correctly,
- queued fetches complete,
- parsed content renders correctly,
- storage usage does not regress unexpectedly.

If the change touches comments, also verify:

- comment pages load,
- comment submission still works,
- any touched retry or anti-bot path still behaves correctly.

If one browser pass cannot prove the fix, add a focused repo-local probe under `.temp\`:

1. Capture stable local input first when the live site is changing, rate-limited, or hard to replay.
2. Make the probe target one code path and print only the evidence needed to compare expected and actual behavior.
3. Use the app’s real parsing or cleanup path where possible.
4. If live fetching is still required, mirror the production retry behavior.
5. After the probe passes, finish with normal browser verification.

If you add automated tests later, place them near the relevant module or under a top-level `tests/` directory and name them after the target module.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit style, for example `feat(novele): ...` and `refactor(novele): ...`. Keep using `type(scope): summary`, with a feature-area scope such as `novele` or `build`.

Pull requests should include a short description of the user-visible change, the commands you ran for validation, and screenshots or short recordings for UI changes. Link the relevant issue when one exists.
