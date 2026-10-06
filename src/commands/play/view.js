import { createPadelView } from "./padel/view.js";
import { createSoccerView } from "./soccer/view.js";

export function createPlayView(env) {
  const games = {
    soccer: createSoccerView(env),
    padel: createPadelView(env),
  };
  let active = null;

  return {
    start(name, options) {
      const next = games[name];
      if (!next) throw new Error(`Unknown game: ${name}`);
      if (active && active !== next) active.stop();
      active = next;
      active.start(options);
    },
    stop() {
      active?.stop();
    },
    abandon() {
      active?.abandon();
    },
    interrupt() {
      active?.interrupt();
    },
    get running() {
      return Boolean(active?.running);
    },
  };
}
