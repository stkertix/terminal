import { HELP, PROMPT, builtinHandlers } from "./builtin.js";
import { algorithmCommand } from "./algorithm/command.js";
import { compileCommand, installCommand, COMPILERS } from "./compile/command.js";
import { downloadCommand } from "./download/command.js";
import { monitorCommand } from "./monitor/command.js";
import { openCommand } from "./open/command.js";
import { playCommand } from "./play/command.js";
import { tarotCommand } from "./tarot/command.js";
import { htopCommand, topCommand } from "./tasks/command.js";

const HANDLERS = {
  ...builtinHandlers,
  download: downloadCommand,
  compile: compileCommand,
  install: installCommand,
  monitor: monitorCommand,
  algorithm: algorithmCommand,
  play: playCommand,
  tarot: tarotCommand,
  top: topCommand,
  htop: htopCommand,
  open: openCommand,
};

export function createSession() {
  return { history: [] };
}

export function execute(line, state, deps = {}) {
  const command = line.trim();
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;

  if (!command) {
    return { command: "", output: null, clear: false, close: false, browse: null, download: null };
  }

  state.history.push(command);
  const parts = command.split(/\s+/);
  const name = parts[0];
  const args = parts.slice(1);
  const handler = HANDLERS[name];

  if (!handler) {
    return {
      command,
      output: `${name}: command not found`,
      clear: false,
      close: false,
    };
  }

  const result = handler(args, state, { now, random });
  if (result && typeof result === "object") {
    return {
      command,
      output: result.output ?? null,
      clear: Boolean(result.clear),
      close: Boolean(result.close),
      browse: result.browse ?? null,
      download: result.download ?? null,
      compile: result.compile ?? null,
      monitor: typeof result.monitor === "string" ? result.monitor : null,
      algorithm: typeof result.algorithm === "string" ? result.algorithm : null,
      play: typeof result.play === "string" ? result.play : null,
      playPick: Boolean(result.playPick),
      top: Boolean(result.top),
    };
  }

  return { command, output: result, clear: false, close: false, browse: null, download: null };
}

export { PROMPT, HELP, COMPILERS };
