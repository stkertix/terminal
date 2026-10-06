import { formatRemaining, compileStamp } from "../format.js";

export function createMonitorView(env) {
  let monitorTimer = 0;
  let monitorFitObserver = null;
  let monitorJob = null;

  function stopMonitor() {
    clearInterval(monitorTimer);
    monitorTimer = 0;
    monitorFitObserver?.disconnect();
    monitorFitObserver = null;
    env.scrollback.classList.remove("is-monitor");
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
    env.scrollback.insertBefore(panel, env.form);
    env.scrollback.classList.add("is-monitor");
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
      env.syncBusy();
      env.scrollToEnd();
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
      const styles = getComputedStyle(env.scrollback);
      const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      const panelStyles = getComputedStyle(panel);
      const marginY = (parseFloat(panelStyles.marginTop) || 0) + (parseFloat(panelStyles.marginBottom) || 0);
      const chrome = panel.offsetHeight - plot.offsetHeight;
      const roomH = env.scrollback.clientHeight - padY - chrome - env.form.offsetHeight - marginY;
      const roomW = env.scrollback.clientWidth - padX;
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
      env.scrollToEnd();
    };
    monitorJob = {
      stop() {
        finishMonitor("Stopped");
      },
    };
    env.syncBusy();
    fitMonitor();
    monitorFitObserver = new ResizeObserver(() => fitMonitor());
    monitorFitObserver.observe(env.scrollback);
    monitorTimer = setInterval(() => {
      if (!panel.isConnected) {
        monitorJob = null;
        stopMonitor();
        env.syncBusy();
        return;
      }
      if (chart === "heatmap") advanceDefrag();
      else tick();
    }, chart === "heatmap" ? 90 : 1000);
  }

  return {
    start: startMonitor,
    stop: stopMonitor,
    abandon() {
      monitorJob = null;
    },
    interrupt() {
      monitorJob?.stop();
      monitorJob = null;
      stopMonitor();
    },
    get running() {
      return Boolean(monitorJob);
    },
  };
}
