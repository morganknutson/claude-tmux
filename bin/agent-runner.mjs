#!/usr/bin/env node

import { query } from "@anthropic-ai/claude-agent-sdk";
import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  boldColor,
  color,
  colorForPane,
  dim,
  formatMessage,
  separator,
} from "../lib/format.mjs";

const { values } = parseArgs({
  options: {
    task: { type: "string" },
    cwd: { type: "string", default: process.cwd() },
    "pane-index": { type: "string", default: "0" },
    "total-panes": { type: "string", default: "1" },
    model: { type: "string", default: "claude-sonnet-4-5-20250929" },
    "status-dir": { type: "string", default: "" },
  },
});

const task = values.task;
const cwd = values.cwd;
const paneIndex = parseInt(values["pane-index"], 10);
const totalPanes = parseInt(values["total-panes"], 10);
const model = values.model;
const statusDir = values["status-dir"];

if (!task) {
  console.error("Error: --task is required");
  process.exit(1);
}

const paneColor = colorForPane(paneIndex);

// Print header banner
console.log("");
console.log(separator(paneColor));
console.log(
  boldColor(paneColor, `  Agent ${paneIndex + 1}/${totalPanes}`)
);
console.log(color(paneColor, `  Task: ${task}`));
console.log(dim(`  CWD: ${cwd}`));
console.log(dim(`  Model: ${model}`));
console.log(separator(paneColor));
console.log("");

function writeStatus(data) {
  if (!statusDir) return;
  try {
    mkdirSync(statusDir, { recursive: true });
    writeFileSync(
      join(statusDir, `agent-${paneIndex}.json`),
      JSON.stringify(data, null, 2) + "\n"
    );
  } catch (e) {
    console.error(dim(`  Warning: could not write status file: ${e.message}`));
  }
}

try {
  let lastAssistantText = "";
  let resultMeta = {};

  for await (const message of query({
    prompt: task,
    options: {
      cwd,
      model,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: { type: "preset", preset: "claude_code" },
      maxTurns: 50,
    },
  })) {
    const lines = formatMessage(message, paneColor);
    for (const line of lines) {
      console.log(line);
    }

    // Capture the last assistant text for the summary
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text) {
          lastAssistantText = block.text;
        }
      }
    }

    // Capture result metadata
    if (message.type === "result") {
      resultMeta = {
        duration_ms: message.duration_ms || 0,
        cost_usd: message.cost_usd || 0,
        num_turns: message.num_turns || 0,
      };
    }
  }

  writeStatus({
    task,
    status: "done",
    summary: lastAssistantText.slice(0, 500),
    ...resultMeta,
  });
} catch (err) {
  console.error(boldColor("red", `\n  Error: ${err.message}`));
  if (err.stack) {
    console.error(dim(err.stack));
  }
  writeStatus({
    task,
    status: "error",
    summary: `Error: ${err.message}`.slice(0, 500),
    duration_ms: 0,
    cost_usd: 0,
    num_turns: 0,
  });
  process.exit(1);
}
