#!/usr/bin/env node

import { execSync, execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AGENT_RUNNER = join(__dirname, "agent-runner.mjs");

// Parse args: positional strings are tasks, flags are options
const args = process.argv.slice(2);
const tasks = [];
const flags = [];

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    flags.push(args[i]);
    // consume the value if it's a key-value flag
    if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
      flags.push(args[i + 1]);
      i++;
    }
  } else {
    tasks.push(args[i]);
  }
}

const { values } = parseArgs({
  args: flags,
  options: {
    cwd: { type: "string", default: process.cwd() },
    model: { type: "string", default: "claude-sonnet-4-5-20250929" },
    "session-name": { type: "string", default: "" },
    layout: { type: "string", default: "tiled" },
  },
});

const cwd = values.cwd;
const model = values.model;
const layout = values.layout;
const sessionName =
  values["session-name"] || `claude-${Date.now().toString(36)}`;
const statusDir = `/tmp/claude-tmux-${sessionName}`;

if (tasks.length === 0) {
  console.error("Usage: claude-tmux [options] \"task 1\" \"task 2\" ...");
  console.error("");
  console.error("Options:");
  console.error("  --cwd <path>           Working directory (default: cwd)");
  console.error(
    "  --model <model>        Model name (default: claude-sonnet-4-5-20250929)"
  );
  console.error("  --session-name <name>  Tmux session name");
  console.error(
    "  --layout <layout>      Tmux layout (default: tiled)"
  );
  process.exit(1);
}

// Validate tmux is installed
try {
  execFileSync("which", ["tmux"], { stdio: "pipe" });
} catch {
  console.error(
    "Error: tmux is not installed. Install it with: brew install tmux"
  );
  process.exit(1);
}

// Check session name not taken
try {
  execFileSync("tmux", ["has-session", "-t", sessionName], { stdio: "pipe" });
  // If we get here, the session exists
  console.error(`Error: tmux session "${sessionName}" already exists.`);
  process.exit(1);
} catch {
  // Session doesn't exist — good
}

function buildAgentCmd(taskText, paneIndex) {
  const escaped = taskText.replace(/'/g, "'\\''");
  return [
    "node",
    AGENT_RUNNER,
    "--task",
    `'${escaped}'`,
    "--cwd",
    cwd,
    "--pane-index",
    String(paneIndex),
    "--total-panes",
    String(tasks.length),
    "--model",
    model,
    "--status-dir",
    statusDir,
  ].join(" ");
}

// Create tmux session with first pane
const firstCmd = buildAgentCmd(tasks[0], 0);
execFileSync(
  "tmux",
  ["new-session", "-d", "-s", sessionName, "-x", "200", "-y", "50"],
  { stdio: "pipe" }
);

// Send the first agent command to the first pane
execFileSync(
  "tmux",
  ["send-keys", "-t", `${sessionName}:0.0`, firstCmd, "Enter"],
  { stdio: "pipe" }
);

// Create additional panes for remaining tasks
for (let i = 1; i < tasks.length; i++) {
  execFileSync(
    "tmux",
    ["split-window", "-t", `${sessionName}:0`],
    { stdio: "pipe" }
  );

  const cmd = buildAgentCmd(tasks[i], i);
  execFileSync(
    "tmux",
    ["send-keys", "-t", `${sessionName}:0.${i}`, cmd, "Enter"],
    { stdio: "pipe" }
  );

  // Re-apply layout after each split to keep panes balanced
  execFileSync(
    "tmux",
    ["select-layout", "-t", `${sessionName}:0`, layout],
    { stdio: "pipe" }
  );
}

// Create status directory for agent completion tracking
mkdirSync(statusDir, { recursive: true });

// Print session info so the caller knows what was created
console.log(sessionName);

// Open the tmux session for the user
if (process.stdin.isTTY) {
  // Interactive terminal — attach directly
  const inTmux = !!process.env.TMUX;
  if (inTmux) {
    execFileSync("tmux", ["switch-client", "-t", sessionName], {
      stdio: "inherit",
    });
  } else {
    execFileSync("tmux", ["attach-session", "-t", sessionName], {
      stdio: "inherit",
    });
  }
} else {
  // Non-interactive (e.g. spawned by Claude Code) — open a new terminal window
  const termProgram = process.env.TERM_PROGRAM || "";
  const attachCmd = `tmux attach -t ${sessionName}`;

  if (termProgram.includes("iTerm")) {
    execSync(
      `osascript -e 'tell application "iTerm2" to create window with default profile command "${attachCmd}"'`,
      { stdio: "pipe" }
    );
  } else {
    // Default: macOS Terminal.app
    execSync(
      `osascript -e 'tell application "Terminal" to do script "${attachCmd}"'`,
      { stdio: "pipe" }
    );
  }
}

// Poll for agent completion
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function allAgentsDone() {
  for (let i = 0; i < tasks.length; i++) {
    if (!existsSync(join(statusDir, `agent-${i}.json`))) {
      return false;
    }
  }
  return true;
}

while (!allAgentsDone()) {
  await sleep(2000);
}

// Read all status files and print summary
const results = [];
for (let i = 0; i < tasks.length; i++) {
  const filePath = join(statusDir, `agent-${i}.json`);
  try {
    results.push(JSON.parse(readFileSync(filePath, "utf-8")));
  } catch {
    results.push({ task: tasks[i], status: "error", summary: "Could not read status file" });
  }
}

console.log(`\nAll ${tasks.length} agent${tasks.length === 1 ? "" : "s"} completed.\n`);

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const durationStr = r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "?";
  if (r.status === "done") {
    const costStr = r.cost_usd != null ? `, $${r.cost_usd.toFixed(4)}` : "";
    const turnsStr = r.num_turns ? `, ${r.num_turns} turns` : "";
    console.log(`Agent ${i + 1}: done (${durationStr}${costStr}${turnsStr})`);
  } else {
    console.log(`Agent ${i + 1}: error (${durationStr})`);
  }
  console.log(`  Task: ${r.task}`);
  if (r.summary) {
    console.log(`  Summary: ${r.summary}`);
  }
  console.log("");
}

// Clean up status directory
try {
  rmSync(statusDir, { recursive: true, force: true });
} catch {
  // Ignore cleanup errors
}
