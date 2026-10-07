function renderLine(item) {
  const row = document.createElement("div");
  if (item.divider) {
    row.className = "play-log-line is-divider";
    row.textContent = item.divider;
    return row;
  }
  row.className = "play-log-line";
  const time = document.createElement("span");
  time.className = "play-log-time";
  time.textContent = `${item.time} - `;
  row.append(time);
  item.parts.forEach((part) => {
    const bit = document.createElement("span");
    bit.className = `play-log-${part.tone}`;
    bit.textContent = part.text;
    row.append(bit);
  });
  return row;
}

const followLog = new WeakMap();

export function mountPlayLog(history) {
  const log = document.createElement("div");
  log.className = "play-log-scroll";
  followLog.set(log, true);
  log.addEventListener("scroll", () => {
    if (log.clientHeight === 0) return;
    const slack = log.scrollHeight - log.scrollTop - log.clientHeight;
    followLog.set(log, slack <= 16);
  });
  history.append(log);
  return log;
}

export function clearPlayLog(log) {
  log.replaceChildren();
  followLog.set(log, true);
  log.scrollTop = 0;
}

export function paintPlayLog(log, feed) {
  for (let index = log.childElementCount; index < feed.length; index += 1) {
    log.append(renderLine(feed[index]));
  }
  if (followLog.get(log) !== false) log.scrollTop = log.scrollHeight;
}
