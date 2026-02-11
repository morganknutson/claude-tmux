const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const COLORS = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  white: "\x1b[37m",
};

const PALETTE = ["cyan", "green", "magenta", "yellow", "blue", "red"];

export function colorForPane(index) {
  return PALETTE[index % PALETTE.length];
}

export function bold(text) {
  return `${BOLD}${text}${RESET}`;
}

export function dim(text) {
  return `${DIM}${text}${RESET}`;
}

export function color(name, text) {
  return `${COLORS[name] || ""}${text}${RESET}`;
}

export function boldColor(name, text) {
  return `${BOLD}${COLORS[name] || ""}${text}${RESET}`;
}

export function separator(colorName, width = 60) {
  return color(colorName, "─".repeat(width));
}

export function formatToolUse(block) {
  const name = block.name || "unknown";

  if (name === "Bash" || name === "bash") {
    const cmd = block.input?.command || "";
    const short = cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
    return dim(`  $ ${short}`);
  }
  if (name === "Read" || name === "read") {
    return dim(`  Reading: ${block.input?.file_path || "?"}`);
  }
  if (name === "Write" || name === "write") {
    return dim(`  Writing: ${block.input?.file_path || "?"}`);
  }
  if (name === "Edit" || name === "edit") {
    return dim(`  Editing: ${block.input?.file_path || "?"}`);
  }
  if (name === "Glob" || name === "glob") {
    return dim(`  Glob: ${block.input?.pattern || "?"}`);
  }
  if (name === "Grep" || name === "grep") {
    return dim(`  Grep: ${block.input?.pattern || "?"}`);
  }
  if (name === "Task" || name === "task") {
    return dim(`  Task: ${block.input?.description || "?"}`);
  }

  return dim(`  Tool: ${name}`);
}

export function formatMessage(message, paneColor) {
  const lines = [];

  switch (message.type) {
    case "system": {
      if (message.subtype === "init") {
        lines.push(dim(`  Model: ${message.model || "?"}`));
        lines.push(dim(`  Tools: ${message.tools?.length || 0} available`));
      }
      break;
    }

    case "assistant": {
      if (message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text) {
            lines.push(color(paneColor, block.text));
          } else if (block.type === "tool_use") {
            lines.push(formatToolUse(block));
          }
        }
      }
      break;
    }

    case "user":
      // Skip tool results — too verbose
      break;

    case "result": {
      lines.push("");
      lines.push(separator(paneColor));
      lines.push(
        boldColor(paneColor, "  Done!")
      );
      if (message.duration_ms) {
        lines.push(dim(`  Duration: ${(message.duration_ms / 1000).toFixed(1)}s`));
      }
      if (message.cost_usd) {
        lines.push(dim(`  Cost: $${message.cost_usd.toFixed(4)}`));
      }
      if (message.num_turns) {
        lines.push(dim(`  Turns: ${message.num_turns}`));
      }
      lines.push(separator(paneColor));
      break;
    }

    case "tool_use_summary": {
      if (message.text) {
        lines.push(dim(`  ${message.text}`));
      }
      break;
    }
  }

  return lines;
}
