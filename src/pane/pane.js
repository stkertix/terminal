import { PROMPT, createSession, execute } from "../commands/index.js";
import { createAlgorithmView } from "../commands/algorithm/view.js";
import { createCompileView } from "../commands/compile/view.js";
import { createDownloadView } from "../commands/download/view.js";
import { createMonitorView } from "../commands/monitor/view.js";
import { createBrowseView } from "../commands/open/browse.js";
import { createPlayView } from "../commands/play/view.js";
import { createTasksView } from "../commands/tasks/view.js";
import { connectLocalShell } from "../shell.js";
import { saveState, scheduleSave } from "../workspace/tabs.js";
import {
  clearDropMarks,
  hidePane,
  markDropTarget,
  movePane,
  openIndexes,
  placedBeside,
  setActive,
  workspaceState,
} from "../workspace/layout.js";

export function createPane(index) {
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

  actions.append(runtimeSwitch, backButton, closeButton);
  bar.append(title, actions);
  form.append(prompt, input);
  scrollback.append(form);
  screen.append(scrollback, xtermMount, frame);
  element.append(bar, screen);

  const env = {
    get scrollback() {
      return scrollback;
    },
    get form() {
      return form;
    },
    get element() {
      return element;
    },
    get frame() {
      return frame;
    },
    get title() {
      return title;
    },
    get input() {
      return input;
    },
    scrollToEnd,
    syncBusy,
    scheduleSave,
    saveState,
    appendOutput,
  };
  const download = createDownloadView(env);
  const compile = createCompileView(env);
  const monitor = createMonitorView(env);
  const algorithm = createAlgorithmView(env);
  const play = createPlayView(env);
  const tasks = createTasksView(env);
  const browse = createBrowseView(env);

  function hasJob() {
    return download.running || compile.running || monitor.running || algorithm.running || play.running;
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
    download.interrupt();
    compile.interrupt();
    monitor.interrupt();
    algorithm.interrupt();
    play.interrupt();
    syncBusy();
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


  function clearScreen() {
    download.abandon();
    compile.abandon();
    monitor.abandon();
    algorithm.abandon();
    play.abandon();
    download.stop();
    compile.stop();
    monitor.stop();
    algorithm.stop();
    play.stop();
    syncBusy();
    tasks.stop();
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
    tasks.stop();
    appendInput(result.command);
    if (result.top) tasks.start();
    else if (result.monitor) monitor.start(result.monitor);
    else if (result.algorithm) algorithm.start(result.algorithm);
    else if (result.play) play.start(result.play);
    else if (result.download) download.start(result.download);
    else if (result.compile) compile.start(result.compile);
    else if (result.output !== null) appendOutput(result.output);
    scrollToEnd();
    if (result.browse) {
      const allowed = await grant;
      if (!allowed) {
        appendOutput("open: site permission was denied");
        scrollToEnd();
        return;
      }
      await browse.show(result.browse);
    }
    scheduleSave();
    if (result.close) {
      if (openIndexes().length <= 1) workspaceState.active.onLastExit();
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
    let savedUrl = null;
    if (typeof data.browse === "string") {
      try {
        const pageUrl = new URL(data.browse);
        if (pageUrl.protocol === "http:" || pageUrl.protocol === "https:") savedUrl = pageUrl.href;
      } catch {
        savedUrl = null;
      }
    }
    if (savedUrl) browse.show(savedUrl);
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
    tasks.stop();
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
    download.abandon();
    compile.abandon();
    algorithm.abandon();
    play.abandon();
    download.stop();
    compile.stop();
    algorithm.stop();
    play.stop();
    syncBusy();
    tasks.stop();
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
    if (!element.classList.contains("is-active") || !workspaceState.active.root.classList.contains("is-current")) return;
    if (event.target instanceof HTMLInputElement && event.target !== input) return;
    if (event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    interruptJobs();
  });

  backButton.addEventListener("click", browse.hide);
  closeButton.addEventListener("click", () => hidePane(index));

  bar.addEventListener("dragstart", (event) => {
    if (event.target.closest("button") || openIndexes().length < 2) {
      event.preventDefault();
      return;
    }
    workspaceState.active.draggingIndex = index;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    element.classList.add("is-dragging-pane");
    document.body.classList.add("is-moving-pane");
  });

  bar.addEventListener("dragend", () => {
    workspaceState.active.draggingIndex = null;
    document.body.classList.remove("is-moving-pane");
    clearDropMarks();
  });

  element.addEventListener("dragover", (event) => {
    if (workspaceState.active.draggingIndex === null || workspaceState.active.draggingIndex === index || !element.classList.contains("is-open")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    markDropTarget(element, event);
  });

  element.addEventListener("drop", (event) => {
    if (workspaceState.active.draggingIndex === null || workspaceState.active.draggingIndex === index) return;
    event.preventDefault();
    const source = workspaceState.active.panes[workspaceState.active.draggingIndex].element;
    const stacked = !placedBeside(source, element);
    const rect = element.getBoundingClientRect();
    const after = stacked
      ? event.clientY > rect.top + rect.height / 2
      : event.clientX > rect.left + rect.width / 2;
    movePane(workspaceState.active.draggingIndex, index, after);
  });

  function snapshot() {
    if (mode === "shell" || mode === "connecting") {
      return { history: [], lines: [], input: "", title: "user@host", browse: null, runtime: "shell" };
    }
    const lines = [...scrollback.querySelectorAll(":scope > .row, :scope > .output")].flatMap((node) => {
      if (node.querySelector(".play-view")) return [];
      if (node.classList.contains("output")) {
        const text = node.querySelector(".compile-summary") ? node.innerText : node.textContent;
        return [{ type: "output", text }];
      }
      return [{ type: "input", text: node.querySelector(".command")?.textContent ?? "" }];
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
