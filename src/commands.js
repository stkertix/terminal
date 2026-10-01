const PROMPT = "user@host:~$";

const FILES = {
  "README.txt": "Terminal simulator.\nType help to list commands.\n",
};

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

  if (!command) {
    return { command: "", output: null, clear: false, close: false, browse: null };
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

  const result = handler(args, state, { now });
  if (result && typeof result === "object") {
    return {
      command,
      output: result.output ?? null,
      clear: Boolean(result.clear),
      close: Boolean(result.close),
      browse: result.browse ?? null,
    };
  }

  return { command, output: result, clear: false, close: false, browse: null };
}

export { PROMPT, HELP };
