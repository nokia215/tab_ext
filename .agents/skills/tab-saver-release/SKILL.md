---
name: tab-saver-release
description: Prepare and validate database changes or releases for the Tab Saver repository, then publish an authorized release through its existing Supabase GitHub Integrations workflow.
---

# Tab Saver releases

Apply this skill only to `nokia215/tab_ext`. Follow the repository's AGENTS.md and README for validation and build commands.

## Database changes

- Inspect application callers, SQL functions, policies, triggers, and tests before changing the schema. Preserve user-scoped RLS and data unrelated to the requested change.
- Add an incremental SQL file under `supabase/migrations/` and update `sql/schema.sql`. Never rewrite historical migrations.
- Production deployment uses the existing Supabase GitHub Integrations connection: repository `nokia215/tab_ext`, working directory `.`, production branch `main`, Deploy to production enabled. Confirm these settings before publishing a DB change; do not silently change them.
- Do not run `supabase db push` against production or use direct SQL writes to bypass Integrations. `npm run db:migrate:status` and `npm run db:migrate:check` are inspection commands; `npm run db:migrate:new -- <name>` creates a local migration.

## Release

- Run `npm test` and applicable typechecks, builds, and Firefox package linting. Use a disposable DB for SQL checks when available; explicitly report checks that cannot be performed.
- Synchronize the release version in `package.json` and `package-lock.json`. Follow existing patch-version and `v<version>` tag conventions unless the task specifies otherwise.
- Review the diff and commit only the intended changes. When publishing is authorized, tag the same commit and push `main` and that specific tag without force-pushing. Preparing a release does not itself authorize publishing it.
- The `main` push triggers Supabase DB deployment and GitHub Pages deployment. The tag identifies the release; it does not trigger DB deployment.
- Verify GitHub validation and Pages deployment for the pushed commit, Supabase migration history, and the resulting DB schema through read-only inspection. A successful push alone is not a successful DB deployment.
- If deployment fails, inspect the failure and make a focused corrective commit when authorized. Do not repeatedly push unchanged content, alter migration history, or switch to direct production writes. Report a concrete blocker if logs or DB verification are inaccessible.

Reference: [Supabase GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration).
