import { ALGORITHMS } from "./algorithms.js";
import { GAMES } from "./games.js";

const PROMPT = "user@host:~$";

const FILES = {
  "README.txt": "Terminal simulator.\nType help to list commands.\n",
};

const COMPILERS = ["java", "npm", "go", "rust", "gcc", "dotnet", "python"];
const CHARTS = ["bar-horizontal", "bar-vertical", "line", "heatmap"];
const COMPILER_CHOICES = COMPILERS.join("|");

function compilerName(roll) {
  const index = Math.min(COMPILERS.length - 1, Math.floor(roll() * COMPILERS.length));
  return COMPILERS[index];
}

function expectedCompiler(command, name) {
  const list = COMPILERS.join(", ").replace(/, ([^,]*)$/, ", or $1");
  return `${command}: ${name}: expected ${list}`;
}

const HELP = [
  "help      Show this message",
  "clear     Clear the screen",
  "echo      Print arguments",
  "date      Show the local date and time",
  "history   Show commands from this session",
  "whoami    Print the current user",
  "hostname  Print the host name",
  "pwd       Print the working directory",
  "ls        List files",
  "cat       Print a file",
  "uname     Print system information",
  "download  Simulate parallel downloads",
  `compile   [${COMPILER_CHOICES} MINUTES]`,
  `install   ${COMPILER_CHOICES} MINUTES LOOPS`,
  `monitor   [${CHARTS.join("|")}]`,
  `algorithm [${ALGORITHMS.join("|")}]`,
  `play      [${GAMES.join("|")}]`,
  "top       Show the Chrome task manager",
  "htop      Show the Chrome task manager",
  "open      Open a page in this pane",
  "exit      Close the window",
].join("\n");

function parsePageUrl(value) {
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url;
}

function cat(args) {
  if (args.length === 0) return "cat: missing file operand";
  return args
    .map((path) => {
      if (Object.hasOwn(FILES, path)) return FILES[path].replace(/\n$/, "");
      return `cat: ${path}: No such file or directory`;
    })
    .join("\n");
}

const HANDLERS = {
  help() {
    return HELP;
  },
  clear() {
    return { clear: true };
  },
  echo(args) {
    return args.join(" ");
  },
  date(_args, _state, deps) {
    return deps.now().toString();
  },
  history(_args, state) {
    return state.history
      .map((command, index) => `${String(index + 1).padStart(4)}  ${command}`)
      .join("\n");
  },
  whoami() {
    return "user";
  },
  hostname() {
    return "host";
  },
  pwd() {
    return "/home/user";
  },
  ls() {
    return "README.txt";
  },
  cat(args) {
    return cat(args);
  },
  uname() {
    return "Linux host 6.1.0-simulator #1 SMP x86_64 GNU/Linux";
  },
  download(args) {
    if (args.length > 1) return "download: too many arguments";
    const name = args[0] || "";
    if (name && !/^[A-Za-z0-9._-]+$/.test(name)) return `download: ${name}: invalid name`;
    return { download: name || true };
  },
  compile(args, _state, deps) {
    if (args.length === 0) {
      const roll = deps.random ?? Math.random;
      const tool = compilerName(roll);
      const minutes = 1 + Math.floor(roll() * 25);
      return { compile: { tool, minutes, loops: 1 } };
    }
    if (args.length !== 2) return `compile: usage: compile [${COMPILER_CHOICES} MINUTES]`;
    const tool = args[0].toLowerCase();
    if (!COMPILERS.includes(tool)) return expectedCompiler("compile", args[0]);
    if (!/^[1-9]\d*$/.test(args[1])) return `compile: ${args[1]}: invalid duration`;
    const minutes = Number(args[1]);
    if (minutes > 1440) return `compile: ${args[1]}: duration is too long`;
    return { compile: { tool, minutes, loops: 1 } };
  },
  install(args) {
    if (args.length !== 3) return `install: usage: install ${COMPILER_CHOICES} MINUTES LOOPS`;
    const tool = args[0].toLowerCase();
    if (!COMPILERS.includes(tool)) return expectedCompiler("install", args[0]);
    if (!/^[1-9]\d*$/.test(args[1])) return `install: ${args[1]}: invalid duration`;
    if (!/^[1-9]\d*$/.test(args[2])) return `install: ${args[2]}: invalid loops`;
    const minutes = Number(args[1]);
    const loops = Number(args[2]);
    if (minutes > 1440) return `install: ${args[1]}: duration is too long`;
    if (loops > 100) return `install: ${args[2]}: too many loops`;
    return { compile: { tool, minutes, loops } };
  },
  monitor(args) {
    if (args.length > 1) return `monitor: usage: monitor [${CHARTS.join("|")}]`;
    const chart = args[0] || "line";
    if (!CHARTS.includes(chart)) return `monitor: ${args[0]}: expected ${CHARTS.join(", ").replace(/, ([^,]*)$/, ", or $1")}`;
    return { monitor: chart };
  },
  algorithm(args) {
    if (args.length > 1) return `algorithm: usage: algorithm [${ALGORITHMS.join("|")}]`;
    const name = args[0] || "matrix";
    if (!ALGORITHMS.includes(name)) {
      const list = ALGORITHMS.join(", ").replace(/, ([^,]*)$/, ", or $1");
      return `algorithm: ${args[0]}: expected ${list}`;
    }
    return { algorithm: name };
  },
  play(args) {
    if (args.length > 1) return `play: usage: play [${GAMES.join("|")}]`;
    const name = args[0] || "soccer";
    if (!GAMES.includes(name)) {
      const list = GAMES.join(", ").replace(/, ([^,]*)$/, ", or $1");
      return `play: ${args[0]}: expected ${list}`;
    }
    return { play: name };
  },
  top(args) {
    if (args.length > 0) return "top: too many arguments";
    return { top: true };
  },
  htop(args) {
    if (args.length > 0) return "htop: too many arguments";
    return { top: true };
  },
  open(args) {
    if (args.length === 0) return "open: missing url";
    if (args.length > 1) return "open: too many arguments";
    const url = parsePageUrl(args[0]);
    if (!url) return "open: invalid url";
    return { browse: url.href };
  },
  exit() {
    return { close: true };
  },
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
      top: Boolean(result.top),
    };
  }

  return { command, output: result, clear: false, close: false, browse: null, download: null };
}

export { PROMPT, HELP, COMPILERS };
