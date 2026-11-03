# Syncing with upstream Mailspring

BetterMailspring is an offline-only fork of
[Foundry376/Mailspring](https://github.com/Foundry376/Mailspring). Upstream merges often, so
the fork is arranged to keep its footprint in upstream's files small.

## Merging upstream

```bash
scripts/sync-upstream.sh
```

Merge rather than rebase: the merge records which upstream commit the fork has reached, and
rerere replays conflict resolutions from earlier merges.

The script creates a `sync/upstream-<date>` branch, merges `upstream/master`, and:

- keeps fork-deleted files deleted, listing any that upstream changed
- regenerates `package-lock.json` and `app/package-lock.json` if they conflict
- lists new upstream lines that look cloud-related
- turns on rerere and `zdiff3` conflict markers for this clone

It stops before committing. Resolve what is left, run the checks it prints, then commit.

Read the list of kept-deleted files. A change there can be a bug fix that also applies to code
the fork kept.

## Rules that keep merges easy

- **Put new code in new files.** Call it from upstream code with as few lines as possible.
- **Never reformat upstream code.** Prettier fixes in `app/src/browser/main.js` or
  `app/build/build.js` conflict for no benefit.
- **Prefer disabling to deleting.** If code becomes dead once a feature is off, leaving it
  costs nothing. Delete it only if it would send data off the device or it needs a removed
  module.
- **Do not reindent upstream blocks.** Hide or skip them another way, as `no-menu` does for
  `ButtonDropdown`.
- **Leave `app/lang/*.json` alone.** `localized()` falls back to the English string, so new
  strings work without an entry.
- **Add styles to `app/static/style/fork.less`** or a file it imports, not `workspace.less`.

## Where the fork lives

| Area | Location |
| --- | --- |
| Styles | `app/static/style/fork.less`, `linux-headerbar.less`, `components/styled-menu.less` |
| Menus | `app/src/styled-menu.ts`, installed by one line in `window-bootstrap.ts` |
| Harper | `app/src/harper-*.ts`, `composer-grammar-check/`, `preferences/lib/tabs/harper-*` |
| Account backup and storage | `app/src/account-backup.ts`, `account-storage-usage.ts`, `preferences/lib/tabs/preferences-accounts-backup.tsx`, `account-storage-label.tsx` |
| Mozilla ISPDB lookup | `onboarding/lib/mozilla-ispdb.ts`, called from `TryThunderbirdAutoconfig` |
| Arch package | `app/build/create-arch-package.js`, `app/build/resources/linux/arch/` |
| Branding | `app/package.json` names, read through `packageJSON` and `pkg` |

## Intentional differences that remain

These edits to upstream files are expected to conflict now and then. Keep the fork's side.

- **Removed cloud features:** Mailspring ID, subscriptions, translation, thread and view sharing,
  link tracking, the Views agent, Sentry reporting, and auto-update.
- **`mailsync-process.ts`:** mailsync gets no identity or identity server, so nothing
  authenticates to Mailspring's servers.
- **`app/build/build.js`, `app/src/browser/`:** names come from `package.json`, so they follow
  the branding. Sentry source map upload stays in `build.js`, but only runs if
  `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are set.
- **`composer-editor.tsx`:** `spellCheck={false}`, plus Harper's editor registration.
