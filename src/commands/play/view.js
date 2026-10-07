import { GAMES } from "./command.js";
import { createPlayPick } from "./pick.js";
import { createBadmintonView } from "./badminton/view.js";
import { createMini4wdView } from "./mini4wd/view.js";
import { createPadelView } from "./padel/view.js";
import { createSoccerView } from "./soccer/view.js";

export function createPlayView(env) {
  const games = {
    soccer: createSoccerView(env),
    padel: createPadelView(env),
    badminton: createBadmintonView(env),
    "mini-4wd": createMini4wdView(env),
  };
  let active = null;
  let picker = null;

  const clearPicker = () => {
    picker?.stop();
    picker = null;
  };

  const begin = (name) => {
    const next = games[name];
    if (!next) throw new Error(`Unknown game: ${name}`);
    if (active && active !== next) active.stop();
    active = next;
    active.start();
  };

  return {
    pick() {
      if (active) {
        active.stop();
        active = null;
      }
      clearPicker();
      picker = createPlayPick(env, GAMES, {
        choose: begin,
        cancel() {
          env.syncBusy();
          env.saveState();
        },
      });
      picker.start();
    },
    start(name) {
      clearPicker();
      begin(name);
    },
    stop() {
      clearPicker();
      active?.stop();
    },
    abandon() {
      clearPicker();
      active?.abandon();
    },
    interrupt() {
      if (picker?.running) {
        clearPicker();
        return;
      }
      active?.interrupt();
    },
    get running() {
      return Boolean(picker?.running || active?.running);
    },
  };
}
