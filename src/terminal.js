import { createAlgorithm } from "./algorithms.js";
import { COMPILERS, PROMPT, createSession, execute } from "./commands.js";
import { connectLocalShell } from "./shell.js";

const PANE_COUNT = 4;
const LAYOUTS = {
  single: [0],
  columns: [0, 1],
  rows: [0, 1],
  grid: [0, 1, 2, 3],
};

const layoutButtons = [...document.querySelectorAll(".layout-btn")];
let activeWorkspace = null;

const MIN_PANE = 96;
const PANE_PAD = 10;
const PANE_GAP = 10;

function openIndexesOf(workspace) {
  const open = new Set(
    workspace.panes.flatMap((pane, index) => (pane.element.classList.contains("is-open") ? [index] : []))
  );
  return workspace.paneOrder.filter((index) => open.has(index));
}

function openIndexes() {
  return openIndexesOf(activeWorkspace);
}

function setActive(index) {
  activeWorkspace.activeIndex = index;
  activeWorkspace.panes.forEach((pane, paneIndex) => {
    pane.element.classList.toggle("is-active", paneIndex === index);
  });
}

function focusPane(index) {
  const pane = activeWorkspace.panes[index];
  if (!pane || !pane.element.classList.contains("is-open")) return;
  setActive(index);
  if (!activeWorkspace.root.classList.contains("is-current")) return;
  if (pane.element.classList.contains("is-browsing")) return;
  if (pane.element.classList.contains("is-shell")) pane.focusShell();
  else if (pane.element.classList.contains("is-busy")) pane.element.focus();
  else pane.input.focus();
}

