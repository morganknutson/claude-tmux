# claude-tmux

When Claude Code spawns sub-agents, automatically run all in parallel in color-coded tmux panes

Run multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) agents in parallel, each in its own color-coded tmux pane. Give each agent a task and watch them all work simultaneously.

Built on the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

![demo](https://github.com/user-attachments/assets/placeholder)

## Install

```bash
npm install -g claude-tmux
```

Requires [tmux](https://github.com/tmux/tmux) and [Node.js](https://nodejs.org/) 18+.

```bash
# macOS
brew install tmux
```

## Usage

```bash
claude-tmux "task 1" "task 2" "task 3"
```

Each quoted argument becomes a task for a separate Claude agent. A tmux session opens automatically with one pane per agent.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--cwd <path>` | Working directory for all agents | Current directory |
| `--model <model>` | Claude model to use | `claude-sonnet-4-5-20250929` |
| `--layout <layout>` | tmux pane layout (`tiled`, `even-horizontal`, `even-vertical`) | `tiled` |
| `--session-name <name>` | Custom tmux session name | Auto-generated |

### Examples

```bash
# Run two agents side-by-side on different tasks
claude-tmux "fix the failing tests in src/auth" "add input validation to the signup form"

# Use a specific model and working directory
claude-tmux --model claude-opus-4-6 --cwd ~/projects/myapp \
  "refactor the database layer" \
  "write integration tests for the API"

# Horizontal layout with a custom session name
claude-tmux --layout even-horizontal --session-name my-refactor \
  "update all imports to use the new module paths" \
  "remove deprecated API calls" \
  "update the changelog"
```

### Using with Claude Code

Add this to your `CLAUDE.md` to let Claude Code spawn parallel agents via tmux:

```markdown
When spawning multiple agents to work in parallel, use tmux panes. Run:

claude-tmux --cwd <working-directory> "task 1" "task 2" "task 3"
```

When invoked from a non-interactive context (like Claude Code), `claude-tmux` automatically opens a new terminal window (iTerm2 or Terminal.app) with the tmux session attached.

## How it works

1. **`claude-tmux`** parses your tasks and creates a tmux session with one pane per task
2. Each pane runs **`agent-runner`**, which calls the Claude Agent SDK's `query()` function with full `claude_code` tool access and bypass permissions
3. Agents run autonomously (up to 50 turns each) and stream color-coded output to their pane
4. When all agents finish, a summary is printed with duration, cost, and turn count per agent
5. Temporary status files in `/tmp` are cleaned up automatically

## License

MIT
