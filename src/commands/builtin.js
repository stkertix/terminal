import { ALGORITHMS } from "./algorithm/registry.js";
import { COMPILERS } from "./compile/command.js";
import { CHARTS } from "./monitor/command.js";
import { GAMES } from "./play/command.js";

export const PROMPT = "user@host:~$";

const FILES = {
  "README.txt": "Terminal simulator.\nType help to list commands.\n",
};

const COMPILER_CHOICES = COMPILERS.join("|");

export const HELP = [
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
  `download  Simulate parallel downloads`,
  `compile   [${COMPILER_CHOICES} MINUTES]`,
  `install   ${COMPILER_CHOICES} MINUTES LOOPS`,
  `monitor   [${CHARTS.join("|")}]`,
  `algorithm [${ALGORITHMS.join("|")}]`,
  `play      [${GAMES.join("|")}]`,
  "tarot     FULL NAME YYYY-MM-DD",
  "top       Show the Chrome task manager",
  "htop      Show the Chrome task manager",
  "open      Open a page in this pane",
  "exit      Close the window",
].join("\n");

function cat(args) {
  if (args.length === 0) return "cat: missing file operand";
  return args
    .map((path) => {
      if (Object.hasOwn(FILES, path)) return FILES[path].replace(/\n$/, "");
      return `cat: ${path}: No such file or directory`;
    })
    .join("\n");
}

export const builtinHandlers = {
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
  exit() {
    return { close: true };
  },
};