function highlightLayout() {
  const key = openIndexes().join(",");
  const selected = LAYOUTS[activeWorkspace.selectedLayout];
  let matched = "custom";
  if (selected && selected.join(",") === key) {
    matched = activeWorkspace.selectedLayout;
  } else {
    for (const [name, indexes] of Object.entries(LAYOUTS)) {
      if (indexes.join(",") === key) {
        matched = name;
        break;
      }
    }
  }
  activeWorkspace.root.dataset.layout = matched;
  activeWorkspace.root.dataset.open = String(openIndexes().length);
  applySplit();
  layoutButtons.forEach((button) => {
    const active = button.dataset.layout === matched;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  activeWorkspace.panes.forEach((pane) => pane.ensureShell());
}

function applyLayout(name) {
  activeWorkspace.selectedLayout = name;
  const indexes = new Set(LAYOUTS[name]);
  activeWorkspace.panes.forEach((pane, index) => {
    pane.element.classList.toggle("is-open", indexes.has(index));
  });
  highlightLayout();
  if (!indexes.has(activeWorkspace.activeIndex)) focusPane(indexes.values().next().value);
  else focusPane(activeWorkspace.activeIndex);
  scheduleSave();
}

function hidePane(index) {
  if (openIndexes().length <= 1) return;
  activeWorkspace.panes[index].disposeShell();
  activeWorkspace.panes[index].element.classList.remove("is-open");
  highlightLayout();
  if (index === activeWorkspace.activeIndex) focusPane(openIndexes()[0]);
  scheduleSave();
}

function createPane(index) {
  const session = createSession();
  const historyNav = { cursor: 0, draft: "" };
  let mode = "idle";
  let preferred = "shell";
  let shellAttempted = false;
  let savedPane = null;
  let shellPort = null;
  let term = null;
  let fitAddon = null;
  let resizeObserver = null;
  let downloadTimer = 0;
  let downloadLogTimers = [];
  let compileTimer = 0;
  let compileLogTimer = 0;
  let compileFitObserver = null;
  let compileLogNode = null;
  let downloadJob = null;
  let compileJob = null;
  let monitorJob = null;
  let monitorTimer = 0;
  let monitorFitObserver = null;
  let algorithmJob = null;
  let algorithmTimer = 0;
  let algorithmFitObserver = null;
  let taskListener = null;
  let taskEvent = null;
  let taskPort = null;

  const element = document.createElement("section");
  element.className = "pane";
  element.tabIndex = -1;

  const bar = document.createElement("header");
  bar.className = "pane-bar";
  bar.draggable = true;
  bar.title = "Drag to move";

  const title = document.createElement("span");
  title.className = "pane-title";
  title.textContent = "user@host";

  const actions = document.createElement("div");
  actions.className = "pane-actions";

  const runtimeSwitch = document.createElement("div");
  runtimeSwitch.className = "runtime-switch";
  runtimeSwitch.setAttribute("role", "group");
  runtimeSwitch.setAttribute("aria-label", "Terminal mode");

  function makeRuntimeButton(value, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "runtime-btn";
    button.dataset.runtime = value;
    button.textContent = label;
    button.title = label;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectRuntime(value);
    });
    return button;
  }

  const shellButton = makeRuntimeButton("shell", "Shell");
  const simulatorButton = makeRuntimeButton("simulator", "Simulator");
  runtimeSwitch.append(shellButton, simulatorButton);

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "pane-back";
  backButton.setAttribute("aria-label", `Back to terminal ${index + 1}`);
  backButton.textContent = "Terminal";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "pane-close";
  closeButton.setAttribute("aria-label", `Close terminal ${index + 1}`);
  closeButton.textContent = "×";

  const screen = document.createElement("div");
  screen.className = "screen";

  const scrollback = document.createElement("div");
  scrollback.className = "scrollback";

  const form = document.createElement("form");
  form.className = "entry";
  form.autocomplete = "off";

  const prompt = document.createElement("span");
  prompt.className = "prompt";
  prompt.textContent = PROMPT;

  const input = document.createElement("input");
  input.className = "command-input";
  input.type = "text";
  input.setAttribute("aria-label", `Command, terminal ${index + 1}`);
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;

  const xtermMount = document.createElement("div");
  xtermMount.className = "xterm-mount";

  const frame = document.createElement("iframe");
  frame.className = "browser";
  frame.title = "Page";
  frame.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
  );
  frame.allowFullscreen = true;

  actions.append(runtimeSwitch, backButton, closeButton);
  bar.append(title, actions);
  form.append(prompt, input);
  scrollback.append(form);
  screen.append(scrollback, xtermMount, frame);
  element.append(bar, screen);

  async function showPage(url) {
    const pageUrl = new URL(url);
    element.dataset.browse = pageUrl.href;
    element.classList.add("is-browsing");
    frame.title = pageUrl.hostname;
    title.textContent = pageUrl.hostname;
    if (globalThis.chrome?.runtime?.sendMessage) {
      try {
        await chrome.runtime.sendMessage({ type: "allow-framing", domain: pageUrl.hostname });
      } catch (error) {
        console.error("Failed to allow framing", error);
      }
    }
    if (frame.getAttribute("src") && frame.getAttribute("src") !== "about:blank") {
      frame.src = "about:blank";
      await new Promise((resolve) => {
        frame.addEventListener("load", resolve, { once: true });
      });
    }
    frame.src = pageUrl.href;
  }

  function hidePage() {
    element.classList.remove("is-browsing");
    delete element.dataset.browse;
    frame.removeAttribute("src");
    title.textContent = "user@host";
    input.focus();
    scheduleSave();
  }

  function scrollToEnd() {
    scrollback.scrollTop = scrollback.scrollHeight;
  }

  function appendInput(command) {
    const row = document.createElement("div");
    row.className = "row";
    const promptLabel = document.createElement("span");
    promptLabel.className = "prompt";
    promptLabel.textContent = PROMPT;
    const typed = document.createElement("span");
    typed.className = "command";
    typed.textContent = command;
    row.append(promptLabel, typed);
    scrollback.insertBefore(row, form);
  }

  function appendOutput(text) {
    const row = document.createElement("div");
    row.className = "output";
    row.textContent = text;
    scrollback.insertBefore(row, form);
  }

  function stopDownload() {
    clearInterval(downloadTimer);
    downloadTimer = 0;
    downloadLogTimers.forEach((timer) => clearTimeout(timer));
    downloadLogTimers = [];
  }

  function stopCompile() {
    clearInterval(compileTimer);
    compileTimer = 0;
    clearTimeout(compileLogTimer);
    compileLogTimer = 0;
    compileFitObserver?.disconnect();
    compileFitObserver = null;
    if (compileLogNode) compileLogNode.style.height = "";
    compileLogNode = null;
    scrollback.classList.remove("is-compile");
  }

  function hasJob() {
    return Boolean(downloadJob || compileJob || monitorJob || algorithmJob);
  }

  function syncBusy() {
    const busy = hasJob();
    element.classList.toggle("is-busy", busy);
    if (busy) {
      if (document.activeElement === input) element.focus();
      return;
    }
    if (mode === "simulator" && element.classList.contains("is-open") && !element.classList.contains("is-browsing")) input.focus();
  }

  function isJobInterrupt(event) {
    if (event.key !== "c" && event.key !== "C") return false;
    if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    if (mode !== "simulator" || !hasJob()) return false;
    if (window.getSelection()?.toString()) return false;
    return true;
  }

  function interruptJobs() {
    downloadJob?.stop();
    compileJob?.stop();
    monitorJob?.stop();
    algorithmJob?.stop();
    downloadJob = null;
    compileJob = null;
    monitorJob = null;
    algorithmJob = null;
    stopDownload();
    stopCompile();
    stopMonitor();
    stopAlgorithm();
    syncBusy();
  }

  function randomLogDelay(min = 50, max = 2000) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function compileLogDelay() {
    const roll = Math.random() * 100;
    if (roll < 50) return 1;
    if (roll < 80) return 50;
    if (roll < 90) return 100;
    if (roll < 95) return 500;
    return 3000;
  }

  function formatRemaining(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  function randomDownloadQueue(seedName) {
    const extensions = ["zip", "tar", "tar.gz", "gzip", "gz", "bak", "tgz", "7z", "rar", "iso"];
    const count = 5 + Math.floor(Math.random() * 6);
    const queue = seedName ? [seedName] : [];
    while (queue.length < count) {
      const extension = extensions[Math.floor(Math.random() * extensions.length)];
      queue.push(`${crypto.randomUUID()}.${extension}`);
    }
    const packageName = () => {
      const extension = extensions[Math.floor(Math.random() * extensions.length)];
      return `${crypto.randomUUID()}.${extension}`;
    };
    const minDuration = 60 * 1000;
    const maxDuration = 25 * 60 * 1000;
    const onion = () => {
      const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
      const bytes = crypto.getRandomValues(new Uint8Array(56));
      let address = "";
      for (let i = 0; i < bytes.length; i += 1) address += alphabet[bytes[i] % alphabet.length];
      return `http://${address}.onion`;
    };
    return queue.map((entry, index) => ({
      name: entry,
      mirror: onion(),
      index: index + 1,
      nextPackage: packageName,
      size: 8 + Math.random() * 900,
      duration: minDuration + Math.floor(Math.random() * (maxDuration - minDuration + 1)),
    }));
  }

  function packageLog(item, ratio, file) {
    const total = item.size.toFixed(1);
    if (ratio >= 1) return `Fetched ${file} [${total} MB]`;
    const received = (item.size * ratio).toFixed(1);
    return `Get:${item.index} ${file} [${received}/${total} MB]`;
  }

  function startDownload(name) {
    stopDownload();
    const items = randomDownloadQueue(typeof name === "string" ? name : "");
    const panel = document.createElement("div");
    panel.className = "output download";
    const title = document.createElement("div");
    title.className = "download-title";
    title.textContent = `Downloading ${items.length} files`;
    panel.append(title);

    const started = performance.now();
    const rows = items.map((item) => {
      const row = document.createElement("div");
      row.className = "download-item is-active";
      const label = document.createElement("div");
      label.className = "download-name";
      label.textContent = item.name;
      const status = document.createElement("div");
      status.className = "download-status";
      status.textContent = `0% · ${formatRemaining(item.duration)}`;
      const url = document.createElement("div");
      url.className = "download-url";
      url.textContent = item.mirror;
      const track = document.createElement("div");
      track.className = "download-track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", "0");
      track.setAttribute("aria-label", item.name);
      const bar = document.createElement("div");
      bar.className = "download-bar";
      const log = document.createElement("div");
      log.className = "download-log";
      const file = item.nextPackage();
      log.textContent = packageLog(item, 0, file);
      track.append(bar);
      row.append(label, status, url, track, log);
      panel.append(row);
      return { ...item, row, status, track, bar, logLine: log, file, done: false };
    });
    scrollback.insertBefore(panel, form);
    scrollToEnd();

    const schedulePackageLog = (item) => {
      const timer = setTimeout(() => {
        downloadLogTimers = downloadLogTimers.filter((id) => id !== timer);
        if (item.done || !item.row.isConnected) return;
        const ratio = Math.min(1, (performance.now() - started) / item.duration);
        if (ratio >= 1) return;
        item.file = item.nextPackage();
        item.logLine.textContent = packageLog(item, ratio, item.file);
        schedulePackageLog(item);
      }, randomLogDelay());
      downloadLogTimers.push(timer);
    };
    rows.forEach(schedulePackageLog);

    downloadJob = {
      stop() {
        let halted = false;
        rows.forEach((item) => {
          if (item.done) return;
          item.done = true;
          halted = true;
          item.row.classList.remove("is-active");
          item.row.classList.add("is-stopped");
          item.status.textContent = "Stopped";
        });
        if (halted) title.textContent = "Stopped";
      },
    };
    syncBusy();

    downloadTimer = setInterval(() => {
      if (!panel.isConnected) {
        if (downloadJob) downloadJob = null;
        stopDownload();
        syncBusy();
        return;
      }
      const elapsed = performance.now() - started;
      let finished = 0;
      rows.forEach((item) => {
        if (item.done) {
          finished += 1;
          return;
        }
        const ratio = Math.min(1, elapsed / item.duration);
        const percent = Math.min(100, Math.floor(ratio * 100));
        item.bar.style.width = `${ratio * 100}%`;
        item.track.setAttribute("aria-valuenow", String(percent));
        if (percent >= 100) {
          item.done = true;
          finished += 1;
          item.row.classList.remove("is-active");
          item.row.classList.add("is-done");
          item.status.textContent = "100% · 0s";
          item.logLine.textContent = packageLog(item, 1, item.file);
          return;
        }
        item.status.textContent = `${percent}% · ${formatRemaining(item.duration - elapsed)}`;
      });
      if (finished >= rows.length) {
        title.textContent = `Downloaded ${rows.length} files`;
        downloadJob = null;
        stopDownload();
        syncBusy();
        scheduleSave();
        return;
      }
      title.textContent = finished === 0 ? `Downloading ${rows.length} files` : `Downloading ${rows.length} files · ${finished} complete`;
    }, 200);
  }

  function compileStamp() {
    const now = new Date();
    const pad = (value, size = 2) => String(value).padStart(size, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}:${pad(now.getMilliseconds(), 3)}`;
    return `${date} ${time}`;
  }

  function logLine(level, text) {
    return { level, message: `[${level.toUpperCase()}] ${text}` };
  }

  function pickLog(lines) {
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function javaCompileLine() {
    const packages = ["com.example.app", "com.example.core", "com.example.net", "com.example.io", "org.example.service"];
    const types = ["Application", "Buffer", "Socket", "Token", "Parser", "Window", "Task", "Stream", "Table", "Lexer", "Runtime", "Config", "Service", "Handler", "Repository"];
    const pkg = packages[Math.floor(Math.random() * packages.length)];
    const type = `${types[Math.floor(Math.random() * types.length)]}${Math.floor(Math.random() * 40)}`;
    const path = `src/main/java/${pkg.replaceAll(".", "/")}/${type}.java`;
    const count = 20 + Math.floor(Math.random() * 180);
    return pickLog([
      logLine("info", `Compiling ${path}`),
      logLine("debug", `Compiling ${count} source files with javac [debug release 17] to target/classes`),
      logLine("warn", `Changes detected - recompiling the module! ${path}`),
      logLine("error", `Failed to compile ${path}`),
    ]);
  }

  function npmCompileLine() {
    const dirs = ["src", "src/core", "src/net", "src/ui", "src/routes", "lib"];
    const stems = ["index", "buffer", "socket", "parser", "window", "task", "stream", "table", "runtime", "config", "service", "handler"];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    const stem = stems[Math.floor(Math.random() * stems.length)];
    const file = `${dir}/${stem}${Math.floor(Math.random() * 40)}.ts`;
    const modules = 10 + Math.floor(Math.random() * 400);
    const size = (8 + Math.random() * 240).toFixed(2);
    const gzip = (Number(size) * 0.32).toFixed(2);
    const hash = crypto.randomUUID().slice(0, 8);
    return pickLog([
      logLine("info", `transforming ${file}`),
      logLine("debug", `${modules} modules transformed.`),
      logLine("info", "rendering chunks..."),
      logLine("debug", "computing gzip size..."),
      logLine("info", `dist/assets/${stem}-${hash}.js   ${size} kB │ gzip: ${gzip} kB`),
      logLine("warn", `${file} is larger than the recommended size`),
      logLine("error", `failed to resolve import from ${file}`),
    ]);
  }

  function goCompileLine() {
    const packages = ["cmd/app", "internal/net", "internal/parser", "internal/store", "pkg/runtime"];
    const files = ["main.go", "socket.go", "parser.go", "buffer.go", "task.go", "config.go"];
    const pkg = packages[Math.floor(Math.random() * packages.length)];
    const file = files[Math.floor(Math.random() * files.length)];
    const version = `v1.${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 20)}`;
    const moduleName = file.replace(".go", "");
    return pickLog([
      logLine("info", `compiling ${pkg}/${file}`),
      logLine("debug", `example.com/app/${pkg}`),
      logLine("debug", `go: downloading example.com/${moduleName} ${version}`),
      logLine("warn", `${pkg}/${file} uses a deprecated API`),
      logLine("error", `${pkg}: build failed`),
    ]);
  }

  function rustCompileLine() {
    const crates = [
      ["app", "0.1.0"],
      ["serde", "1.0.210"],
      ["tokio", "1.40.0"],
      ["libc", "0.2.159"],
      ["regex", "1.11.0"],
      ["clap", "4.5.20"],
    ];
    const [name, version] = crates[Math.floor(Math.random() * crates.length)];
    return pickLog([
      logLine("info", `Compiling ${name} v${version}`),
      logLine("debug", `Fresh ${name} v${version}`),
      logLine("warn", `${name} v${version} will be rejected in a future release`),
      logLine("error", `could not compile ${name} v${version}`),
    ]);
  }

  function gccCompileLine() {
    const files = ["main", "parser", "buffer", "socket", "runtime", "config"];
    const file = files[Math.floor(Math.random() * files.length)];
    return pickLog([
      logLine("info", `gcc -c src/${file}.c -o build/${file}.o`),
      logLine("debug", `gcc -c src/${file}.c -O2 -o build/${file}.o`),
      logLine("debug", `cc -c src/${file}.c -o build/${file}.o`),
      logLine("warn", `src/${file}.c: unused variable`),
      logLine("error", `src/${file}.c: error: undeclared identifier`),
    ]);
  }

  function dotnetCompileLine() {
    const projects = ["App", "Core", "Net", "Service"];
    const name = projects[Math.floor(Math.random() * projects.length)];
    const warnings = Math.floor(Math.random() * 3);
    return pickLog([
      logLine("info", `Restore complete (${(0.4 + Math.random() * 3).toFixed(1)}s)`),
      logLine("debug", `${name} -> /home/user/app/bin/Release/net8.0/${name}.dll`),
      logLine("warn", `${warnings} Warning(s)`),
      logLine("error", `${name}: error CS0103: The name does not exist`),
    ]);
  }

  function pythonCompileLine() {
    const modules = ["app/parser.py", "app/runtime.py", "app/config.py", "app/service.py", "app/__init__.py"];
    const file = modules[Math.floor(Math.random() * modules.length)];
    return pickLog([
      logLine("info", `Compiling '${file}'...`),
      logLine("debug", "Building wheel for app (pyproject.toml)"),
      logLine("info", "creating dist/app-1.0.0-py3-none-any.whl"),
      logLine("debug", "adding 'app/__init__.py'"),
      logLine("warn", `${file}: SyntaxWarning: invalid escape sequence`),
      logLine("error", `error: ${file} failed to compile`),
    ]);
  }

  function compilerProfile(name, duration) {
    const profiles = {
      java: {
        command: "mvn compile",
        target: "target/app.jar",
        success: "BUILD SUCCESS",
        done: logLine("info", "BUILD SUCCESS"),
        line: javaCompileLine,
      },
      npm: {
        command: "npm run build",
        target: "dist/index.js",
        success: "built",
        done: logLine("info", `built in ${formatRemaining(duration)}`),
        line: npmCompileLine,
      },
      go: {
        command: "go build",
        target: "bin/app",
        success: "built",
        done: logLine("info", "built bin/app"),
        line: goCompileLine,
      },
      rust: {
        command: "cargo build",
        target: "target/release/app",
        success: "Finished",
        done: logLine("info", `Finished release [optimized] target(s) in ${formatRemaining(duration)}`),
        line: rustCompileLine,
      },
      gcc: {
        command: "gcc -o app",
        target: "app",
        success: "built",
        done: logLine("info", "built app"),
        line: gccCompileLine,
      },
      dotnet: {
        command: "dotnet build",
        target: "bin/Release/app.dll",
        success: "Build succeeded",
        done: logLine("info", "Build succeeded."),
        line: dotnetCompileLine,
      },
      python: {
        command: "python -m build",
        target: "dist/app.whl",
        success: "built",
        done: logLine("info", "Successfully built app"),
        line: pythonCompileLine,
      },
    };
    return profiles[name] ?? profiles.java;
  }

  function startCompile(spec) {
    stopCompile();
    const duration = spec.minutes * 60 * 1000;
    const tool = COMPILERS.includes(spec.tool) ? spec.tool : "java";
    const profile = compilerProfile(tool, duration);
    const loops = Number.isInteger(spec.loops) && spec.loops > 0 ? spec.loops : 1;
    const target = profile.target;
    const nextLine = profile.line;
    const doneLine = profile.done;
    const running = profile.command;
    let loop = 1;
    const heading = () => (loops > 1 ? `${running} ${loop}/${loops}` : running);
    const panel = document.createElement("div");
    panel.className = "output compile";
    const title = document.createElement("div");
    title.className = "compile-title";
    title.textContent = heading();
    const row = document.createElement("div");
    row.className = "compile-item is-active";
    const label = document.createElement("div");
    label.className = "compile-name";
    label.textContent = target;
    const status = document.createElement("div");
    status.className = "compile-status";
    status.textContent = `0% · ${formatRemaining(duration)}`;
    const track = document.createElement("div");
    track.className = "compile-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", "0");
    track.setAttribute("aria-label", target);
    const bar = document.createElement("div");
    bar.className = "compile-bar";
    const log = document.createElement("div");
    log.className = "compile-log";
    const logLines = [];
    const paintCompileLine = (node, entry) => {
      const line = entry && typeof entry === "object" ? entry : { level: "info", message: String(entry) };
      const marked = /^\[(INFO|DEBUG|WARN|ERROR)\]\s*/.exec(line.message);
      const label = marked ? marked[0].trimEnd() : `[${String(line.level).toUpperCase()}]`;
      const rest = marked ? line.message.slice(marked[0].length) : line.message;
      const level = document.createElement("span");
      level.className = `log-level is-${line.level}`;
      level.textContent = label;
      node.className = "compile-log-line";
      node.replaceChildren(
        document.createTextNode(`[${compileStamp()}] `),
        level,
        document.createTextNode(rest ? ` ${rest}` : "")
      );
    };
    const pushCompileLine = (entry) => {
      if (!logLines.length) return;
      for (let index = 0; index < logLines.length - 1; index += 1) {
        const next = logLines[index + 1];
        logLines[index].replaceChildren(...[...next.childNodes].map((child) => child.cloneNode(true)));
      }
      paintCompileLine(logLines[logLines.length - 1], entry);
    };
    const fitCompileLog = () => {
      if (!panel.isConnected) return;
      const styles = getComputedStyle(scrollback);
      const padTop = parseFloat(styles.paddingTop) || 0;
      const padBottom = parseFloat(styles.paddingBottom) || 0;
      const margin = parseFloat(getComputedStyle(panel).marginTop) + parseFloat(getComputedStyle(panel).marginBottom);
      log.style.height = "0px";
      const room = Math.max(0, scrollback.clientHeight - padTop - padBottom - panel.offsetHeight - margin);
      log.style.height = `${room}px`;
      const probe = logLines[0];
      const lineHeight = probe?.getBoundingClientRect().height || 16;
      const gap = parseFloat(getComputedStyle(log).rowGap) || 0;
      const count = Math.max(1, Math.floor((room + gap) / (lineHeight + gap)));
      while (logLines.length < count) {
        const line = document.createElement("div");
        paintCompileLine(line, nextLine());
        log.append(line);
        logLines.push(line);
      }
      while (logLines.length > count) logLines.shift().remove();
    };
    track.append(bar);
    row.append(label, status, track, log);
    const live = document.createElement("div");
    live.className = "compile-live";
    live.append(title, row);
    panel.append(live);
    scrollback.insertBefore(panel, form);
    scrollback.classList.add("is-compile");
    scrollToEnd();
    compileLogNode = log;

    let started = performance.now();
    const jobStarted = started;
    let done = false;
    let summarized = false;
    const showCompileSummary = (result) => {
      if (summarized || !panel.isConnected) return;
      summarized = true;
      live.hidden = true;
      const summary = document.createElement("div");
      summary.className = `compile-summary ${result === "Stopped" ? "is-stopped" : "is-done"}`;
      const head = document.createElement("div");
      head.className = "compile-summary-title";
      head.textContent = "Summary";
      summary.append(head);
      [
        ["Result", result],
        ["Command", running],
        ["Target", target],
        ["Time", formatRemaining(performance.now() - jobStarted)],
        ["Loops", `${loop}/${loops}`],
        ["Finished", compileStamp()],
      ].forEach(([name, value]) => {
        const line = document.createElement("div");
        line.className = "compile-summary-row";
        const key = document.createElement("span");
        key.className = "compile-summary-key";
        key.textContent = name;
        const item = document.createElement("span");
        item.className = name === "Result" ? "compile-summary-result" : "compile-summary-value";
        item.textContent = value;
        line.append(key, item);
        summary.append(line);
      });
      panel.append(summary);
      scrollToEnd();
    };
    const scheduleCompileLog = () => {
      compileLogTimer = setTimeout(() => {
        compileLogTimer = 0;
        if (done || !panel.isConnected) return;
        if ((performance.now() - started) / duration >= 1) {
          scheduleCompileLog();
          return;
        }
        pushCompileLine(nextLine());
        scheduleCompileLog();
      }, compileLogDelay());
    };
    scheduleCompileLog();

    compileJob = {
      stop() {
        done = true;
        row.classList.remove("is-active");
        row.classList.add("is-stopped");
        status.textContent = "Stopped";
        title.textContent = "Stopped";
        pushCompileLine(logLine("warn", "^C"));
        showCompileSummary("Stopped");
      },
    };
    syncBusy();
    fitCompileLog();
    compileFitObserver = new ResizeObserver(() => fitCompileLog());
    compileFitObserver.observe(scrollback);

    compileTimer = setInterval(() => {
      if (!panel.isConnected) {
        if (compileJob) compileJob = null;
        stopCompile();
        syncBusy();
        return;
      }
      const elapsed = performance.now() - started;
      const ratio = Math.min(1, elapsed / duration);
      const percent = Math.min(100, Math.floor(ratio * 100));
      bar.style.width = `${ratio * 100}%`;
      track.setAttribute("aria-valuenow", String(percent));
      if (percent >= 100) {
        if (loop < loops) {
          pushCompileLine(doneLine);
          loop += 1;
          started = performance.now();
          bar.style.width = "0%";
          track.setAttribute("aria-valuenow", "0");
          status.textContent = `0% · ${formatRemaining(duration)}`;
          title.textContent = heading();
          return;
        }
        done = true;
        row.classList.remove("is-active");
        row.classList.add("is-done");
        status.textContent = "100% · 0s";
        pushCompileLine(doneLine);
        title.textContent = profile.success;
        showCompileSummary(title.textContent);
        compileJob = null;
        stopCompile();
        syncBusy();
        scheduleSave();
        return;
      }
      status.textContent = `${percent}% · ${formatRemaining(duration - elapsed)}`;
    }, 200);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    const digits = unit === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unit]}`;
  }

  function taskTitle(process) {
    const tasks = Array.isArray(process.tasks) ? process.tasks : [];
    const title = tasks.find((task) => typeof task?.title === "string" && task.title)?.title;
    if (!title) return "—";
    if (tasks.length > 1) return `${title} (+${tasks.length - 1})`;
    return title;
  }

  function taskRows(processes) {
    const types = {
      browser: "Browser",
      renderer: "Tab",
      extension: "Extension",
      gpu: "GPU",
      utility: "Utility",
      notification: "Notification",
      plugin: "Plugin",
      nacl: "NaCl",
      worker: "Worker",
      service_worker: "Service worker",
      other: "Other",
    };
    return Object.values(processes || {})
      .filter((process) => process && typeof process === "object")
      .map((process) => ({
        cpu: Number.isFinite(process.cpu) ? process.cpu : null,
        memory: Number.isFinite(process.privateMemory) ? process.privateMemory : null,
        pid: Number.isFinite(process.osProcessId) ? process.osProcessId : process.id,
        type: types[process.type] || process.type || "Other",
        title: taskTitle(process),
      }))
      .sort((a, b) => (b.cpu ?? -1) - (a.cpu ?? -1) || (b.memory ?? -1) - (a.memory ?? -1));
  }

  function stopTaskManager() {
    if (taskListener && taskEvent?.removeListener) taskEvent.removeListener(taskListener);
    taskListener = null;
    taskEvent = null;
    if (taskPort) {
      const port = taskPort;
      taskPort = null;
      try {
        port.disconnect();
      } catch {
        /* The port is already closed. */
      }
    }
  }

  function nativeProcessMap(rows) {
    const labels = {
      renderer: "Renderer",
      gpu: "GPU",
      utility: "Utility",
      browser: "Browser",
      plugin: "Plugin",
    };
    const processes = {};
    rows.forEach((row) => {
      if (!row || typeof row !== "object") return;
      processes[row.pid] = {
        osProcessId: row.pid,
        cpu: row.cpu,
        privateMemory: row.memory,
        type: labels[row.type] || "Other",
        tasks: [{ title: row.title }],
      };
    });
    return processes;
  }

  function paintTasks(body, meta, processes) {
    const rows = taskRows(processes);
    const total = rows.reduce((sum, row) => sum + (row.memory ?? 0), 0);
    meta.textContent = `${rows.length} processes · ${formatBytes(total)}`;
    body.replaceChildren();
    rows.forEach((row) => {
      const line = document.createElement("div");
      line.className = "taskman-row";
      [row.cpu === null ? "—" : `${row.cpu.toFixed(1)}%`, row.memory === null ? "—" : formatBytes(row.memory), String(row.pid ?? "—"), row.type, row.title].forEach((text, index) => {
        const cell = document.createElement("span");
        cell.textContent = text;
        if (index === 4) cell.className = "taskman-task";
        line.append(cell);
      });
      body.append(line);
    });
  }

  function createTaskPanel() {
    const panel = document.createElement("div");
    panel.className = "output taskman";
    const title = document.createElement("div");
    title.className = "taskman-title";
    title.textContent = "Chrome task manager";
    const meta = document.createElement("div");
    meta.className = "taskman-meta";
    meta.textContent = "Reading processes…";
    const table = document.createElement("div");
    table.className = "taskman-table";
    const head = document.createElement("div");
    head.className = "taskman-row taskman-head";
    ["CPU", "Memory", "PID", "Type", "Task"].forEach((label) => {
      const cell = document.createElement("span");
      cell.textContent = label;
      if (label === "Task") cell.className = "taskman-task";
      head.append(cell);
    });
    const body = document.createElement("div");
    table.append(head, body);
    panel.append(title, meta, table);
    scrollback.insertBefore(panel, form);
    scrollToEnd();
    return { panel, body, meta };
  }

  function startTaskManager() {
    stopTaskManager();
    const processesApi = globalThis.chrome?.processes;
    const canNative = Boolean(globalThis.chrome?.runtime?.connectNative);
    if (!processesApi?.getProcessInfo && !canNative) {
      appendOutput("top: Chrome task manager is unavailable. Open Terminal from the extension icon.");
      return;
    }

    const { panel, body, meta } = createTaskPanel();
    const paint = (processes) => {
      if (!panel.isConnected) {
        stopTaskManager();
        return;
      }
      paintTasks(body, meta, processes);
    };

    if (processesApi?.getProcessInfo) {
      taskEvent = processesApi.onUpdatedWithMemory || processesApi.onUpdated || null;
      taskListener = paint;
      taskEvent?.addListener(taskListener);
      processesApi.getProcessInfo([], true).then(
        (processes) => {
          if (taskListener) paint(processes);
        },
        () => {
          if (!panel.isConnected) return;
          meta.textContent = "Unable to read the Chrome task manager.";
          stopTaskManager();
        }
      );
      return;
    }

    let port;
    try {
      port = globalThis.chrome.runtime.connectNative("com.terminal.tasks");
    } catch {
      meta.textContent = "Unable to read the Chrome task manager.";
      return;
    }
    taskPort = port;
    let saw = false;
    port.onMessage.addListener((message) => {
      if (message?.type !== "processes" || !Array.isArray(message.rows)) return;
      saw = true;
      paint(nativeProcessMap(message.rows));
    });
    port.onDisconnect.addListener(() => {
      if (taskPort === port) taskPort = null;
      if (!panel.isConnected || saw) return;
      const message = globalThis.chrome?.runtime?.lastError?.message || "";
      meta.textContent = message.includes("not found")
        ? "Task host is not installed. Run native/install-macos.sh and reload the extension."
        : message || "Unable to read the Chrome task manager.";
    });
  }

  function stopMonitor() {
    clearInterval(monitorTimer);
    monitorTimer = 0;
    monitorFitObserver?.disconnect();
    monitorFitObserver = null;
    scrollback.classList.remove("is-monitor");
  }

  function startMonitor(chart) {
    stopMonitor();
    const stats = { cpu: 28 };
    const history = [];
    const nudge = (value, min, max, step) => Math.min(max, Math.max(min, value + (Math.random() * 2 - 1) * step));

    const panel = document.createElement("div");
    panel.className = "output monitor";
    const chartTitle = document.createElement("div");
    chartTitle.className = "monitor-chart-title";
    const plot = document.createElement("div");
    plot.className = "monitor-plot";
    let chartRows = 0;
    let chartCols = 0;
    let defragCols = 0;
    let defragTotal = 0;
    const defragTones = ["is-purple", "is-indigo", "is-blue", "is-green", "is-yellow", "is-orange", "is-red"];
    let defragCells = [];
    let defragLeft = [];
    let sortI = 0;
    let sortJ = 0;
    const seedDefrag = () => {
      const counts = [];
      let remaining = defragTotal;
      defragTones.forEach((_, index) => {
        if (index === defragTones.length - 1) {
          counts.push(remaining);
          return;
        }
        const share = Math.round((remaining / (defragTones.length - index)) * (0.75 + Math.random() * 0.5));
        const count = Math.max(1, Math.min(remaining - (defragTones.length - index - 1), share));
        counts.push(count);
        remaining -= count;
      });
      defragCells = counts.flatMap((count, tone) => Array(count).fill(tone));
      for (let index = defragCells.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        const current = defragCells[index];
        defragCells[index] = defragCells[swap];
        defragCells[swap] = current;
      }
      defragLeft = counts.slice();
      sortI = 0;
      sortJ = 0;
    };
    const plotRows = [];
    const plotAxes = [];
    const chartPanel = document.createElement("div");
    chartPanel.className = "monitor-chart";
    chartPanel.append(chartTitle, plot);
    panel.append(chartPanel);
    scrollback.insertBefore(panel, form);
    scrollback.classList.add("is-monitor");
    const startedAt = performance.now();
    let closed = false;
    const finishMonitor = (result) => {
      if (closed || !panel.isConnected) return;
      closed = true;
      const percent = chart === "heatmap" && defragTotal ? Math.min(100, Math.round((sortI / defragTotal) * 100)) : null;
      stopMonitor();
      chartPanel.hidden = true;
      const summary = document.createElement("div");
      summary.className = `compile-summary ${result === "Stopped" ? "is-stopped" : "is-done"}`;
      const head = document.createElement("div");
      head.className = "compile-summary-title";
      head.textContent = "Summary";
      summary.append(head);
      const fields = [
        ["Result", result],
        ["Command", `monitor ${chart}`],
        ["Size", chartCols && chartRows ? `${chartCols} × ${chartRows}` : ""],
        ["Progress", percent === null ? "" : `${percent}%`],
        ["Time", formatRemaining(performance.now() - startedAt)],
        ["Finished", compileStamp()],
      ];
      fields.forEach(([name, value]) => {
        if (!value) return;
        const line = document.createElement("div");
        line.className = "compile-summary-row";
        const key = document.createElement("span");
        key.className = "compile-summary-key";
        key.textContent = name;
        const item = document.createElement("span");
        item.className = name === "Result" ? "compile-summary-result" : "compile-summary-value";
        item.textContent = value;
        line.append(key, item);
        summary.append(line);
      });
      panel.append(summary);
      monitorJob = null;
      syncBusy();
      scrollToEnd();
    };

    const paint = () => {
      chartTitle.textContent = `CPU · last ${chartCols}s · ${chart}`;
      const blocks = ["░", "▒", "▓", "█"];
      const tones = ["is-purple", "is-indigo", "is-blue", "is-green", "is-yellow", "is-orange", "is-red"];
      const blank = { glyph: " ", tone: "" };
      const blockOf = (value) => {
        const steps = blocks.length * tones.length;
        const index = Math.min(steps - 1, Math.round((Math.min(100, Math.max(0, value)) / 100) * (steps - 1)));
        return { glyph: blocks[index % blocks.length], tone: tones[Math.floor(index / blocks.length)] };
      };
      const paintCells = (marks, cells) => {
        marks.replaceChildren(...cells.map((cell) => {
          const span = document.createElement("span");
          if (cell.tone) span.className = `monitor-cell ${cell.tone}`;
          else if (cell.glyph.length > 1) span.className = "monitor-plot-label";
          span.textContent = cell.glyph;
          return span;
        }));
      };
      if (chart === "bar-horizontal") {
        const size = Math.ceil(history.length / chartRows);
        plotRows.forEach((marks, index) => {
          const slice = history.slice(index * size, (index + 1) * size);
          const average = slice.reduce((sum, value) => sum + value, 0) / (slice.length || 1);
          const ago = index === chartRows - 1 ? 0 : (chartRows - index) * size;
          plotAxes[index].textContent = (ago === 0 ? "now" : `-${ago}s`).padStart(5, " ");
          const label = ` ${average.toFixed(0)}%`;
          const barWidth = Math.max(1, chartCols - label.length);
          const filled = Math.round((average / 100) * barWidth);
          const cell = blockOf(average);
          const cells = Array.from({ length: barWidth }, (_, column) => (column < filled ? cell : blank));
          cells.push({ glyph: label, tone: "" });
          paintCells(marks, cells);
        });
      } else {
        plotAxes.forEach((axis, index) => {
          const row = chartRows - 1 - index;
          axis.textContent = row === chartRows - 1 ? "  100" : row === 0 ? "    0" : "     ";
        });
        const rowOf = (value) => Math.min(chartRows - 1, Math.max(0, Math.round((value / 100) * (chartRows - 1))));
        const grid = Array.from({ length: chartRows }, () => Array.from({ length: history.length }, () => blank));
        if (chart === "bar-vertical") {
          history.forEach((value, column) => {
            const cell = blockOf(value);
            const top = rowOf(value);
            for (let span = 0; span <= top; span += 1) grid[span][column] = cell;
          });
        } else if (chart === "heatmap") {
          const percent = Math.min(100, Math.round((sortI / defragTotal) * 100));
          chartTitle.textContent = `sort · ${percent}%`;
          const running = sortI < defragTotal;
          plotRows.forEach((marks, row) => {
            plotAxes[row].className = "monitor-plot-axis";
            plotAxes[row].textContent = "     ";
            const cells = Array.from({ length: defragCols }, (_, column) => {
              const index = row * defragCols + column;
              const scanning = running && index === sortJ && sortJ !== sortI;
              const placing = running && index === sortI;
              const glyph = placing ? "▓" : scanning ? "▒" : "█";
              return { glyph, tone: defragTones[defragCells[index]] };
            });
            paintCells(marks, cells);
          });
          return;
        } else {
          const yRes = chartRows * 4;
          const masks = Array.from({ length: chartRows }, () => Array(history.length).fill(0));
          const cellValue = Array.from({ length: chartRows }, () => Array(history.length).fill(0));
          const dotBits = [0x01, 0x02, 0x04, 0x40];
          const yOf = (value) => Math.min(yRes - 1, Math.max(0, Math.round((value / 100) * (yRes - 1))));
          const mark = (x, y, value) => {
            const fromTop = yRes - 1 - y;
            const row = Math.floor(fromTop / 4);
            masks[row][x] |= dotBits[fromTop % 4];
            cellValue[row][x] = value;
          };
          const stroke = (x0, y0, x1, y1, value) => {
            const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
            for (let step = 0; step <= steps; step += 1) {
              const t = step / steps;
              mark(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), value);
            }
          };
          history.forEach((value, column) => {
            const y = yOf(value);
            if (column === 0) mark(0, y, value);
            else stroke(column - 1, yOf(history[column - 1]), column, y, value);
          });
          plotRows.forEach((marks, index) => {
            paintCells(marks, masks[index].map((mask, column) => (
              mask ? { glyph: String.fromCharCode(0x2800 + mask), tone: blockOf(cellValue[index][column]).tone } : blank
            )));
          });
          return;
        }
        plotRows.forEach((marks, index) => {
          paintCells(marks, grid[chartRows - 1 - index]);
        });
      }
    };
    const tick = () => {
      stats.cpu = nudge(stats.cpu, 4, 98, 8);
      history.push(stats.cpu);
      while (history.length > chartCols) history.shift();
      paint();
    };
    const advanceDefrag = () => {
      const target = defragLeft.findIndex((count) => count > 0);
      if (target < 0 || sortI >= defragTotal) {
        finishMonitor("Done");
        return;
      }
      for (let step = 0; step < 8 && sortI < defragTotal; step += 1) {
        if (defragCells[sortI] === target) {
          defragLeft[target] -= 1;
          sortI += 1;
          sortJ = sortI;
          continue;
        }
        if (sortJ <= sortI) sortJ = sortI + 1;
        if (sortJ >= defragTotal) {
          sortJ = sortI + 1;
          break;
        }
        if (defragCells[sortJ] === target) {
          const current = defragCells[sortI];
          defragCells[sortI] = defragCells[sortJ];
          defragCells[sortJ] = current;
          defragLeft[target] -= 1;
          sortI += 1;
          sortJ = sortI;
          continue;
        }
        sortJ += 1;
      }
      if (sortI >= defragTotal) {
        finishMonitor("Done");
        return;
      }
      paint();
    };
    const syncHistory = () => {
      let cursor = history.length ? history[history.length - 1] : stats.cpu;
      while (history.length < chartCols) {
        cursor = nudge(cursor, 4, 98, 8);
        history.push(cursor);
      }
      while (history.length > chartCols) history.shift();
      if (history.length) stats.cpu = history[history.length - 1];
    };
    const rebuildPlot = () => {
      plot.replaceChildren();
      plotRows.length = 0;
      plotAxes.length = 0;
      for (let row = 0; row < chartRows; row += 1) {
        const line = document.createElement("div");
        line.className = "monitor-plot-row";
        const axis = document.createElement("span");
        axis.className = "monitor-plot-axis";
        const marks = document.createElement("span");
        marks.className = "monitor-plot-marks";
        line.append(axis, marks);
        plot.append(line);
        plotAxes.push(axis);
        plotRows.push(marks);
      }
    };
    const fitMonitor = () => {
      if (!panel.isConnected) return;
      const styles = getComputedStyle(scrollback);
      const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      const panelStyles = getComputedStyle(panel);
      const marginY = (parseFloat(panelStyles.marginTop) || 0) + (parseFloat(panelStyles.marginBottom) || 0);
      const chrome = panel.offsetHeight - plot.offsetHeight;
      const roomH = scrollback.clientHeight - padY - chrome - form.offsetHeight - marginY;
      const roomW = scrollback.clientWidth - padX;
      const probe = document.createElement("span");
      probe.className = "monitor-cell";
      probe.textContent = "0";
      plot.append(probe);
      const ch = probe.getBoundingClientRect().width || 8;
      probe.remove();
      const cols = Math.max(8, Math.floor((roomW - 5 * ch) / ch));
      const rows = Math.max(4, Math.floor(Math.max(14, roomH) / 14));
      if (rows === chartRows && cols === chartCols && plotRows.length === chartRows) return;
      chartRows = rows;
      chartCols = cols;
      syncHistory();
      rebuildPlot();
      if (chart === "heatmap") {
        defragCols = chartCols;
        defragTotal = chartRows * chartCols;
        seedDefrag();
      }
      paint();
      scrollToEnd();
    };
    monitorJob = {
      stop() {
        finishMonitor("Stopped");
      },
    };
    syncBusy();
    fitMonitor();
    monitorFitObserver = new ResizeObserver(() => fitMonitor());
    monitorFitObserver.observe(scrollback);
    monitorTimer = setInterval(() => {
      if (!panel.isConnected) {
        monitorJob = null;
        stopMonitor();
        syncBusy();
        return;
      }
      if (chart === "heatmap") advanceDefrag();
      else tick();
    }, chart === "heatmap" ? 90 : 1000);
  }

  function stopAlgorithm() {
    clearInterval(algorithmTimer);
    algorithmTimer = 0;
    algorithmFitObserver?.disconnect();
    algorithmFitObserver = null;
    scrollback.classList.remove("is-algorithm");
  }

  function startAlgorithm(name) {
    stopAlgorithm();
    const sim = createAlgorithm(name);
    const panel = document.createElement("div");
    panel.className = "output algorithm";
    const view = document.createElement("div");
    view.className = "algorithm-view";
    const title = document.createElement("div");
    title.className = "algorithm-title";
    title.textContent = name;
    const plot = document.createElement("div");
    plot.className = "algorithm-plot";
    view.append(title, plot);
    panel.append(view);
    scrollback.insertBefore(panel, form);
    scrollback.classList.add("is-algorithm");
    const startedAt = performance.now();
    let closed = false;
    let gridRows = 0;
    let gridCols = 0;
    let spans = [];
    const brailleBit = [
      [0x01, 0x08],
      [0x02, 0x10],
      [0x04, 0x20],
      [0x40, 0x80],
    ];
    const toneRank = {
      "is-purple": 1,
      "is-indigo": 2,
      "is-blue": 3,
      "is-matrix-dim": 3,
      "is-green": 4,
      "is-matrix": 5,
      "is-yellow": 6,
      "is-orange": 7,
      "is-red": 8,
      "is-matrix-head": 9,
    };
    const paint = () => {
      title.textContent = sim.finite ? `${name} · ${sim.progress()}%` : name;
      const cells = sim.cells();
      if (name === "matrix") {
        spans.forEach((span, index) => {
          const cell = cells[index];
          const glyph = cell?.glyph || " ";
          const className = cell?.tone ? `algorithm-cell ${cell.tone}` : "algorithm-cell";
          if (span.className !== className) span.className = className;
          if (span.textContent !== glyph) span.textContent = glyph;
        });
        return;
      }
      const dotCols = gridCols * 2;
      spans.forEach((span, index) => {
        const col = index % gridCols;
        const row = Math.floor(index / gridCols);
        let mask = 0;
        let tone = "";
        let rank = 0;
        for (let dy = 0; dy < 4; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const dot = cells[(row * 4 + dy) * dotCols + col * 2 + dx];
            if (!dot?.lit) continue;
            mask |= brailleBit[dy][dx];
            const next = toneRank[dot.tone] || 1;
            if (next >= rank) {
              rank = next;
              tone = dot.tone;
            }
          }
        }
        const glyph = mask ? String.fromCharCode(0x2800 + mask) : " ";
        const className = tone ? `algorithm-cell ${tone}` : "algorithm-cell";
        if (span.className !== className) span.className = className;
        if (span.textContent !== glyph) span.textContent = glyph;
      });
    };
    const finishAlgorithm = (result) => {
      if (closed || !panel.isConnected) return;
      closed = true;
      const percent = sim.finite ? sim.progress() : null;
      stopAlgorithm();
      view.hidden = true;
      const summary = document.createElement("div");
      summary.className = `compile-summary ${result === "Stopped" ? "is-stopped" : "is-done"}`;
      const head = document.createElement("div");
      head.className = "compile-summary-title";
      head.textContent = "Summary";
      summary.append(head);
      [
        ["Result", result],
        ["Command", `algorithm ${name}`],
        ["Size", gridCols && gridRows ? `${gridCols} × ${gridRows}` : ""],
        ["Progress", percent === null ? "" : `${percent}%`],
        ["Time", formatRemaining(performance.now() - startedAt)],
        ["Finished", compileStamp()],
      ].forEach(([label, value]) => {
        if (!value) return;
        const line = document.createElement("div");
        line.className = "compile-summary-row";
        const key = document.createElement("span");
        key.className = "compile-summary-key";
        key.textContent = label;
        const item = document.createElement("span");
        item.className = label === "Result" ? "compile-summary-result" : "compile-summary-value";
        item.textContent = value;
        line.append(key, item);
        summary.append(line);
      });
      panel.append(summary);
      algorithmJob = null;
      syncBusy();
      scrollToEnd();
    };
    const rebuildPlot = () => {
      plot.replaceChildren();
      spans = [];
      for (let row = 0; row < gridRows; row += 1) {
        const line = document.createElement("div");
        line.className = "algorithm-row";
        for (let col = 0; col < gridCols; col += 1) {
          const span = document.createElement("span");
          span.className = "algorithm-cell";
          span.textContent = " ";
          line.append(span);
          spans.push(span);
        }
        plot.append(line);
      }
    };
    const fitAlgorithm = () => {
      if (!panel.isConnected || closed) return;
      const styles = getComputedStyle(scrollback);
      const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      const panelStyles = getComputedStyle(panel);
      const marginY = (parseFloat(panelStyles.marginTop) || 0) + (parseFloat(panelStyles.marginBottom) || 0);
      const chrome = panel.offsetHeight - plot.offsetHeight;
      const roomH = scrollback.clientHeight - padY - chrome - form.offsetHeight - marginY;
      const roomW = scrollback.clientWidth - padX;
      const probe = document.createElement("span");
      probe.className = "algorithm-cell";
      probe.textContent = "0";
      plot.append(probe);
      const ch = probe.getBoundingClientRect().width || 8;
      probe.remove();
      const cols = Math.max(8, Math.floor(roomW / ch));
      const rows = Math.max(4, Math.floor(Math.max(14, roomH) / 14));
      if (rows === gridRows && cols === gridCols && spans.length === rows * cols) return;
      gridRows = rows;
      gridCols = cols;
      sim.reset(name === "matrix" ? gridCols : gridCols * 2, name === "matrix" ? gridRows : gridRows * 4);
      rebuildPlot();
      paint();
      scrollToEnd();
    };
    algorithmJob = {
      stop() {
        finishAlgorithm("Stopped");
      },
    };
    syncBusy();
    fitAlgorithm();
    algorithmFitObserver = new ResizeObserver(() => fitAlgorithm());
    algorithmFitObserver.observe(scrollback);
    algorithmTimer = setInterval(() => {
      if (!panel.isConnected) {
        algorithmJob = null;
        stopAlgorithm();
        syncBusy();
        return;
      }
      sim.step();
      paint();
      if (sim.done) finishAlgorithm("Done");
    }, 70);
  }

  function clearScreen() {
    downloadJob = null;
    compileJob = null;
    monitorJob = null;
    algorithmJob = null;
    stopDownload();
    stopCompile();
    stopMonitor();
    stopAlgorithm();
    syncBusy();
    stopTaskManager();
    scrollback.querySelectorAll(".row, .output").forEach((node) => node.remove());
  }

  function resetHistoryNav() {
    historyNav.cursor = session.history.length;
    historyNav.draft = "";
  }

  function setLine(value) {
    input.value = value;
    input.setSelectionRange(value.length, value.length);
  }

  function requestSitePermission(url) {
    const request = globalThis.chrome?.permissions?.request;
    if (!request) return Promise.resolve(true);
    return request({ origins: [`${new URL(url).origin}/*`] });
  }

  async function applyResult(result, grant) {
    if (result.clear) {
      clearScreen();
      scheduleSave();
      return;
    }
    stopTaskManager();
    appendInput(result.command);
    if (result.top) startTaskManager();
    else if (result.monitor) startMonitor(result.monitor);
    else if (result.algorithm) startAlgorithm(result.algorithm);
    else if (result.download) startDownload(result.download);
    else if (result.compile) startCompile(result.compile);
    else if (result.output !== null) appendOutput(result.output);
    scrollToEnd();
    if (result.browse) {
      const allowed = await grant;
      if (!allowed) {
        appendOutput("open: site permission was denied");
        scrollToEnd();
        return;
      }
      await showPage(result.browse);
    }
    scheduleSave();
    if (result.close) {
      if (openIndexes().length <= 1) activeWorkspace.onLastExit();
      else hidePane(index);
    }
  }

  function run(line) {
    const result = execute(line, session);
    const grant = result.browse ? requestSitePermission(result.browse) : Promise.resolve(true);
    return applyResult(result, grant);
  }

  function fitShell() {
    if (mode !== "shell" || !fitAddon || !term) return;
    if (!element.classList.contains("is-open")) return;
    if (xtermMount.clientWidth < 2 || xtermMount.clientHeight < 2) return;
    fitAddon.fit();
    shellPort?.resize(term.cols, term.rows);
  }

  function mountTerm() {
    const Terminal = globalThis.Terminal;
    const FitAddon = globalThis.FitAddon?.FitAddon;
    term = new Terminal({
      cursorBlink: true,
      fontFamily: '"Source Code Pro", ui-monospace, monospace',
      fontSize: 13,
      theme: {
        background: "#000000",
        foreground: "#e8e8e8",
        cursor: "#3dd68c",
        selectionBackground: "#333333",
      },
    });
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(xtermMount);
    term.onData((data) => shellPort?.write(data));
    resizeObserver = new ResizeObserver(() => fitShell());
    resizeObserver.observe(xtermMount);
    requestAnimationFrame(fitShell);
  }

  function updateRuntimeButtons() {
    const active = preferred === "simulator" ? "simulator" : "shell";
    for (const button of [shellButton, simulatorButton]) {
      const pressed = button.dataset.runtime === active;
      button.classList.toggle("is-active", pressed);
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
    }
  }

  function focusRuntime() {
    const workspace = element.closest(".panes");
    if (!workspace?.classList.contains("is-current") || !element.classList.contains("is-active")) return;
    if (element.classList.contains("is-browsing")) return;
    if (mode === "shell") term?.focus();
    else input.focus();
  }

  function appendOnce(text) {
    const nodes = scrollback.querySelectorAll(":scope > .output");
    if (nodes[nodes.length - 1]?.textContent === text) return;
    appendOutput(text);
  }

  function beginSimulator({ chosen = false, restore = false, reason = "" } = {}) {
    if (mode === "shell" || mode === "connecting") return;
    mode = "simulator";
    element.classList.remove("is-shell");
    updateRuntimeButtons();
    const existing = scrollback.querySelector(":scope > .row, :scope > .output");
    if (!existing && restore && savedPane) applySaved(savedPane);
    const hasLines = scrollback.querySelector(":scope > .row, :scope > .output");
    const notice = "Local shell is not installed. Commands run in the simulator.";
    if (!hasLines) {
      if (!chosen) appendOutput(notice);
      if (!chosen && reason) appendOutput(reason);
      appendOutput("Terminal simulator. Type help to list commands.");
    } else if (!chosen) {
      const alreadyNoted = [...scrollback.querySelectorAll(":scope > .output")].some((node) => node.textContent === notice);
      if (!alreadyNoted) appendOutput(notice);
      if (reason) appendOnce(reason);
    }
    scrollToEnd();
  }

  function enterShell() {
    if (mode !== "connecting") return;
    if (!globalThis.Terminal || !globalThis.FitAddon?.FitAddon) {
      enterSimulator();
      return;
    }
    savedPane = null;
    mode = "shell";
    element.classList.remove("is-browsing");
    element.classList.add("is-shell");
    title.textContent = "Local shell";
    updateRuntimeButtons();
    mountTerm();
    focusRuntime();
  }

  function applySaved(data) {
    session.history = Array.isArray(data.history) ? data.history.filter((item) => typeof item === "string") : [];
    historyNav.cursor = session.history.length;
    historyNav.draft = "";
    scrollback.querySelectorAll(":scope > .row, :scope > .output").forEach((node) => node.remove());
    if (Array.isArray(data.lines)) {
      data.lines.forEach((line) => {
        if (!line || typeof line.text !== "string") return;
        if (line.type === "output") appendOutput(line.text);
        else appendInput(line.text);
      });
    }
    input.value = typeof data.input === "string" ? data.input : "";
    let browse = null;
    if (typeof data.browse === "string") {
      try {
        const pageUrl = new URL(data.browse);
        if (pageUrl.protocol === "http:" || pageUrl.protocol === "https:") browse = pageUrl.href;
      } catch {
        browse = null;
      }
    }
    if (browse) showPage(browse);
    else title.textContent = typeof data.title === "string" && data.title ? data.title : "user@host";
    scrollToEnd();
  }

  function enterSimulator(reason) {
    if (mode !== "connecting") return;
    shellPort = null;
    mode = "idle";
    beginSimulator({ chosen: false, restore: true, reason: typeof reason === "string" ? reason : "" });
  }

  function selectRuntime(value) {
    if (value !== "shell" && value !== "simulator") return;
    if (value === "shell" && preferred === "shell" && (mode === "shell" || mode === "connecting")) return;
    if (value === "simulator" && preferred === "simulator" && mode === "simulator") return;
    preferred = value;
    updateRuntimeButtons();
    if (value === "simulator") {
      if (mode === "shell" || mode === "connecting") disposeShell();
      shellAttempted = false;
      if (mode === "idle") beginSimulator({ chosen: true });
      focusRuntime();
      scheduleSave();
      return;
    }
    shellAttempted = false;
    stopTaskManager();
    if (mode === "simulator") mode = "idle";
    ensureShell();
    focusRuntime();
    scheduleSave();
  }

  function ensureShell() {
    if (!element.classList.contains("is-open")) return;
    if (preferred === "simulator") {
      if (mode === "idle") beginSimulator({ chosen: true, restore: true });
      return;
    }
    if (mode !== "idle" || shellAttempted) return;
    shellAttempted = true;
    mode = "connecting";
    updateRuntimeButtons();
    shellPort = connectLocalShell({
      onReady: enterShell,
      onOutput(text) {
        term?.write(text);
      },
      onExit() {
        if (mode !== "shell") return;
        title.textContent = "Shell exited";
        term?.write("\r\nShell exited\r\n");
      },
      onFailure: enterSimulator,
    });
  }

  function disposeShell() {
    downloadJob = null;
    compileJob = null;
    algorithmJob = null;
    stopDownload();
    stopCompile();
    stopAlgorithm();
    syncBusy();
    stopTaskManager();
    if (mode !== "shell" && mode !== "connecting") return;
    const port = shellPort;
    shellPort = null;
    mode = "idle";
    resizeObserver?.disconnect();
    resizeObserver = null;
    term?.dispose();
    term = null;
    fitAddon = null;
    element.classList.remove("is-shell");
    title.textContent = "user@host";
    port?.close();
  }

  function focusShell() {
    term?.focus();
  }

  updateRuntimeButtons();
  resetHistoryNav();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (mode !== "simulator" || hasJob()) return;
    const line = input.value;
    input.value = "";
    run(line);
    resetHistoryNav();
  });

  input.addEventListener("focus", () => setActive(index));

  input.addEventListener("keydown", (event) => {
    if (isJobInterrupt(event)) {
      event.preventDefault();
      interruptJobs();
      return;
    }
    if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      clearScreen();
      scheduleSave();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();

    if (event.key === "ArrowUp") {
      if (historyNav.cursor === session.history.length) historyNav.draft = input.value;
      if (historyNav.cursor === 0) return;
      historyNav.cursor -= 1;
      setLine(session.history[historyNav.cursor]);
      return;
    }

    if (historyNav.cursor >= session.history.length) return;
    historyNav.cursor += 1;
    setLine(historyNav.cursor === session.history.length ? historyNav.draft : session.history[historyNav.cursor]);
  });

  screen.addEventListener("click", () => {
    if (window.getSelection()?.toString()) return;
    if (element.classList.contains("is-shell")) focusShell();
    else if (hasJob()) element.focus();
    else input.focus();
  });

  element.addEventListener("keydown", (event) => {
    if (!isJobInterrupt(event)) return;
    event.preventDefault();
    interruptJobs();
  });

  document.addEventListener("keydown", (event) => {
    if (!isJobInterrupt(event)) return;
    if (!element.classList.contains("is-active") || !activeWorkspace.root.classList.contains("is-current")) return;
    if (event.target instanceof HTMLInputElement && event.target !== input) return;
    if (event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    interruptJobs();
  });

  backButton.addEventListener("click", hidePage);
  closeButton.addEventListener("click", () => hidePane(index));

  bar.addEventListener("dragstart", (event) => {
    if (event.target.closest("button") || openIndexes().length < 2) {
      event.preventDefault();
      return;
    }
    activeWorkspace.draggingIndex = index;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    element.classList.add("is-dragging-pane");
    document.body.classList.add("is-moving-pane");
  });

  bar.addEventListener("dragend", () => {
    activeWorkspace.draggingIndex = null;
    document.body.classList.remove("is-moving-pane");
    clearDropMarks();
  });

  element.addEventListener("dragover", (event) => {
    if (activeWorkspace.draggingIndex === null || activeWorkspace.draggingIndex === index || !element.classList.contains("is-open")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    markDropTarget(element, event);
  });

  element.addEventListener("drop", (event) => {
    if (activeWorkspace.draggingIndex === null || activeWorkspace.draggingIndex === index) return;
    event.preventDefault();
    const source = activeWorkspace.panes[activeWorkspace.draggingIndex].element;
    const stacked = !placedBeside(source, element);
    const rect = element.getBoundingClientRect();
    const after = stacked
      ? event.clientY > rect.top + rect.height / 2
      : event.clientX > rect.left + rect.width / 2;
    movePane(activeWorkspace.draggingIndex, index, after);
  });

  function snapshot() {
    if (mode === "shell" || mode === "connecting") {
      return { history: [], lines: [], input: "", title: "user@host", browse: null, runtime: "shell" };
    }
    const lines = [...scrollback.querySelectorAll(":scope > .row, :scope > .output")].map((node) => {
      if (node.classList.contains("output")) return { type: "output", text: node.textContent };
      return { type: "input", text: node.querySelector(".command")?.textContent ?? "" };
    });
    const browsing = element.classList.contains("is-browsing");
    const src = frame.getAttribute("src");
    return {
      history: session.history.slice(-200),
      lines: lines.slice(-200),
      input: input.value,
      title: title.textContent,
      browse: element.dataset.browse || (browsing && src && src !== "about:blank" ? src : null),
      runtime: preferred === "simulator" ? "simulator" : "shell",
    };
  }

  function restore(data) {
    savedPane = data && typeof data === "object" ? data : null;
    if (savedPane?.runtime === "simulator" || savedPane?.runtime === "shell") preferred = savedPane.runtime;
    updateRuntimeButtons();
    if (mode === "simulator" && savedPane) applySaved(savedPane);
  }

  return { element, input, snapshot, restore, ensureShell, disposeShell, focusShell };
}

function clearDropMarks() {
  activeWorkspace.panes.forEach((pane) => {
    pane.element.classList.remove(
      "is-dragging-pane",
      "is-drop-before-x",
      "is-drop-after-x",
      "is-drop-before-y",
      "is-drop-after-y"
    );
  });
}

function markDropTarget(target, event) {
  const source = activeWorkspace.panes[activeWorkspace.draggingIndex].element;
  const stacked = !placedBeside(source, target);
  const rect = target.getBoundingClientRect();
  const after = stacked
    ? event.clientY > rect.top + rect.height / 2
    : event.clientX > rect.left + rect.width / 2;
  clearDropMarks();
  source.classList.add("is-dragging-pane");
  target.classList.add(after ? (stacked ? "is-drop-after-y" : "is-drop-after-x") : stacked ? "is-drop-before-y" : "is-drop-before-x");
}

function movePane(fromIndex, toIndex, after) {
  const next = activeWorkspace.paneOrder.filter((paneIndex) => paneIndex !== fromIndex);
  let insertAt = next.indexOf(toIndex);
  if (insertAt < 0) return;
  if (after) insertAt += 1;
  next.splice(insertAt, 0, fromIndex);
  activeWorkspace.paneOrder = next;
  clearDropMarks();
  document.body.classList.remove("is-moving-pane");
  activeWorkspace.draggingIndex = null;
  applySplit();
  scheduleSave();
}

function placedBeside(source, target) {
  const sourceRow = source.parentElement?.classList.contains("pane-row") ? source.parentElement : null;
  const targetRow = target.parentElement?.classList.contains("pane-row") ? target.parentElement : null;
  if (sourceRow && targetRow) return sourceRow === targetRow;
  const sourceBox = source.getBoundingClientRect();
  const targetBox = target.getBoundingClientRect();
  const dx = Math.abs(sourceBox.left + sourceBox.width / 2 - (targetBox.left + targetBox.width / 2));
  const dy = Math.abs(sourceBox.top + sourceBox.height / 2 - (targetBox.top + targetBox.height / 2));
  return dx > dy;
}

function layoutRows() {
  const open = openIndexes();
  const layout = activeWorkspace.root.dataset.layout;
  if (layout === "columns") return [open];
  if (layout === "single" || layout === "rows") return open.map((index) => [index]);
  const rows = [];
  for (let index = 0; index < open.length; index += 2) rows.push(open.slice(index, index + 2));
  return rows.length ? rows : [open];
}

function clampRatio(ratio, track) {
  if (track <= 0) return 0.5;
  const min = Math.min(0.4, MIN_PANE / track);
  return Math.min(1 - min, Math.max(min, ratio));
}

function ratioIn(client, start, size) {
  const track = size - PANE_GAP;
  return clampRatio((client - start - PANE_GAP / 2) / track, track);
}

function createSplitter(axis, label) {
  const element = document.createElement("div");
  element.className = `splitter splitter-${axis}`;
  element.setAttribute("role", "separator");
  element.setAttribute("aria-orientation", axis === "x" ? "vertical" : "horizontal");
  element.setAttribute("aria-label", label);
  element.setAttribute("aria-valuemin", "0");
  element.setAttribute("aria-valuemax", "100");
  element.tabIndex = 0;
  return element;
}

function buildFrame() {
  const rows = layoutRows();
  activeWorkspace.panes.forEach((pane) => {
    pane.element.remove();
    pane.element.style.gridColumn = "";
    pane.element.style.gridRow = "";
    pane.element.style.flex = "";
  });
  activeWorkspace.root.replaceChildren();
  activeWorkspace.root.classList.remove("is-grid");
  activeWorkspace.root.style.gridTemplateColumns = "";
  activeWorkspace.root.style.gridTemplateRows = "";

  rows.forEach((indexes, rowIndex) => {
    if (rowIndex > 0) {
      const split = createSplitter("y", "Resize rows");
      bindSplitter(split, "y", rowIndex - 1);
      activeWorkspace.root.append(split);
    }
    const row = document.createElement("div");
    row.className = "pane-row";
    row.dataset.row = String(rowIndex);
    indexes.forEach((paneIndex, columnIndex) => {
      if (columnIndex > 0) {
        const split = createSplitter("x", "Resize columns");
        bindSplitter(split, "x", rowIndex);
        row.append(split);
      }
      row.append(activeWorkspace.panes[paneIndex].element);
    });
    activeWorkspace.root.append(row);
  });

  activeWorkspace.panes.forEach((pane) => {
    if (!pane.element.classList.contains("is-open")) activeWorkspace.root.append(pane.element);
  });
}

function ensureStructure() {
  const key = `${activeWorkspace.root.dataset.layout}|${openIndexes().join(",")}`;
  if (key === activeWorkspace.builtKey) return;
  activeWorkspace.builtKey = key;
  buildFrame();
}

function updateFlex() {
  const root = activeWorkspace.root;
  root.style.gridTemplateColumns = "";
  root.style.gridTemplateRows = "";
  const rows = [...root.querySelectorAll(":scope > .pane-row")];
  rows.forEach((row, rowIndex) => {
    const heightGrow = rows.length === 1 ? 1 : rowIndex === 0 ? activeWorkspace.splitY : 1 - activeWorkspace.splitY;
    row.style.flex = `${heightGrow} 1 0px`;
    const openPanes = [...row.querySelectorAll(":scope > .pane")];
    const widthRatio = activeWorkspace.rowSplits[rowIndex] ?? 0.5;
    openPanes.forEach((pane, columnIndex) => {
      if (openPanes.length === 1) {
        pane.style.flex = "1 1 0px";
        return;
      }
      pane.style.flex = `${columnIndex === 0 ? widthRatio : 1 - widthRatio} 1 0px`;
    });
    const split = row.querySelector(":scope > .splitter-x");
    if (split) split.setAttribute("aria-valuenow", String(Math.round(widthRatio * 100)));
  });
  const rowSplit = root.querySelector(":scope > .splitter-y");
  if (rowSplit) rowSplit.setAttribute("aria-valuenow", String(Math.round(activeWorkspace.splitY * 100)));
}

function applySplit() {
  ensureStructure();
  updateFlex();
}

function bindSplitter(element, axis, rowIndex) {
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Some events cannot capture the pointer. Listening on the splitter still tracks the drag.
    }
    element.classList.add("is-dragging");
    document.body.classList.add("is-resizing");
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";

    const move = (pointer) => {
      if (pointer.pointerId !== event.pointerId) return;
      if (axis === "x") {
        const row = element.parentElement.getBoundingClientRect();
        activeWorkspace.rowSplits[rowIndex] = ratioIn(pointer.clientX, row.left, row.width);
      } else {
        const rows = [...activeWorkspace.root.querySelectorAll(":scope > .pane-row")];
        const top = rows[0]?.getBoundingClientRect();
        const bottom = rows[rows.length - 1]?.getBoundingClientRect();
        if (!top || !bottom) return;
        activeWorkspace.splitY = ratioIn(pointer.clientY, top.top, bottom.bottom - top.top);
      }
      applySplit();
    };

    const stop = (pointer) => {
      if (pointer.pointerId !== event.pointerId) return;
      element.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing");
      document.body.style.cursor = "";
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      scheduleSave();
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
  });

  element.addEventListener("dblclick", () => {
    if (axis === "x") activeWorkspace.rowSplits[rowIndex] = 0.5;
    else activeWorkspace.splitY = 0.5;
    applySplit();
    scheduleSave();
  });

  element.addEventListener("keydown", (event) => {
    const grow =
      (axis === "x" && event.key === "ArrowRight") || (axis === "y" && event.key === "ArrowDown");
    const shrink =
      (axis === "x" && event.key === "ArrowLeft") || (axis === "y" && event.key === "ArrowUp");
    if (!grow && !shrink) return;
    event.preventDefault();
    const bounds = (axis === "x" ? element.parentElement : activeWorkspace.root).getBoundingClientRect();
    const size = axis === "x" ? bounds.width : bounds.height - PANE_PAD * 2;
    const track = size - PANE_GAP;
    const step = (event.shiftKey ? 48 : 16) / track;
    const current = axis === "x" ? activeWorkspace.rowSplits[rowIndex] ?? 0.5 : activeWorkspace.splitY;
    const next = clampRatio(current + (grow ? step : -step), track);
    if (axis === "x") activeWorkspace.rowSplits[rowIndex] = next;
    else activeWorkspace.splitY = next;
    applySplit();
    scheduleSave();
  });
}

