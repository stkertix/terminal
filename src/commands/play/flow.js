export function playNote(started, finished, note) {
  if (!started) return "Press Enter";
  if (finished) return "Enter · new match    Esc · exit";
  return note || "";
}

export function listenPlayKeys(env, handlers) {
  const onKey = (event) => {
    if (handlers.closed()) return;
    if (!env.element.classList.contains("is-active")) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      if (!env.element.contains(event.target)) return;
    }
    if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") return;
    const waiting = handlers.waiting();
    const finished = handlers.finished();
    if (!waiting && !finished) return;
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Enter") {
      if (waiting) handlers.start();
      else handlers.again();
      return;
    }
    handlers.exit(waiting ? "Stopped" : "Done");
  };
  document.addEventListener("keydown", onKey, true);
  return () => document.removeEventListener("keydown", onKey, true);
}
