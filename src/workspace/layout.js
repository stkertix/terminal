import { scheduleSave } from "./tabs.js";

export const PANE_COUNT = 4;
export const LAYOUTS = {
  single: [0],
  columns: [0, 1],
  rows: [0, 1],
  grid: [0, 1, 2, 3],
};
export const workspaceState = { active: null };

const MIN_PANE = 96;
const PANE_PAD = 10;
const PANE_GAP = 10;
const layoutButtons = [...document.querySelectorAll(".layout-btn")];

export function openIndexesOf(workspace) {
  const open = new Set(
    workspace.panes.flatMap((pane, index) => (pane.element.classList.contains("is-open") ? [index] : []))
  );
  return workspace.paneOrder.filter((index) => open.has(index));
}

export function openIndexes() {
  return openIndexesOf(workspaceState.active);
}

export function setActive(index) {
  workspaceState.active.activeIndex = index;
  workspaceState.active.panes.forEach((pane, paneIndex) => {
    pane.element.classList.toggle("is-active", paneIndex === index);
  });
}

export function focusPane(index) {
  const pane = workspaceState.active.panes[index];
  if (!pane || !pane.element.classList.contains("is-open")) return;
  setActive(index);
  if (!workspaceState.active.root.classList.contains("is-current")) return;
  if (pane.element.classList.contains("is-browsing")) return;
  if (pane.element.classList.contains("is-shell")) pane.focusShell();
  else if (pane.element.classList.contains("is-busy")) pane.element.focus();
  else pane.input.focus();
}

