import { blankGrid, light, clearCell } from "./grid.js";

export function conway() {
  let cols = 0;
  let rows = 0;
  let cells = [];
  let grid = [];
  const seed = () => {
    grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (Math.random() < 0.22 ? 1 : 0)));
  };
  const draw = () => {
    let alive = 0;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const cell = cells[y * cols + x];
        if (grid[y][x]) {
          light(cell, "is-green");
          alive += 1;
        } else clearCell(cell);
      }
    }
    return alive;
  };
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      seed();
      draw();
    },
    step() {
      const next = grid.map((row) => row.slice());
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (!dx && !dy) continue;
              const yy = y + dy;
              const xx = x + dx;
              if (yy >= 0 && xx >= 0 && yy < rows && xx < cols && grid[yy][xx]) neighbors += 1;
            }
          }
          next[y][x] = grid[y][x] ? (neighbors === 2 || neighbors === 3 ? 1 : 0) : (neighbors === 3 ? 1 : 0);
        }
      }
      grid = next;
      if (!draw()) {
        seed();
        draw();
      }
    },
    cells() {
      return cells;
    },
    progress() {
      return 0;
    },
  };
}