function createWorkspace(saved) {
  const workspace = {
    root: document.createElement("div"),
    panes: [],
    paneOrder: [0, 1, 2, 3],
    draggingIndex: null,
    activeIndex: 0,
    selectedLayout: "single",
    splitY: 0.5,
    rowSplits: [0.5, 0.5],
    colSplits: [0.5, 0.5],
    builtKey: "",
    onLastExit: () => window.close(),
  };
  workspace.root.className = "panes";
  const previous = activeWorkspace;
  activeWorkspace = workspace;
  for (let index = 0; index < PANE_COUNT; index += 1) {
    const pane = createPane(index);
    activeWorkspace.panes.push(pane);
    activeWorkspace.root.append(pane.element);
  }
  if (saved) restoreWorkspace(saved);
  else applyLayout("single");
  activeWorkspace = previous;
  return workspace;
}

function restoreWorkspace(saved) {
  const layout = ["single", "columns", "rows", "grid", "custom"].includes(saved.layout) ? saved.layout : "single";
  const order = Array.isArray(saved.paneOrder) ? saved.paneOrder.filter((index) => index >= 0 && index < PANE_COUNT) : [];
  activeWorkspace.paneOrder = order.length === PANE_COUNT && new Set(order).size === PANE_COUNT ? order : [0, 1, 2, 3];
  activeWorkspace.selectedLayout = layout;
  activeWorkspace.splitY = safeRatio(saved.splitY);
  activeWorkspace.rowSplits = [
    safeRatio(Array.isArray(saved.rowSplits) ? saved.rowSplits[0] : 0.5),
    safeRatio(Array.isArray(saved.rowSplits) ? saved.rowSplits[1] : 0.5),
  ];
  activeWorkspace.colSplits = [
    safeRatio(Array.isArray(saved.colSplits) ? saved.colSplits[0] : saved.splitY),
    safeRatio(Array.isArray(saved.colSplits) ? saved.colSplits[1] : saved.splitY),
  ];
  activeWorkspace.activeIndex = typeof saved.activeIndex === "number" ? saved.activeIndex : 0;
  const open = new Set(Array.isArray(saved.open) ? saved.open : [0]);
  if (open.size === 0) open.add(0);
  activeWorkspace.panes.forEach((pane, index) => {
    pane.element.classList.toggle("is-open", open.has(index));
    if (saved.panes?.[index]) pane.restore(saved.panes[index]);
  });
  activeWorkspace.builtKey = "";
  highlightLayout();
}

