import { PROMPT, createSession, execute } from "./commands.js";

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
  if (!pane.element.classList.contains("is-browsing")) pane.input.focus();
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
  activeWorkspace.panes[index].element.classList.remove("is-open");
  highlightLayout();
  if (index === activeWorkspace.activeIndex) focusPane(openIndexes()[0]);
  scheduleSave();
}

function createPane(index) {
  const session = createSession();
  const historyNav = { cursor: 0, draft: "" };

  const element = document.createElement("section");
  element.className = "pane";

  const bar = document.createElement("header");
  bar.className = "pane-bar";
  bar.draggable = true;
  bar.title = "Drag to move";

  const title = document.createElement("span");
  title.className = "pane-title";
  title.textContent = "user@host";

  const actions = document.createElement("div");
  actions.className = "pane-actions";

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

  const frame = document.createElement("iframe");
  frame.className = "browser";
  frame.title = "Page";
  frame.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
  );
  frame.allowFullscreen = true;

  actions.append(backButton, closeButton);
  bar.append(title, actions);
  form.append(prompt, input);
  scrollback.append(form);
  screen.append(scrollback, frame);
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

  function clearScreen() {
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
    appendInput(result.command);
    if (result.output !== null) appendOutput(result.output);
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

  appendOutput("Terminal simulator. Type help to list commands.");
  resetHistoryNav();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const line = input.value;
    input.value = "";
    run(line);
    resetHistoryNav();
  });

  input.addEventListener("focus", () => setActive(index));

  input.addEventListener("keydown", (event) => {
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
    input.focus();
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
    const horizontal = source.parentElement === element.parentElement;
    const rect = element.getBoundingClientRect();
    const after = horizontal
      ? event.clientX > rect.left + rect.width / 2
      : event.clientY > rect.top + rect.height / 2;
    movePane(activeWorkspace.draggingIndex, index, after);
  });

  function snapshot() {
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
    };
  }

  function restore(data) {
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

  return { element, input, snapshot, restore };
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
  const horizontal = source.parentElement === target.parentElement;
  const rect = target.getBoundingClientRect();
  const after = horizontal
    ? event.clientX > rect.left + rect.width / 2
    : event.clientY > rect.top + rect.height / 2;
  clearDropMarks();
  source.classList.add("is-dragging-pane");
  target.classList.add(after ? (horizontal ? "is-drop-after-x" : "is-drop-after-y") : horizontal ? "is-drop-before-x" : "is-drop-before-y");
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

function rowGroups() {
  const open = openIndexes();
  const layout = activeWorkspace.root.dataset.layout;
  if (layout === "rows") return open.map((index) => [index]);
  if (layout === "single" || layout === "columns") return [open];
  const groups = [];
  for (let index = 0; index < open.length; index += 2) groups.push(open.slice(index, index + 2));
  return groups;
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

function buildRows() {
  const groups = rowGroups();
  activeWorkspace.panes.forEach((pane) => pane.element.remove());
  activeWorkspace.root.replaceChildren();

  groups.forEach((indexes, rowIndex) => {
    if (rowIndex > 0) {
      const split = createSplitter("y", "Resize rows");
      bindSplitter(split, "y", rowIndex - 1);
      activeWorkspace.root.append(split);
    }

    const row = document.createElement("div");
    row.className = "pane-row";
    row.dataset.row = String(rowIndex);
    indexes.forEach((paneIndex, column) => {
      if (column > 0) {
        const split = createSplitter("x", `Resize columns in row ${rowIndex + 1}`);
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
  buildRows();
}

function updateFlex() {
  const rows = [...activeWorkspace.root.querySelectorAll(".pane-row")];
  rows.forEach((row, rowIndex) => {
    const rowGrow = rows.length === 1 ? 1 : rowIndex === 0 ? activeWorkspace.splitY : 1 - activeWorkspace.splitY;
    row.style.flex = `${rowGrow} 1 0px`;
    const openPanes = [...row.querySelectorAll(".pane")];
    openPanes.forEach((pane, column) => {
      if (openPanes.length === 1) {
        pane.style.flex = "1 1 0px";
        return;
      }
      const ratio = activeWorkspace.rowSplits[rowIndex] ?? 0.5;
      pane.style.flex = `${column === 0 ? ratio : 1 - ratio} 1 0px`;
    });
    const split = row.querySelector(".splitter-x");
    if (split) split.setAttribute("aria-valuenow", String(Math.round((activeWorkspace.rowSplits[rowIndex] ?? 0.5) * 100)));
  });
  const rowSplit = activeWorkspace.root.querySelector(":scope > .splitter-y");
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
      if (axis === "x") {
        const row = element.parentElement.getBoundingClientRect();
        activeWorkspace.rowSplits[rowIndex] = ratioIn(pointer.clientX, row.left, row.width);
      } else {
        const rows = [...activeWorkspace.root.querySelectorAll(".pane-row")];
        const top = rows[0].getBoundingClientRect();
        const bottom = rows[rows.length - 1].getBoundingClientRect();
        activeWorkspace.splitY = ratioIn(pointer.clientY, top.top, bottom.bottom - top.top);
      }
      applySplit();
    };

    const stop = () => {
      element.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing");
      document.body.style.cursor = "";
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", stop);
      element.removeEventListener("pointercancel", stop);
      scheduleSave();
    };

    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
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
    const bounds =
      axis === "x" ? element.parentElement.getBoundingClientRect() : activeWorkspace.root.getBoundingClientRect();
    const size = axis === "x" ? bounds.width : bounds.height - PANE_PAD * 2;
    const track = size - PANE_GAP;
    const step = (event.shiftKey ? 48 : 16) / track;
    const current = axis === "x" ? activeWorkspace.rowSplits[rowIndex] : activeWorkspace.splitY;
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
});
boot();
