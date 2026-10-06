import { createAlgorithm } from "./registry.js";
import { formatRemaining, compileStamp } from "../format.js";

export function createAlgorithmView(env) {
  let algorithmTimer = 0;
  let algorithmFitObserver = null;
  let algorithmJob = null;

  function stopAlgorithm() {
    clearInterval(algorithmTimer);
    algorithmTimer = 0;
    algorithmFitObserver?.disconnect();
    algorithmFitObserver = null;
    env.scrollback.classList.remove("is-algorithm");
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
    env.scrollback.insertBefore(panel, env.form);
    env.scrollback.classList.add("is-algorithm");
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
      env.syncBusy();
      env.scrollToEnd();
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
      const styles = getComputedStyle(env.scrollback);
      const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      const panelStyles = getComputedStyle(panel);
      const marginY = (parseFloat(panelStyles.marginTop) || 0) + (parseFloat(panelStyles.marginBottom) || 0);
      const chrome = panel.offsetHeight - plot.offsetHeight;
      const roomH = env.scrollback.clientHeight - padY - chrome - env.form.offsetHeight - marginY;
      const roomW = env.scrollback.clientWidth - padX;
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
      env.scrollToEnd();
    };
    algorithmJob = {
      stop() {
        finishAlgorithm("Stopped");
      },
    };
    env.syncBusy();
    fitAlgorithm();
    algorithmFitObserver = new ResizeObserver(() => fitAlgorithm());
    algorithmFitObserver.observe(env.scrollback);
    algorithmTimer = setInterval(() => {
      if (!panel.isConnected) {
        algorithmJob = null;
        stopAlgorithm();
        env.syncBusy();
        return;
      }
      sim.step();
      paint();
      if (sim.done) finishAlgorithm("Done");
    }, 70);
  }

  return {
    start: startAlgorithm,
    stop: stopAlgorithm,
    abandon() {
      algorithmJob = null;
    },
    interrupt() {
      algorithmJob?.stop();
      algorithmJob = null;
      stopAlgorithm();
    },
    get running() {
      return Boolean(algorithmJob);
    },
  };
}
