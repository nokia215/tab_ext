# Repository Guidelines

## Project Structure & Module Organization

Tab Saver is a Chrome/Firefox extension built with WXT and Svelte. It saves and restores tabs through Supabase, with a tablet dashboard hosted on GitHub Pages.

- `entrypoints/`, `wxt.config.ts`: WXT extension entrypoints and manifest configuration.
- `src/background/`: extension background logic.
- `src/popup/`, `src/newtab/`, `src/tablet/`: UI entry points, views, styles, and applicable state models.
- `src/shared/`: browser adapters, storage, Supabase access, tab operations, rendering, and filtering helpers. Reuse these across interfaces.
- `public/`: static assets and icons; `sql/schema.sql`: initial database setup; `supabase/migrations/`: incremental database changes.
- `docs/ui-guidelines.md`: UI design rules. Generated output goes into `dist/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run typecheck`: check strict TypeScript without emitting files.
- `npm run build`: typecheck Svelte/TypeScript and build both browser extensions.
- `npm run build:chrome` / `npm run build:firefox`: build one WXT browser target; these commands do not run typechecking.
- `npm run build:pages`: typecheck and build the tablet site into `dist/pages/`.
- `npm run dev:chrome` / `npm run dev:firefox`: watch UI builds after an initial full browser build. Rebuild explicitly for background or manifest changes.
- `npm run run:firefox`: launch the built extension; `npm run lint:firefox`: validate its package.

Load `dist/chrome-mv3/` as an unpacked extension in Chrome. `npm run release` builds both extensions and packages the Firefox XPI.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted TypeScript strings, semicolons, camelCase functions/variables, and PascalCase types/interfaces. Use kebab-case filenames for shared modules, such as `group-age.ts`. Follow existing ES module and `import type` patterns. No formatter or general-purpose linter is configured. Keep UI changes consistent with `docs/ui-guidelines.md`.

## Testing Guidelines

Run `npm test`, typechecking, affected builds, and Firefox package linting when applicable. Manually verify changed save, restore, search, archive, and authentication flows in affected browsers; check tablet behavior for shared UI changes. Record verification steps in the PR.

## Commit & Pull Request Guidelines

History primarily uses short imperative subjects, such as `Fix Firefox restore messaging`; occasional `feat:` prefixes also appear. Keep commits focused. PRs should describe behavior changes, link relevant issues, list validation performed, and include screenshots for UI changes.

## Security & Configuration

The Supabase project URL and publishable key are embedded in `src/shared/build-config.ts`; never embed a `service_role` key. Preserve user-scoped Row Level Security. Add incremental schema changes under `supabase/migrations/`.
