import { formatRemaining, compileStamp } from "../../format.js";
import { listenPlayKeys, playNote } from "../flow.js";
import { clearPlayLog, mountPlayLog, paintPlayLog } from "../log.js";
import { createChess } from "./chess.js";

export function createChessView(env) {
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
    let sim = createChess();
    let started = false;
    let detachKeys = () => {};
    const panel = document.createElement("div");
    panel.className = "output play";
    const view = document.createElement("div");
    view.className = "play-view is-chess";
    const title = document.createElement("div");
    title.className = "play-head";
    const homeMark = document.createElement("span");
    homeMark.className = "play-team is-home";
    const scoreMark = document.createElement("span");
    const awayMark = document.createElement("span");
    awayMark.className = "play-team is-away";
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
    const caption = document.createElement("div");
    caption.className = "play-call";
    caption.hidden = true;
    const bottom = document.createElement("div");
    bottom.className = "play-bottom";
    bottom.append(homeCard, caption, awayCard);
    const boardHost = document.createElement("div");
    boardHost.className = "chess-board";
    const squares = [];
    for (let rank = 0; rank < 8; rank += 1) {
      const row = document.createElement("div");
      row.className = "chess-row";
      const label = document.createElement("span");
      label.className = "chess-lab";
      label.textContent = String(8 - rank);
      row.append(label);
      for (let file = 0; file < 8; file += 1) {
        const square = document.createElement("span");
        square.className = (rank + file) % 2 ? "chess-sq is-dark" : "chess-sq is-light";
        row.append(square);
        squares.push(square);
      }
      boardHost.append(row);
    }
    const files = document.createElement("div");
    files.className = "chess-row is-files";
    const pad = document.createElement("span");
    pad.className = "chess-lab";
    files.append(pad);
    "abcdefgh".split("").forEach((file) => {
      const label = document.createElement("span");
      label.className = "chess-file";
      label.textContent = file;
      files.append(label);
    });
    boardHost.append(files);
    const field = document.createElement("div");
    field.className = "play-field";
    field.append(title, boardHost, bottom);
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

    const paintSide = (card, player, team) => {
      const playerName = card.querySelector(".play-side-name");
      playerName.className = `play-side-name ${team}`;
      playerName.textContent = player.name;
      card.querySelector(".play-side-role").textContent = player.role;
      card.classList.toggle("is-turn", Boolean(player.turn));
      const value = Math.max(0, Math.min(100, player.stamina));
      const mix = (from, to) => Math.round(from + (to - from) * (value / 100));
      const bar = card.querySelector(".play-stamina-bar");
      bar.style.width = `${value}%`;
      bar.style.background = `rgb(${mix(255, 61)}, ${mix(77, 214)}, ${mix(77, 140)})`;
    };

    const paint = () => {
      const board = sim.hud();
      homeMark.textContent = board.homeName;
      awayMark.textContent = board.awayName;
      scoreMark.textContent = ` ${board.eval} `;
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
      const squaresState = sim.board().squares;
      squares.forEach((square, index) => {
        const cell = squaresState[index];
        const dark = (Math.floor(index / 8) + (index % 8)) % 2 ? "is-dark" : "is-light";
        const marks = [
          "chess-sq",
          dark,
          cell.white ? "is-white" : cell.glyph ? "is-black" : "",
          cell.last ? "is-last" : "",
          cell.check ? "is-check" : "",
        ].filter(Boolean).join(" ");
        if (square.className !== marks) square.className = marks;
        if (square.textContent !== cell.glyph) square.textContent = cell.glyph;
      });
    };

    const finish = (outcome) => {
      if (closed || !panel.isConnected) return;
      closed = true;
      detachKeys();
      stop();
      view.remove();
      const summary = document.createElement("div");
      summary.className = `compile-summary ${outcome === "Stopped" ? "is-stopped" : "is-done"}`;
      const head = document.createElement("div");
      head.className = "compile-summary-title";
      head.textContent = "Summary";
      summary.append(head);
      [
        ["Result", outcome],
        ["Command", "play chess"],
        ["Score", sim.score()],
        ["Time", formatRemaining(performance.now() - startedAt)],
        ["Finished", compileStamp()],
      ].forEach(([label, value]) => {
        if (!value) return;
        const row = document.createElement("div");
        row.className = "compile-summary-row";
        const key = document.createElement("span");
        key.className = "compile-summary-key";
        key.textContent = label;
        const item = document.createElement("span");
        item.className = label === "Result" ? "compile-summary-result" : "compile-summary-value";
        item.textContent = value;
        row.append(key, item);
        summary.append(row);
      });
      panel.classList.remove("play");
      panel.append(summary);
      playJob = null;
      env.syncBusy();
      env.scrollToEnd();
      env.saveState();
    };

    const fit = () => {
      if (!panel.isConnected || closed) return;
      const styles = getComputedStyle(env.scrollback);
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      const room = env.scrollback.clientHeight - padY - env.form.offsetHeight - 12;
      view.style.minHeight = `${Math.max(320, room)}px`;
    };

    playJob = {
      stop() {
        finish("Stopped");
      },
    };
    env.syncBusy();
    fit();
    paint();
    playFitObserver = new ResizeObserver(() => fit());
    playFitObserver.observe(env.scrollback);
    const tickMs = 100;
    let lastFrame = 0;
    let pending = 0;
    const restart = () => {
      sim = createChess();
      clearPlayLog(log);
      started = true;
      pending = 0;
      lastFrame = 0;
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
