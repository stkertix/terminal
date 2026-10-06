import { COMPILERS } from "./command.js";
import { formatRemaining, compileStamp } from "../format.js";
import { compilerProfile, logLine } from "./profiles.js";

export function createCompileView(env) {
  let compileTimer = 0;
  let compileLogTimer = 0;
  let compileFitObserver = null;
  let compileLogNode = null;
  let compileJob = null;

  function stopCompile() {
    clearInterval(compileTimer);
    compileTimer = 0;
    clearTimeout(compileLogTimer);
    compileLogTimer = 0;
    compileFitObserver?.disconnect();
    compileFitObserver = null;
    if (compileLogNode) compileLogNode.style.height = "";
    compileLogNode = null;
    env.scrollback.classList.remove("is-compile");
  }

  function compileLogDelay() {
    const roll = Math.random() * 100;
    if (roll < 50) return 1;
    if (roll < 80) return 50;
    if (roll < 90) return 100;
    if (roll < 95) return 500;
    return 3000;
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
      const styles = getComputedStyle(env.scrollback);
      const padTop = parseFloat(styles.paddingTop) || 0;
      const padBottom = parseFloat(styles.paddingBottom) || 0;
      const margin = parseFloat(getComputedStyle(panel).marginTop) + parseFloat(getComputedStyle(panel).marginBottom);
      log.style.height = "0px";
      const room = Math.max(0, env.scrollback.clientHeight - padTop - padBottom - panel.offsetHeight - margin);
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
    env.scrollback.insertBefore(panel, env.form);
    env.scrollback.classList.add("is-compile");
    env.scrollToEnd();
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
      env.scrollToEnd();
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
    env.syncBusy();
    fitCompileLog();
    compileFitObserver = new ResizeObserver(() => fitCompileLog());
    compileFitObserver.observe(env.scrollback);

    compileTimer = setInterval(() => {
      if (!panel.isConnected) {
        if (compileJob) compileJob = null;
        stopCompile();
        env.syncBusy();
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
        env.syncBusy();
        env.scheduleSave();
        return;
      }
      status.textContent = `${percent}% · ${formatRemaining(duration - elapsed)}`;
    }, 200);
  }

  return {
    start: startCompile,
    stop: stopCompile,
    abandon() {
      compileJob = null;
    },
    interrupt() {
      compileJob?.stop();
      compileJob = null;
      stopCompile();
    },
    get running() {
      return Boolean(compileJob);
    },
  };
}
