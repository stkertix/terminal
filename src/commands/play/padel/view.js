import { formatRemaining, compileStamp } from "../../format.js";
import { bannerArt } from "./banner.js";
import { createPadel } from "./padel.js";

const BRAILLE_BIT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

const TONE_RANK = {
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

function ballGlyph(value) {
  return value === "o" || value === "●";
}

function paintCells(spans, cells, gridCols) {
  const dotCols = gridCols * 2;
  spans.forEach((span, index) => {
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);
    let mask = 0;
    let tone = "";
    let rank = 0;
    let glyph = "";
    let glyphTone = "";
    for (let dy = 0; dy < 4; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const dot = cells[(row * 4 + dy) * dotCols + col * 2 + dx];
        if (!dot) continue;
        if (dot.glyph && (!ballGlyph(glyph) || ballGlyph(dot.glyph))) {
          glyph = dot.glyph;
          glyphTone = dot.tone;
        }
        if (!dot.lit) continue;
        mask |= BRAILLE_BIT[dy][dx];
        const next = TONE_RANK[dot.tone] || 1;
        if (next >= rank) {
          rank = next;
          tone = dot.tone;
        }
      }
    }
    const text = glyph || (mask ? String.fromCharCode(0x2800 + mask) : " ");
    const ink = glyph ? glyphTone : tone;
    const className = ink ? `play-cell ${ink}` : "play-cell";
    if (span.className !== className) span.className = className;
    if (span.textContent !== text) span.textContent = text;
  });
}

export function createPadelView(env) {
  let playTimer = 0;
  let playFitObserver = null;
  let playJob = null;

  function stop() {
    cancelAnimationFrame(playTimer);
    playTimer = 0;
    playFitObserver?.disconnect();
    playFitObserver = null;
    env.scrollback.classList.remove("is-play");
    env.element.classList.remove("is-match");
  }

  function start() {
    stop();
    env.scrollback.querySelectorAll(":scope > .output.play").forEach((node) => node.classList.remove("play"));
    const sim = createPadel();
    const panel = document.createElement("div");
    panel.className = "output play";
    const view = document.createElement("div");
    view.className = "play-view";
    const title = document.createElement("div");
    title.className = "play-title";
    title.textContent = sim.title();
    const stage = document.createElement("div");
    stage.className = "play-stage";
    const plot = document.createElement("div");
    plot.className = "play-plot";
    const flash = document.createElement("div");
    flash.className = "play-flash";
    flash.hidden = true;
    const art = document.createElement("pre");
    art.className = "play-flash-art";
    flash.append(art);
    stage.append(plot, flash);
    const history = document.createElement("div");
    history.className = "play-log";
    view.append(title, stage, history);
    panel.append(view);
    env.scrollback.insertBefore(panel, env.form);
    env.scrollback.classList.add("is-play");
    const startedAt = performance.now();
    let closed = false;
    let gridRows = 0;
    let gridCols = 0;
    let spans = [];
    let flashKey = "";

    const paint = () => {
      title.textContent = sim.title();
      const call = sim.highlight();
      const key = call ? `${call.word}:${call.home ?? ""}:${call.away ?? ""}:${gridCols}x${gridRows}` : "";
      if (key !== flashKey) {
        flashKey = key;
        art.textContent = bannerArt(call, gridCols, gridRows);
        art.style.fontSize = "13px";
        art.style.lineHeight = "14px";
        flash.hidden = !call;
        flash.className = call ? `play-flash is-${call.word.toLowerCase()}` : "play-flash";
        if (call) {
          const fitScale = Math.min(
            (stage.clientWidth * 0.92) / Math.max(1, art.scrollWidth),
            (stage.clientHeight * 0.82) / Math.max(1, art.scrollHeight),
          );
          if (fitScale < 1) {
            art.style.fontSize = `${Math.max(7, 13 * fitScale)}px`;
            art.style.lineHeight = `${Math.max(8, 14 * fitScale)}px`;
          }
        }
      }
      history.textContent = sim.events().slice(-5).join("\n");
      paintCells(spans, sim.cells(), gridCols);
    };

    const finish = (result) => {
      if (closed || !panel.isConnected) return;
      closed = true;
      stop();
      view.remove();
      const summary = document.createElement("div");
      summary.className = `compile-summary ${result === "Stopped" ? "is-stopped" : "is-done"}`;
      const head = document.createElement("div");
      head.className = "compile-summary-title";
      head.textContent = "Summary";
      summary.append(head);
      [
        ["Result", result],
        ["Command", "play padel"],
        ["Score", sim.score()],
        ["Size", gridCols && gridRows ? `${gridCols} × ${gridRows}` : ""],
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
      const events = sim.events();
      if (events.length) {
        const matchLog = document.createElement("div");
        matchLog.className = "play-summary-log";
        matchLog.textContent = events.join("\n");
        summary.append(matchLog);
      }
      panel.classList.remove("play");
      panel.append(summary);
      playJob = null;
      env.syncBusy();
      env.scrollToEnd();
      env.saveState();
    };

    const rebuildPlot = () => {
      plot.replaceChildren();
      spans = [];
      for (let row = 0; row < gridRows; row += 1) {
        const line = document.createElement("div");
        line.className = "play-row";
        for (let col = 0; col < gridCols; col += 1) {
          const span = document.createElement("span");
          span.className = "play-cell";
          span.textContent = " ";
          line.append(span);
          spans.push(span);
        }
        plot.append(line);
      }
    };

    const fit = () => {
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
      probe.className = "play-cell";
      probe.textContent = "0";
      plot.append(probe);
      const ch = probe.getBoundingClientRect().width || 8;
      probe.remove();
      const cols = Math.max(24, Math.floor(roomW / ch));
      const rows = Math.max(10, Math.floor(Math.max(14, roomH) / 14));
      if (rows === gridRows && cols === gridCols && spans.length === rows * cols) return;
      gridRows = rows;
      gridCols = cols;
      sim.reset(gridCols * 2, gridRows * 4);
      rebuildPlot();
      paint();
      env.scrollToEnd();
    };

    playJob = {
      stop() {
        finish("Stopped");
      },
    };
    env.syncBusy();
    fit();
    playFitObserver = new ResizeObserver(() => fit());
    playFitObserver.observe(env.scrollback);
    const tickMs = 80;
    let lastFrame = 0;
    let pending = 0;
    const frame = (now) => {
      if (closed) return;
      if (!panel.isConnected) {
        playJob = null;
        stop();
        env.syncBusy();
        return;
      }
      if (!lastFrame) lastFrame = now;
      pending += Math.min(tickMs, now - lastFrame);
      lastFrame = now;
      let steps = 0;
      while (pending >= tickMs && steps < 4) {
        sim.step();
        pending -= tickMs;
        steps += 1;
        if (sim.done) break;
      }
      if (!sim.done) sim.present(pending / tickMs);
      paint();
      if (sim.done) {
        finish("Done");
        return;
      }
      playTimer = requestAnimationFrame(frame);
    };
    playTimer = requestAnimationFrame(frame);
  }

  return {
    start,
    stop,
    abandon() {
      playJob = null;
    },
    interrupt() {
      playJob?.stop();
      playJob = null;
      stop();
    },
    get running() {
      return Boolean(playJob);
    },
  };
}
