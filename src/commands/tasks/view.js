export function createTasksView(env) {
  let taskListener = null;
  let taskEvent = null;
  let taskPort = null;

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    const digits = unit === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unit]}`;
  }

  function taskTitle(process) {
    const tasks = Array.isArray(process.tasks) ? process.tasks : [];
    const title = tasks.find((task) => typeof task?.title === "string" && task.title)?.title;
    if (!title) return "—";
    if (tasks.length > 1) return `${title} (+${tasks.length - 1})`;
    return title;
  }

  function taskRows(processes) {
    const types = {
      browser: "Browser",
      renderer: "Tab",
      extension: "Extension",
      gpu: "GPU",
      utility: "Utility",
      notification: "Notification",
      plugin: "Plugin",
      nacl: "NaCl",
      worker: "Worker",
      service_worker: "Service worker",
      other: "Other",
    };
    return Object.values(processes || {})
      .filter((process) => process && typeof process === "object")
      .map((process) => ({
        cpu: Number.isFinite(process.cpu) ? process.cpu : null,
        memory: Number.isFinite(process.privateMemory) ? process.privateMemory : null,
        pid: Number.isFinite(process.osProcessId) ? process.osProcessId : process.id,
        type: types[process.type] || process.type || "Other",
        title: taskTitle(process),
      }))
      .sort((a, b) => (b.cpu ?? -1) - (a.cpu ?? -1) || (b.memory ?? -1) - (a.memory ?? -1));
  }

  function stopTaskManager() {
    if (taskListener && taskEvent?.removeListener) taskEvent.removeListener(taskListener);
    taskListener = null;
    taskEvent = null;
    if (taskPort) {
      const port = taskPort;
      taskPort = null;
      try {
        port.disconnect();
      } catch {
        /* The port is already closed. */
      }
    }
  }

  function nativeProcessMap(rows) {
    const labels = {
      renderer: "Renderer",
      gpu: "GPU",
      utility: "Utility",
      browser: "Browser",
      plugin: "Plugin",
    };
    const processes = {};
    rows.forEach((row) => {
      if (!row || typeof row !== "object") return;
      processes[row.pid] = {
        osProcessId: row.pid,
        cpu: row.cpu,
        privateMemory: row.memory,
        type: labels[row.type] || "Other",
        tasks: [{ title: row.title }],
      };
    });
    return processes;
  }

  function paintTasks(body, meta, processes) {
    const rows = taskRows(processes);
    const total = rows.reduce((sum, row) => sum + (row.memory ?? 0), 0);
    meta.textContent = `${rows.length} processes · ${formatBytes(total)}`;
    body.replaceChildren();
    rows.forEach((row) => {
      const line = document.createElement("div");
      line.className = "taskman-row";
      [row.cpu === null ? "—" : `${row.cpu.toFixed(1)}%`, row.memory === null ? "—" : formatBytes(row.memory), String(row.pid ?? "—"), row.type, row.title].forEach((text, index) => {
        const cell = document.createElement("span");
        cell.textContent = text;
        if (index === 4) cell.className = "taskman-task";
        line.append(cell);
      });
      body.append(line);
    });
  }

  function createTaskPanel() {
    const panel = document.createElement("div");
    panel.className = "output taskman";
    const title = document.createElement("div");
    title.className = "taskman-title";
    title.textContent = "Chrome task manager";
    const meta = document.createElement("div");
    meta.className = "taskman-meta";
    meta.textContent = "Reading processes…";
    const table = document.createElement("div");
    table.className = "taskman-table";
    const head = document.createElement("div");
    head.className = "taskman-row taskman-head";
    ["CPU", "Memory", "PID", "Type", "Task"].forEach((label) => {
      const cell = document.createElement("span");
      cell.textContent = label;
      if (label === "Task") cell.className = "taskman-task";
      head.append(cell);
    });
    const body = document.createElement("div");
    table.append(head, body);
    panel.append(title, meta, table);
    env.scrollback.insertBefore(panel, env.form);
    env.scrollToEnd();
    return { panel, body, meta };
  }

  function startTaskManager() {
    stopTaskManager();
    const processesApi = globalThis.chrome?.processes;
    const canNative = Boolean(globalThis.chrome?.runtime?.connectNative);
    if (!processesApi?.getProcessInfo && !canNative) {
      env.appendOutput("top: Chrome task manager is unavailable. Open Terminal from the extension icon.");
      return;
    }

    const { panel, body, meta } = createTaskPanel();
    const paint = (processes) => {
      if (!panel.isConnected) {
        stopTaskManager();
        return;
      }
      paintTasks(body, meta, processes);
    };

    if (processesApi?.getProcessInfo) {
      taskEvent = processesApi.onUpdatedWithMemory || processesApi.onUpdated || null;
      taskListener = paint;
      taskEvent?.addListener(taskListener);
      processesApi.getProcessInfo([], true).then(
        (processes) => {
          if (taskListener) paint(processes);
        },
        () => {
          if (!panel.isConnected) return;
          meta.textContent = "Unable to read the Chrome task manager.";
          stopTaskManager();
        }
      );
      return;
    }

    let port;
    try {
      port = globalThis.chrome.runtime.connectNative("com.terminal.tasks");
    } catch {
      meta.textContent = "Unable to read the Chrome task manager.";
      return;
    }
    taskPort = port;
    let saw = false;
    port.onMessage.addListener((message) => {
      if (message?.type !== "processes" || !Array.isArray(message.rows)) return;
      saw = true;
      paint(nativeProcessMap(message.rows));
    });
    port.onDisconnect.addListener(() => {
      if (taskPort === port) taskPort = null;
      if (!panel.isConnected || saw) return;
      const message = globalThis.chrome?.runtime?.lastError?.message || "";
      meta.textContent = message.includes("not found")
        ? "Task host is not installed. Run native/install-macos.sh and reload the extension."
        : message || "Unable to read the Chrome task manager.";
    });
  }

  return { start: startTaskManager, stop: stopTaskManager };
}
