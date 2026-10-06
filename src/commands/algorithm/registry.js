import { matrix } from "./matrix.js";
import { fractal } from "./fractal.js";
import { donut } from "./donut.js";
import { maze } from "./maze.js";
import { sortBars } from "./sort.js";
import { conway } from "./conway.js";
import { particle } from "./particle.js";
import { labyrinth } from "./labyrinth.js";
import { lorenz } from "./lorenz.js";
import { wave } from "./wave.js";

export const ALGORITHMS = ["matrix", "fractal", "donut", "maze", "sort", "conway", "particle", "labyrinth", "lorenz", "wave"];

const FINITE = new Set(["maze", "sort", "labyrinth"]);
const BUILDERS = { matrix, fractal, donut, maze, sort: sortBars, conway, particle, labyrinth, lorenz, wave };

export function createAlgorithm(name) {
  const sim = BUILDERS[name]();
  const finite = FINITE.has(name);
  return {
    finite,
    reset(cols, rows) {
      sim.reset(cols, rows);
    },
    step() {
      sim.step();
    },
    cells() {
      return sim.cells();
    },
    progress() {
      return finite ? sim.progress() : null;
    },
    get done() {
      return sim.done;
    },
  };
}
