# Spell - Development Guide

## Project Overview

Spell is a Linux desktop and Android markdown note-taking app built with Tauri v2 (Rust backend) + React/TypeScript/Tailwind (frontend) + TipTap (WYSIWYG editor) + Tantivy (desktop full-text search).

## Commands

```bash
npm run dev          # Start the complete desktop app
npm run web:dev      # Start the frontend preview only
npm run build        # Build frontend (tsc + vite)
npm run tauri dev    # Run full app in development mode
npm run tauri build  # Build production app
```

## CI

Runs on every push to `main` and on PRs. Validates the frontend and Linux Rust backend on an Ubuntu runner.

## Key Patterns

- All backend operations go through Tauri commands in `src-tauri/src/lib.rs`. Frontend calls them via `invoke()` from `@tauri-apps/api/core`.
- `NotesContext` uses a dual context pattern (data/actions separated) for performance.
- Settings live in two places: app config at `{APP_DATA}/config.json`, per-folder settings at `{NOTES_FOLDER}/.scratch/settings.json`.
- Tauri v2 permissions go in `src-tauri/capabilities/default.json`.

## Coding Conventions

- Clean, minimal code with low technical debt
- Proper React patterns (contexts, hooks, memoization)
- Type-safe with TypeScript throughout
- No commented-out code or TODOs in production code
- Use `React.memo` for expensive list-item components
- Use `useCallback`/`useMemo` for performance-critical paths
- Debounce user-triggered operations (auto-save 300ms, search 150ms, file watcher 500ms, git status 1000ms)
- All operations should be non-blocking (async)
- Error handling with user-friendly messages

## Releasing

1. Bump version in `package.json` and `src-tauri/tauri.conf.json`
2. Commit to `main`, then tag and push: `git tag v0.5.0 && git push origin v0.5.0`
3. The release workflow builds one Linux `.deb` and creates a draft GitHub release
4. Review, edit notes, and publish