const tabList = document.querySelector("#tabs");
const newTabButton = document.querySelector("#new-tab");
const workspaces = document.querySelector("#workspaces");
const tabs = [];
let tabSerial = 0;

function addTab(saved) {
  if (saved?.id) tabSerial = Math.max(tabSerial, saved.id);
  else tabSerial += 1;
  const workspace = createWorkspace(saved);
  const tab = {
    id: saved?.id || tabSerial,
    name: (saved?.name?.trim() || `Terminal ${tabSerial}`).slice(0, 40),
    workspace,
    element: null,
  };
  workspace.onLastExit = () => {
    if (tabs.length <= 1) window.close();
    else closeTab(tab);
  };
  tabs.push(tab);
  workspaces.append(workspace.root);
  tab.element = renderTab(tab);
  tabList.append(tab.element);
  if (!restoring) {
    selectTab(tab);
    updateTabCloseButtons();
    scheduleSave();
  }
}

function renderTab(tab) {
  const button = document.createElement("div");
  button.className = "tab";
  button.setAttribute("role", "tab");
  button.tabIndex = 0;
  const label = document.createElement("span");
  label.className = "tab-label";
  label.textContent = tab.name;
  label.title = "Double-click to rename";
  label.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    startRename(tab, label);
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "tab-close";
  close.setAttribute("aria-label", `Close ${tab.name}`);
  close.textContent = "×";
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    closeTab(tab);
  });
  button.addEventListener("click", () => selectTab(tab));
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectTab(tab);
    }
  });
  button.append(label, close);
  return button;
}

