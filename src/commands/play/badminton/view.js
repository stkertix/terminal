import { formatRemaining, compileStamp } from "../../format.js";
import { listenPlayKeys, playNote } from "../flow.js";
import { clearPlayLog, mountPlayLog, paintPlayLog } from "../log.js";
import { createBadminton } from "./badminton.js";

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

export function createBadmintonView(env) {
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
    let sim = createBadminton();
    let started = false;
    let detachKeys = () => {};
    const panel = document.createElement("div");
    panel.className = "output play";
    const view = document.createElement("div");
    view.className = "play-view is-badminton";
    const title = document.createElement("div");
    title.className = "play-head";
    const homeMark = document.createElement("span");
    homeMark.className = "play-team is-home";
    homeMark.textContent = "HOME";
    const scoreMark = document.createElement("span");
    const awayMark = document.createElement("span");
    awayMark.className = "play-team is-away";
    awayMark.textContent = "AWAY";
    const scoreLine = document.createElement("div");
    scoreLine.className = "play-score";
    scoreLine.append(homeMark, scoreMark, awayMark);
    const noteMark = document.createElement("div");
    noteMark.className = "play-note";
    const clockBlock = document.createElement("div");
    clockBlock.className = "play-clock-block";
    const clockTime = document.createElement("div");
    clockTime.className = "play-clock-time";
    const clockPeriod = document.createElement("div");
    clockPeriod.className = "play-period";
    clockBlock.append(clockTime, clockPeriod);
    title.append(scoreLine, noteMark, clockBlock);
    const makeSide = (place) => {
      const card = document.createElement("div");
      card.className = `play-side is-${place}`;
      const playerName = document.createElement("div");
      playerName.className = "play-side-name";
      const role = document.createElement("div");
      role.className = "play-side-role";
      const track = document.createElement("div");
      track.className = "play-stamina";
      const bar = document.createElement("div");
      bar.className = "play-stamina-bar";
      track.append(bar);
      card.append(playerName, role, track);
      return card;
    };
    const homeCard = makeSide("home");
    const awayCard = makeSide("away");
    const plotTop = document.createElement("div");
    plotTop.className = "play-plot";
    const plotSide = document.createElement("div");
    plotSide.className = "play-plot";
    const plotGap = document.createElement("div");
    plotGap.hidden = true;
    const caption = document.createElement("div");
    caption.className = "play-call";
    caption.hidden = true;
    const bottom = document.createElement("div");
    bottom.className = "play-bottom";
    bottom.append(homeCard, caption, awayCard);
    const field = document.createElement("div");
    field.className = "play-field";
    field.append(title, plotTop, bottom, plotSide, plotGap);
    const history = document.createElement("div");
    history.className = "play-log";
    const log = mountPlayLog(history);
    view.append(field, history);
    panel.append(view);
    env.scrollback.insertBefore(panel, env.form);
    env.scrollback.classList.add("is-play");
    env.element.classList.add("is-match");
    const startedAt = performance.now();
    let closed = false;
    let gridRows = 0;
    let gridCols = 0;
    let spans = [];

    const paintSide = (card, player, team) => {
      card.hidden = !player;
      if (!player) return;
      const playerName = card.querySelector(".play-side-name");
      playerName.className = `play-side-name ${team}`;
      playerName.textContent = player.name;
      card.querySelector(".play-side-role").textContent = player.role;
      const value = Math.max(0, Math.min(100, player.stamina));
      const mix = (from, to) => Math.round(from + (to - from) * (value / 100));
      const bar = card.querySelector(".play-stamina-bar");
      bar.style.width = `${value}%`;
      bar.style.background = `rgb(${mix(255, 61)}, ${mix(77, 214)}, ${mix(77, 140)})`;
    };

    const paint = () => {
      const board = sim.hud();
      scoreMark.textContent = ` ${board.home} - ${board.away} `;
      noteMark.textContent = playNote(started, sim.holding, board.note);
      clockTime.textContent = board.time;
      clockPeriod.textContent = board.period;
      paintSide(homeCard, board.homePlayer, "is-home");
      paintSide(awayCard, board.awayPlayer, "is-away");
      const line = started ? sim.commentary() : { text: "Press Enter to start.", tone: "neutral" };
      caption.hidden = !line.text;
      caption.textContent = line.text;
      caption.className = line.text ? `play-call is-${line.tone}` : "play-call";
      paintPlayLog(log, sim.feed());
      paintCells(spans, sim.cells(), gridCols);
    };

    const finish = (result) => {
      if (closed || !panel.isConnected) return;
      closed = true;
      detachKeys();
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
        ["Command", "play badminton"],
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
      panel.classList.remove("play");
      panel.append(summary);
      playJob = null;
      env.syncBusy();
      env.scrollToEnd();
      env.saveState();
    };

    const rebuildPlot = () => {
      plotTop.replaceChildren();
      plotSide.replaceChildren();
      plotGap.replaceChildren();
      spans = [];
      const bands = sim.bands();
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
        const host = row < bands.courtRows ? plotTop : row < bands.sideRow ? plotGap : plotSide;
        host.append(line);
      }
    };

    const fit = () => {
      if (!panel.isConnected || closed) return;
      const styles = getComputedStyle(env.scrollback);
      const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      const panelStyles = getComputedStyle(panel);
      const marginY = (parseFloat(panelStyles.marginTop) || 0) + (parseFloat(panelStyles.marginBottom) || 0);
      const chrome = panel.offsetHeight - plotTop.offsetHeight - plotSide.offsetHeight;
      const roomH = env.scrollback.clientHeight - padY - chrome - env.form.offsetHeight - marginY;
      const roomW = env.scrollback.clientWidth - padX;
      const probe = document.createElement("span");
      probe.className = "play-cell";
      probe.textContent = "0";
      plotTop.append(probe);
      const ch = probe.getBoundingClientRect().width || 8;
      probe.remove();
      const pitch = sim.pitch();
      const rowH = 14;
      const logPx = 34 * ch + 16;
      const maxW = Math.max(ch * 16, roomW - logPx);
      const maxH = Math.max(rowH * 8, roomH);
      const dotX = ch / 2;
      const dotY = rowH / 4;
      const colsFor = (pitchRows) => {
        const dotH = pitchRows * 4 - 3;
        const dotW = (pitch.length / pitch.width) * dotH * (dotY / dotX);
        return Math.max(16, Math.round((dotW + 3) / 2));
      };
      let rows = Math.max(8, Math.floor(maxH / rowH));
      let cols = colsFor(rows);
      while (rows > 8 && cols * ch > maxW + 0.5) {
        rows -= 1;
        cols = colsFor(rows);
      }
      if (cols * ch > maxW + 0.5) {
        cols = Math.max(16, Math.floor(maxW / ch));
        const dotW = Math.max(8, cols * 2 - 3);
        const dotH = dotW * (pitch.width / pitch.length) * (dotX / dotY);
        rows = Math.max(8, Math.round((dotH + 3) / 4));
        cols = colsFor(rows);
        if (cols * ch > maxW + 0.5) cols = Math.max(16, Math.floor(maxW / ch));
      }
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
    const restart = () => {
      sim = createBadminton();
      clearPlayLog(log);
      started = true;
      pending = 0;
      lastFrame = 0;
      if (gridCols && gridRows) sim.reset(gridCols * 2, gridRows * 4);
      paint();
    };
    detachKeys = listenPlayKeys(env, {
      closed: () => closed,
      waiting: () => !started,
      finished: () => sim.holding,
      start() {
        started = true;
        pending = 0;
        lastFrame = 0;
      },
      again: restart,
      exit: finish,
    });
    const frame = (now) => {
      if (closed) return;
      if (!panel.isConnected) {
        detachKeys();
        playJob = null;
        stop();
        env.syncBusy();
        return;
      }
      if (!started) {
        pending = 0;
        lastFrame = now;
        paint();
        playTimer = requestAnimationFrame(frame);
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
        if (sim.done || sim.holding) break;
      }
      if (!sim.done && !sim.holding) sim.present(pending / tickMs);
      paint();
      if (sim.holding || !sim.done) {
        playTimer = requestAnimationFrame(frame);
        return;
      }
      finish("Done");
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
