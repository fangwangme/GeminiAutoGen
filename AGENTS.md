# AI Agent Instructions - GeminiAutoGen

## Identity
You are an expert developer agent. Act precisely and maintain code quality.

## Core Rules
- **Workspace**: Main repo (`GeminiAutoGen/`) is the primary workspace. Dev worktree is at `.worktrees/GeminiAutoGen-dev/`.
- **Git**: This is a **Standard Repo + Worktree** setup. Main repo is a working directory, not a bare repo.
- **Tools**: Always use **absolute paths** for file tools.
- **Dependencies**: Use `.shared/` resources (node_modules). Do not reinstall.

## Project Structure

```
GeminiAutoGen/                      # Main repo (active workspace)
├── .git/                           # Standard git directory
├── .shared/                        # Shared resources (not tracked by git)
│   ├── data/
│   ├── extension-dist/             # Build output (vite + copy-static)
│   ├── node_modules/               # Shared dependencies
│   ├── output/
│   ├── releases/
│   ├── package.json
│   └── package-lock.json
├── .worktrees/GeminiAutoGen-dev/     # Dev worktree
│   ├── .git → ../.git/worktrees/GeminiAutoGen-dev  # Worktree git config
│   ├── .shared → ../../.shared     # Symlink to shared resources
│   ├── node_modules → ../../.shared/node_modules
│   └── [project files mirror main]
├── node_modules → .shared/node_modules  # Symlink in main repo
└── [project files]
```

## Key Details

### Symlinks
- **Main repo**: `node_modules → .shared/node_modules`
- **Dev worktree**: 
  - `.shared → ../../.shared`
  - `node_modules → ../../.shared/node_modules`
- All symlinks are ignored by `.gitignore`

### Build Paths
- **vite.config.ts**: Output to `.shared/extension-dist`
- **scripts/copy-static.mjs**: Copies to `.shared/extension-dist`
- Both branches build to the same location

### Git Workflow
- Main branch (`main`) is the primary development branch
- Dev branch (`dev`) is for feature development
- Use standard git commands in both main repo and worktree
- Merge main into dev to sync changes

## Workflows
1. **Modify**: Maintain project style and keep changes atomic.
2. **Verify**: Run tests/builds within the active workspace after changes.
3. **Safety**: NEVER hardcode or log API keys/secrets.

## Release Checklist
When releasing a new version:
1. Update version in BOTH files:
   - `manifest.json` (for Chrome extension version)
   - `package.json` (for npm/version tracking)
2. Commit version bump: `git add manifest.json package.json && git commit -m "chore: bump version to X.Y.Z"`
3. Push to dev: `git push origin dev`
4. Create PR to main and merge
5. Build: `npm run build`
6. Create GitHub release
