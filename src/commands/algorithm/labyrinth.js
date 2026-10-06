import { STEPS, blankGrid, light, clearCell, interiorOdd, carveMaze } from "./grid.js";

export function labyrinth() {
  let cols = 0;
  let rows = 0;
  let cells = [];
  let walls = new Uint8Array();
  let open = [];
  let inOpen = new Uint8Array();
  let closed = new Uint8Array();
  let parent = new Int32Array();
  let gScore = new Float64Array();
  let goal = 0;
  let seen = 0;
  let total = 0;
  let path = new Set();
  const draw = () => {
    for (let index = 0; index < walls.length; index += 1) {
      if (walls[index]) light(cells[index], "is-indigo");
      else if (path.has(index)) light(cells[index], "is-orange");
      else if (inOpen[index]) light(cells[index], "is-yellow");
      else if (closed[index]) light(cells[index], "is-blue");
      else clearCell(cells[index]);
    }
  };
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      walls = carveMaze(cols, rows);
      open = [];
      inOpen = new Uint8Array(cols * rows);
      closed = new Uint8Array(cols * rows);
      parent = new Int32Array(cols * rows);
      parent.fill(-1);
      gScore = new Float64Array(cols * rows);
      gScore.fill(Infinity);
      path = new Set();
      seen = 0;
      total = 0;
      for (let index = 0; index < walls.length; index += 1) if (!walls[index]) total += 1;
      const start = cols + 1;
      goal = interiorOdd(rows) * cols + interiorOdd(cols);
      this.done = Boolean(walls[start] || walls[goal] || !total);
      if (!this.done) {
        open = [start];
        inOpen[start] = 1;
        gScore[start] = 0;
      }
      draw();
    },
    step() {
      if (this.done) return;
      const goalX = goal % cols;
      const goalY = Math.floor(goal / cols);
      const pace = Math.max(6, Math.ceil(total / 30));
      for (let count = 0; count < pace && open.length && !this.done; count += 1) {
        let best = 0;
        for (let cursor = 1; cursor < open.length; cursor += 1) {
          const score = (index) => gScore[index] + Math.abs((index % cols) - goalX) + Math.abs(Math.floor(index / cols) - goalY);
          if (score(open[cursor]) < score(open[best])) best = cursor;
        }
        const current = open.splice(best, 1)[0];
        inOpen[current] = 0;
        if (closed[current]) continue;
        closed[current] = 1;
        seen += 1;
        if (current === goal) {
          let walk = current;
          while (walk >= 0) {
            path.add(walk);
            walk = parent[walk];
          }
          this.done = true;
          break;
        }
        const x = current % cols;
        const y = Math.floor(current / cols);
        STEPS.forEach(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
          const next = ny * cols + nx;
          if (walls[next] || closed[next]) return;
          const tentative = gScore[current] + 1;
          if (tentative >= gScore[next]) return;
          parent[next] = current;
          gScore[next] = tentative;
          if (!inOpen[next]) {
            open.push(next);
            inOpen[next] = 1;
          }
        });
      }
      if (!open.length) this.done = true;
      draw();
    },
    cells() {
      return cells;
    },
    progress() {
      if (!total || this.done) return 100;
      return Math.min(99, Math.round((seen / total) * 100));
    },
  };
}
