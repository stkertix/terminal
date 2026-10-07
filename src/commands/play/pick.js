export function createPlayPick(env, games, hooks) {
  let panel = null;
  let list = null;
  let cursor = 0;
  let open = false;
  let detach = () => {};

  const paint = () => {
    if (!list) return;
    list.replaceChildren(...games.map((name, index) => {
      const row = document.createElement("div");
      row.className = index === cursor ? "play-pick-item is-selected" : "play-pick-item";
      row.textContent = `${index === cursor ? ">" : " "} ${name}`;
      return row;
    }));
  };

  const close = () => {
    open = false;
    detach();
    detach = () => {};
    panel?.remove();
    panel = null;
    list = null;
    env.scrollback.classList.remove("is-play");
  };

  const onKey = (event) => {
    if (!open || !env.element.classList.contains("is-active")) return;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      cursor = (cursor - 1 + games.length) % games.length;
      paint();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      cursor = (cursor + 1) % games.length;
      paint();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const name = games[cursor];
      close();
      hooks.choose(name);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      hooks.cancel();
    }
  };

  return {
    start() {
      close();
      open = true;
      cursor = 0;
      panel = document.createElement("div");
      panel.className = "output play play-pick";
      const hint = document.createElement("div");
      hint.className = "play-pick-hint";
      hint.textContent = "Arrow keys move. Enter starts. Esc leaves.";
      list = document.createElement("div");
      panel.append(hint, list);
      env.scrollback.insertBefore(panel, env.form);
      env.scrollback.classList.add("is-play");
      document.addEventListener("keydown", onKey, true);
      detach = () => document.removeEventListener("keydown", onKey, true);
      paint();
      env.syncBusy();
      env.scrollToEnd();
    },
    stop() {
      close();
    },
    get running() {
      return open;
    },
  };
}
