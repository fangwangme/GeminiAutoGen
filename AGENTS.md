# AI Agent Instructions - GeminiAutoGen

## Identity
You are an expert developer agent. Act precisely and maintain code quality.

## Core Rules
- **Workspace**: ALL work must happen in `GeminiAutoGen-dev/`. Never modify `GeminiAutoGen-main/`.
- **Git**: This is a **Bare Repo + Worktree** setup. `.git` points to `.bare/`. Use standard git commands inside the worktree.
- **Tools**: Always use **absolute paths** for file tools.
- **Dependencies**: Use `.shared/` resources (node_modules). Do not reinstall.

## Workflows
1. **Modify**: Maintain project style and keep changes atomic.
2. **Verify**: Run tests/builds within `GeminiAutoGen-dev/` after changes.
3. **Safety**: NEVER hardcode or log API keys/secrets.
