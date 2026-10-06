import { DIRS, blankGrid, light, passageCount } from "./grid.js";

export function maze() {
  let cols = 0;
  let rows = 0;
  let cells = [];
  let walls = new Uint8Array();
  let stack = [];
  let carved = 0;
  let total = 0;
  const at = (x, y) => y * cols + x;
  const draw = () => {
    for (let index = 0; index < walls.length; index += 1) {
      if (walls[index]) light(cells[index], "is-indigo");
      else light(cells[index], "is-green");
    }
    if (stack.length) {
      const [x, y] = stack[stack.length - 1];
      light(cells[at(x, y)], "is-yellow");
    }
  };
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      walls = new Uint8Array(cols * rows);
      walls.fill(1);
      stack = [];
      carved = 0;
      total = passageCount(cols, rows);
      this.done = total === 0;
      if (!this.done) {
        walls[at(1, 1)] = 0;
        stack.push([1, 1]);
        carved = 1;
      }
      draw();
    },
    step() {
      if (this.done) return;
      const pace = Math.max(6, Math.ceil(total / 40));
      for (let count = 0; count < pace && stack.length; count += 1) {
        const [x, y] = stack[stack.length - 1];
        const options = [];
        DIRS.forEach(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && walls[at(nx, ny)] === 1) options.push([nx, ny, dx, dy]);
        });
        if (!options.length) {
          stack.pop();
          continue;
        }
        const pick = options[Math.floor(Math.random() * options.length)];
        walls[at(x + pick[2] / 2, y + pick[3] / 2)] = 0;
        walls[at(pick[0], pick[1])] = 0;
        carved += 1;
        stack.push([pick[0], pick[1]]);
      }
      if (!stack.length) this.done = true;
      draw();
    },
    cells() {
      return cells;
    },
    progress() {
      if (!total) return 100;
      return Math.min(100, Math.round((carved / total) * 100));
    },
  };
}
