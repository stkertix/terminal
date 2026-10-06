import { createPane } from "../pane/pane.js";
import {
  PANE_COUNT,
  applyLayout,
  focusPane,
  highlightLayout,
  openIndexes,
  openIndexesOf,
  workspaceState,
} from "./layout.js";

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
  const previous = workspaceState.active;
  workspaceState.active = workspace;
  for (let index = 0; index < PANE_COUNT; index += 1) {
    const pane = createPane(index);
    workspaceState.active.panes.push(pane);
    workspaceState.active.root.append(pane.element);
  }
  if (saved) restoreWorkspace(saved);
  else applyLayout("single");
  workspaceState.active = previous;
  return workspace;
}

function restoreWorkspace(saved) {
  const layout = ["single", "columns", "rows", "grid", "custom"].includes(saved.layout) ? saved.layout : "single";
  const order = Array.isArray(saved.paneOrder) ? saved.paneOrder.filter((index) => index >= 0 && index < PANE_COUNT) : [];
  workspaceState.active.paneOrder = order.length === PANE_COUNT && new Set(order).size === PANE_COUNT ? order : [0, 1, 2, 3];
  workspaceState.active.selectedLayout = layout;
  workspaceState.active.splitY = safeRatio(saved.splitY);
  workspaceState.active.rowSplits = [
    safeRatio(Array.isArray(saved.rowSplits) ? saved.rowSplits[0] : 0.5),
    safeRatio(Array.isArray(saved.rowSplits) ? saved.rowSplits[1] : 0.5),
  ];
  workspaceState.active.colSplits = [
    safeRatio(Array.isArray(saved.colSplits) ? saved.colSplits[0] : saved.splitY),
    safeRatio(Array.isArray(saved.colSplits) ? saved.colSplits[1] : saved.splitY),
  ];
  workspaceState.active.activeIndex = typeof saved.activeIndex === "number" ? saved.activeIndex : 0;
  const open = new Set(Array.isArray(saved.open) ? saved.open : [0]);
  if (open.size === 0) open.add(0);
  workspaceState.active.panes.forEach((pane, index) => {
    pane.element.classList.toggle("is-open", open.has(index));
    if (saved.panes?.[index]) pane.restore(saved.panes[index]);
  });
  workspaceState.active.builtKey = "";
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
  workspaceState.active = tab.workspace;
  highlightLayout();
  const open = openIndexes();
  focusPane(open.includes(workspaceState.active.activeIndex) ? workspaceState.active.activeIndex : open[0]);
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
  const wasCurrent = workspaceState.active === tab.workspace;
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

const STATE_KEY = "terminalState";
let restoring = false;
let saveTimer = 0;

function safeRatio(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(0.92, Math.max(0.08, value));
}

export function scheduleSave() {
  if (restoring) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 200);
}

export function saveState() {
  const active = tabs.find((tab) => tab.workspace === workspaceState.active);
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

export async function boot() {
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
