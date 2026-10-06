import { formatRemaining } from "../format.js";

export function createDownloadView(env) {
  let downloadTimer = 0;
  let downloadLogTimers = [];
  let downloadJob = null;

  function stopDownload() {
    clearInterval(downloadTimer);
    downloadTimer = 0;
    downloadLogTimers.forEach((timer) => clearTimeout(timer));
    downloadLogTimers = [];
  }

  function randomLogDelay(min = 50, max = 2000) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function randomDownloadQueue(seedName) {
    const extensions = ["zip", "tar", "tar.gz", "gzip", "gz", "bak", "tgz", "7z", "rar", "iso"];
    const count = 5 + Math.floor(Math.random() * 6);
    const queue = seedName ? [seedName] : [];
    while (queue.length < count) {
      const extension = extensions[Math.floor(Math.random() * extensions.length)];
      queue.push(`${crypto.randomUUID()}.${extension}`);
    }
    const packageName = () => {
      const extension = extensions[Math.floor(Math.random() * extensions.length)];
      return `${crypto.randomUUID()}.${extension}`;
    };
    const minDuration = 60 * 1000;
    const maxDuration = 25 * 60 * 1000;
    const onion = () => {
      const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
      const bytes = crypto.getRandomValues(new Uint8Array(56));
      let address = "";
      for (let i = 0; i < bytes.length; i += 1) address += alphabet[bytes[i] % alphabet.length];
      return `http://${address}.onion`;
    };
    return queue.map((entry, index) => ({
      name: entry,
      mirror: onion(),
      index: index + 1,
      nextPackage: packageName,
      size: 8 + Math.random() * 900,
      duration: minDuration + Math.floor(Math.random() * (maxDuration - minDuration + 1)),
    }));
  }

  function packageLog(item, ratio, file) {
    const total = item.size.toFixed(1);
    if (ratio >= 1) return `Fetched ${file} [${total} MB]`;
    const received = (item.size * ratio).toFixed(1);
    return `Get:${item.index} ${file} [${received}/${total} MB]`;
  }

  function startDownload(name) {
    stopDownload();
    const items = randomDownloadQueue(typeof name === "string" ? name : "");
    const panel = document.createElement("div");
    panel.className = "output download";
    const title = document.createElement("div");
    title.className = "download-title";
    title.textContent = `Downloading ${items.length} files`;
    panel.append(title);

    const started = performance.now();
    const rows = items.map((item) => {
      const row = document.createElement("div");
      row.className = "download-item is-active";
      const label = document.createElement("div");
      label.className = "download-name";
      label.textContent = item.name;
      const status = document.createElement("div");
      status.className = "download-status";
      status.textContent = `0% · ${formatRemaining(item.duration)}`;
      const url = document.createElement("div");
      url.className = "download-url";
      url.textContent = item.mirror;
      const track = document.createElement("div");
      track.className = "download-track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", "0");
      track.setAttribute("aria-label", item.name);
      const bar = document.createElement("div");
      bar.className = "download-bar";
      const log = document.createElement("div");
      log.className = "download-log";
      const file = item.nextPackage();
      log.textContent = packageLog(item, 0, file);
      track.append(bar);
      row.append(label, status, url, track, log);
      panel.append(row);
      return { ...item, row, status, track, bar, logLine: log, file, done: false };
    });
    env.scrollback.insertBefore(panel, env.form);
    env.scrollToEnd();

    const schedulePackageLog = (item) => {
      const timer = setTimeout(() => {
        downloadLogTimers = downloadLogTimers.filter((id) => id !== timer);
        if (item.done || !item.row.isConnected) return;
        const ratio = Math.min(1, (performance.now() - started) / item.duration);
        if (ratio >= 1) return;
        item.file = item.nextPackage();
        item.logLine.textContent = packageLog(item, ratio, item.file);
        schedulePackageLog(item);
      }, randomLogDelay());
      downloadLogTimers.push(timer);
    };
    rows.forEach(schedulePackageLog);

    downloadJob = {
      stop() {
        let halted = false;
        rows.forEach((item) => {
          if (item.done) return;
          item.done = true;
          halted = true;
          item.row.classList.remove("is-active");
          item.row.classList.add("is-stopped");
          item.status.textContent = "Stopped";
        });
        if (halted) title.textContent = "Stopped";
      },
    };
    env.syncBusy();

    downloadTimer = setInterval(() => {
      if (!panel.isConnected) {
        if (downloadJob) downloadJob = null;
        stopDownload();
        env.syncBusy();
        return;
      }
      const elapsed = performance.now() - started;
      let finished = 0;
      rows.forEach((item) => {
        if (item.done) {
          finished += 1;
          return;
        }
        const ratio = Math.min(1, elapsed / item.duration);
        const percent = Math.min(100, Math.floor(ratio * 100));
        item.bar.style.width = `${ratio * 100}%`;
        item.track.setAttribute("aria-valuenow", String(percent));
        if (percent >= 100) {
          item.done = true;
          finished += 1;
          item.row.classList.remove("is-active");
          item.row.classList.add("is-done");
          item.status.textContent = "100% · 0s";
          item.logLine.textContent = packageLog(item, 1, item.file);
          return;
        }
        item.status.textContent = `${percent}% · ${formatRemaining(item.duration - elapsed)}`;
      });
      if (finished >= rows.length) {
        title.textContent = `Downloaded ${rows.length} files`;
        downloadJob = null;
        stopDownload();
        env.syncBusy();
        env.scheduleSave();
        return;
      }
      title.textContent = finished === 0 ? `Downloading ${rows.length} files` : `Downloading ${rows.length} files · ${finished} complete`;
    }, 200);
  }

  return {
    start: startDownload,
    stop: stopDownload,
    abandon() {
      downloadJob = null;
    },
    interrupt() {
      downloadJob?.stop();
      downloadJob = null;
      stopDownload();
    },
    get running() {
      return Boolean(downloadJob);
    },
  };
}
