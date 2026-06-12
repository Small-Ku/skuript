# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the source for the userscript. The active feature area is `src/novele/`, with UI code in `src/novele/app/`, extraction and navigation logic in `src/novele/core/`, and the userscript entry at `src/novele/index.ts`. Shared helpers live in `src/util/`, and shared theme assets and SVG icons live in `src/style/`. Build output is written to `dist/` as `novele.user.js`. Build tooling is in [`build.ts`](build.ts).

## Build, Test, and Development Commands
Use Bun for local work:

- `bun run build` builds the production userscript into `dist/`.
- `bun run build:dev` creates a development build.
- `bun run build:watch` rebuilds on file changes.
- `bun run dev` runs the dev build with the local server/watch flow from `build.ts`.
- `bun run clean` removes `dist/`.

There is no dedicated `npm test` or `bun test` suite yet. Treat a successful build plus manual browser verification as the baseline check.

## Coding Style & Naming Conventions
This repo uses TypeScript, TSX, and SCSS. Follow the existing style:

- Use tabs for indentation in source files.
- Prefer small, focused modules under `src/novele/core/` and `src/util/`.
- Use `camelCase` for functions and variables, `PascalCase` for types/components, and kebab-style filenames only where already established by the repo.
- Keep comments sparse and practical. Preserve the current style of targeted `biome-ignore` comments when a lint suppression is necessary.

## Testing Guidelines
Validate changes with `bun run build`, then exercise the affected userscript behavior in the browser. For extraction or queue changes, test against a real supported novel page and confirm:

- chapter links still resolve,
- queued fetches complete,
- parsed content renders correctly,
- storage usage does not regress unexpectedly.

If you add automated tests later, place them near the relevant module or under a top-level `tests/` directory and name them after the target module.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit style, for example `feat(novele): ...` and `refactor(novele): ...`. Keep using `type(scope): summary` where scope is the feature area, such as `novele` or `build`.

Pull requests should include a short description of the user-visible change, the commands you ran for validation, and screenshots or short recordings for UI changes. Link the relevant issue when one exists.
