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

Backward compatibility is not required. Remove obsolete APIs, legacy data conversion, and compatibility fallbacks when changing the affected code. Keep historical database migrations unchanged; use new migrations to reach the current schema. Preserve security and current data integrity.

## Verification Guidelines

For routine code changes, verify that the affected targets build. Run `npm run build` for the Chrome and Firefox extensions, and `npm run build:pages` when the tablet site is affected. These commands include typechecking. The user performs actual behavior checks; agents do not need to run tests, browser checks, or UI automation. Report the build result and leave behavior verification to the user.

If the user explicitly requests computer-use UI checks, read [docs/computer-use.md](docs/computer-use.md) first.

## Commit & Pull Request Guidelines

History primarily uses short imperative subjects, such as `Fix Firefox restore messaging`; occasional `feat:` prefixes also appear. Keep commits focused. PRs should describe behavior changes, link relevant issues, and list build validation performed. Include screenshots for UI changes when provided by the user.

## Security & Configuration

The Supabase project URL and publishable key are embedded in `src/shared/build-config.ts`; never embed a `service_role` key. Preserve user-scoped Row Level Security. Add incremental schema changes under `supabase/migrations/`.

## Database Changes & Releases

Use the repository skill [.agents/skills/tab-saver-release/SKILL.md](.agents/skills/tab-saver-release/SKILL.md) for database changes and releases. Production DB migrations are deployed through the existing Supabase GitHub Integrations connection to `nokia215/tab_ext`, working directory `.`, production branch `main`, with Deploy to production enabled. Do not apply production migrations directly with `supabase db push` or bypass a failed integration with the CLI.

Add a new migration and update `sql/schema.sql`; keep historical migrations unchanged. Validate the change, update both package versions, commit, tag the same commit as `v<version>`, and push `main` and that tag when release is authorized. The branch push triggers DB deployment; the tag identifies the release. Verify GitHub checks, Pages deployment, Supabase migration history, and the resulting DB schema. Report inaccessible or unverified results explicitly.