function selectTab(tab) {
  tabs.forEach((item) => {
    const selected = item === tab;
    item.workspace.root.classList.toggle("is-current", selected);
    item.element.classList.toggle("is-active", selected);
    item.element.setAttribute("aria-selected", selected ? "true" : "false");
  });
  activeWorkspace = tab.workspace;
  highlightLayout();
  const open = openIndexes();
  focusPane(open.includes(activeWorkspace.activeIndex) ? activeWorkspace.activeIndex : open[0]);
  scheduleSave();
}

document.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (event.target instanceof Element && event.target.closest(".tab-rename")) return;
  const number = Number(event.key);
  if (!Number.isInteger(number) || number < 1 || number > 9) return;
  const tab = tabs[number - 1];
  if (!tab) return;
  event.preventDefault();
  event.stopPropagation();
  selectTab(tab);
}, true);

function closeTab(tab) {
  if (tabs.length <= 1) return;
  const index = tabs.indexOf(tab);
  const wasCurrent = activeWorkspace === tab.workspace;
  tabs.splice(index, 1);
  tab.workspace.root.remove();
  tab.element.remove();
  if (wasCurrent) selectTab(tabs[Math.max(0, index - 1)]);
  updateTabCloseButtons();
  scheduleSave();
}

function updateTabCloseButtons() {
  const hide = tabs.length <= 1;
  tabs.forEach((tab) => {
    tab.element.querySelector(".tab-close").hidden = hide;
  });
}

