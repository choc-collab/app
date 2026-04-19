# Changelog

All notable user-facing changes to Choc-collab are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (pre-1.0 — minor bumps may include breaking changes).

## [Unreleased]

### Added
- **Persistent storage request on app boot** — ChocCollab now calls `navigator.storage.persist()` on load so browsers that support it won't evict your IndexedDB under storage pressure. Settings → Backup shows a new **Device Storage** card with the current persisted state, usage/quota, and a manual "Request persistent storage" button for browsers (Safari, Firefox) that only grant the request on a user gesture.
- **Auto safety-snapshot before destructive operations** — both **Restore from backup** and **Delete all data** now download a timestamped JSON snapshot of your current data before wiping the database. Filenames are prefixed `choc-collab-snapshot-before-restore-` or `choc-collab-snapshot-before-clear-` so you can tell them apart from manual exports. A misclick or a bad backup file is now always recoverable from the Downloads folder.
- **Pre-upgrade safety snapshot** — when ChocCollab ships a new app version that changes the on-disk data format, the app now downloads `choc-collab-snapshot-before-upgrade-v{old}-to-v{new}-{date}.json` *before* the migration runs. A one-time green banner appears on the Settings page after the upgrade explaining what the file is and how to restore it.

### Changed
- Settings → Backup copy updated to mention that a safety snapshot auto-downloads before any destructive operation.

## [0.1.0] — 2026-04-19

### Added
- Initial public release.