export function highlightLayout() {
  const key = openIndexes().join(",");
  const selected = LAYOUTS[workspaceState.active.selectedLayout];
  let matched = "custom";
  if (selected && selected.join(",") === key) {
    matched = workspaceState.active.selectedLayout;
  } else {
    for (const [name, indexes] of Object.entries(LAYOUTS)) {
      if (indexes.join(",") === key) {
        matched = name;
        break;
      }
    }
  }
  workspaceState.active.root.dataset.layout = matched;
  workspaceState.active.root.dataset.open = String(openIndexes().length);
  applySplit();
  layoutButtons.forEach((button) => {
    const active = button.dataset.layout === matched;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  workspaceState.active.panes.forEach((pane) => pane.ensureShell());
}

export function applyLayout(name) {
  workspaceState.active.selectedLayout = name;
  const indexes = new Set(LAYOUTS[name]);
  workspaceState.active.panes.forEach((pane, index) => {
    pane.element.classList.toggle("is-open", indexes.has(index));
  });
  highlightLayout();
  if (!indexes.has(workspaceState.active.activeIndex)) focusPane(indexes.values().next().value);
  else focusPane(workspaceState.active.activeIndex);
  scheduleSave();
}

export function hidePane(index) {
  if (openIndexes().length <= 1) return;
  workspaceState.active.panes[index].disposeShell();
  workspaceState.active.panes[index].element.classList.remove("is-open");
  highlightLayout();
  if (index === workspaceState.active.activeIndex) focusPane(openIndexes()[0]);
  scheduleSave();
}

export function clearDropMarks() {
  workspaceState.active.panes.forEach((pane) => {
    pane.element.classList.remove(
      "is-dragging-pane",
      "is-drop-before-x",
      "is-drop-after-x",
      "is-drop-before-y",
      "is-drop-after-y"
    );
  });
}

export function markDropTarget(target, event) {
  const source = workspaceState.active.panes[workspaceState.active.draggingIndex].element;
  const stacked = !placedBeside(source, target);
  const rect = target.getBoundingClientRect();
  const after = stacked
    ? event.clientY > rect.top + rect.height / 2
    : event.clientX > rect.left + rect.width / 2;
  clearDropMarks();
  source.classList.add("is-dragging-pane");
  target.classList.add(after ? (stacked ? "is-drop-after-y" : "is-drop-after-x") : stacked ? "is-drop-before-y" : "is-drop-before-x");
}

export function movePane(fromIndex, toIndex, after) {
  const next = workspaceState.active.paneOrder.filter((paneIndex) => paneIndex !== fromIndex);
  let insertAt = next.indexOf(toIndex);
  if (insertAt < 0) return;
  if (after) insertAt += 1;
  next.splice(insertAt, 0, fromIndex);
  workspaceState.active.paneOrder = next;
  clearDropMarks();
  document.body.classList.remove("is-moving-pane");
  workspaceState.active.draggingIndex = null;
  applySplit();
  scheduleSave();
}

export function placedBeside(source, target) {
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
  const layout = workspaceState.active.root.dataset.layout;
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
  workspaceState.active.panes.forEach((pane) => {
    pane.element.remove();
    pane.element.style.gridColumn = "";
    pane.element.style.gridRow = "";
    pane.element.style.flex = "";
  });
  workspaceState.active.root.replaceChildren();
  workspaceState.active.root.classList.remove("is-grid");
  workspaceState.active.root.style.gridTemplateColumns = "";
  workspaceState.active.root.style.gridTemplateRows = "";

  rows.forEach((indexes, rowIndex) => {
    if (rowIndex > 0) {
      const split = createSplitter("y", "Resize rows");
      bindSplitter(split, "y", rowIndex - 1);
      workspaceState.active.root.append(split);
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
      row.append(workspaceState.active.panes[paneIndex].element);
    });
    workspaceState.active.root.append(row);
  });

  workspaceState.active.panes.forEach((pane) => {
    if (!pane.element.classList.contains("is-open")) workspaceState.active.root.append(pane.element);
  });
}

function ensureStructure() {
  const key = `${workspaceState.active.root.dataset.layout}|${openIndexes().join(",")}`;
  if (key === workspaceState.active.builtKey) return;
  workspaceState.active.builtKey = key;
  buildFrame();
}

function updateFlex() {
  const root = workspaceState.active.root;
  root.style.gridTemplateColumns = "";
  root.style.gridTemplateRows = "";
  const rows = [...root.querySelectorAll(":scope > .pane-row")];
  rows.forEach((row, rowIndex) => {
    const heightGrow = rows.length === 1 ? 1 : rowIndex === 0 ? workspaceState.active.splitY : 1 - workspaceState.active.splitY;
    row.style.flex = `${heightGrow} 1 0px`;
    const openPanes = [...row.querySelectorAll(":scope > .pane")];
    const widthRatio = workspaceState.active.rowSplits[rowIndex] ?? 0.5;
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
  if (rowSplit) rowSplit.setAttribute("aria-valuenow", String(Math.round(workspaceState.active.splitY * 100)));
}

export function applySplit() {
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
        workspaceState.active.rowSplits[rowIndex] = ratioIn(pointer.clientX, row.left, row.width);
      } else {
        const rows = [...workspaceState.active.root.querySelectorAll(":scope > .pane-row")];
        const top = rows[0]?.getBoundingClientRect();
        const bottom = rows[rows.length - 1]?.getBoundingClientRect();
        if (!top || !bottom) return;
        workspaceState.active.splitY = ratioIn(pointer.clientY, top.top, bottom.bottom - top.top);
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
    if (axis === "x") workspaceState.active.rowSplits[rowIndex] = 0.5;
    else workspaceState.active.splitY = 0.5;
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
    const bounds = (axis === "x" ? element.parentElement : workspaceState.active.root).getBoundingClientRect();
    const size = axis === "x" ? bounds.width : bounds.height - PANE_PAD * 2;
    const track = size - PANE_GAP;
    const step = (event.shiftKey ? 48 : 16) / track;
    const current = axis === "x" ? workspaceState.active.rowSplits[rowIndex] ?? 0.5 : workspaceState.active.splitY;
    const next = clampRatio(current + (grow ? step : -step), track);
    if (axis === "x") workspaceState.active.rowSplits[rowIndex] = next;
    else workspaceState.active.splitY = next;
    applySplit();
    scheduleSave();
  });
}

layoutButtons.forEach((button) => {
  button.addEventListener("click", () => applyLayout(button.dataset.layout));
});