layoutButtons.forEach((button) => {
  button.addEventListener("click", () => applyLayout(button.dataset.layout));
});

const STATE_KEY = "terminalState";
let restoring = false;
let saveTimer = 0;

function safeRatio(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(0.92, Math.max(0.08, value));
}

function scheduleSave() {
  if (restoring) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 200);
}

function saveState() {
  const active = tabs.find((tab) => tab.workspace === activeWorkspace);
  writeState({
    serial: tabSerial,
    activeId: active?.id ?? null,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      layout: tab.workspace.selectedLayout,
      paneOrder: tab.workspace.paneOrder,
      open: openIndexesOf(tab.workspace),
      splitY: tab.workspace.splitY,
      rowSplits: tab.workspace.rowSplits,
      colSplits: tab.workspace.colSplits,
      activeIndex: tab.workspace.activeIndex,
      panes: tab.workspace.panes.map((pane) => pane.snapshot()),
    })),
  });
}

function writeState(state) {
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ [STATE_KEY]: state });
    return;
  }
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota and private-mode failures outside the extension.
  }
}

async function readState() {
  if (globalThis.chrome?.storage?.local) {
    const stored = await chrome.storage.local.get(STATE_KEY);
    return stored[STATE_KEY] ?? null;
  }
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function startRename(tab, label) {
  const editor = document.createElement("input");
  editor.className = "tab-rename";
  editor.value = tab.name;
  editor.setAttribute("aria-label", "Tab name");
  editor.spellcheck = false;
  label.replaceWith(editor);
  editor.focus();
  editor.select();
  let finished = false;

  const finish = (save) => {
    if (finished) return;
    finished = true;
    if (save) {
      const name = editor.value.trim().slice(0, 40);
      if (name) tab.name = name;
    }
    label.textContent = tab.name;
    editor.replaceWith(label);
    tab.element.querySelector(".tab-close").setAttribute("aria-label", `Close ${tab.name}`);
    scheduleSave();
  };

  editor.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  editor.addEventListener("blur", () => finish(true));
  editor.addEventListener("click", (event) => event.stopPropagation());
}

async function boot() {
  const saved = await readState();
  if (!saved?.tabs?.length) {
    addTab();
    return;
  }
  restoring = true;
  saved.tabs.forEach((item) => addTab(item));
  restoring = false;
  const selected = tabs.find((tab) => tab.id === saved.activeId) || tabs[0];
  selectTab(selected);
  updateTabCloseButtons();
}

newTabButton.addEventListener("click", () => addTab());
window.addEventListener("pagehide", () => {
  clearTimeout(saveTimer);
  if (!restoring) saveState();
  tabs.forEach((tab) => tab.workspace.panes.forEach((pane) => pane.disposeShell()));
});
boot();
