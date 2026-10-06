import { blankGrid, paintShade, clearCell } from "./grid.js";

export function lorenz() {
  let cols = 0;
  let rows = 0;
  let cells = [];
  let trail = new Float32Array();
  let x = 0.1;
  let y = 0;
  let z = 0;
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      trail = new Float32Array(cols * rows);
      x = 0.1;
      y = 0;
      z = 0;
    },
    step() {
      const sigma = 10;
      const rho = 28;
      const beta = 8 / 3;
      const dt = 0.012;
      for (let count = 0; count < 16; count += 1) {
        const dx = sigma * (y - x);
        const dy = x * (rho - z) - y;
        const dz = x * y - beta * z;
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
        const col = Math.floor(((x + 22) / 46) * (cols - 1));
        const row = Math.floor((1 - z / 55) * (rows - 1));
        if (col >= 0 && row >= 0 && col < cols && row < rows) trail[row * cols + col] = 1;
      }
      for (let index = 0; index < trail.length; index += 1) {
        trail[index] *= 0.9;
        if (trail[index] < 0.05) clearCell(cells[index]);
        else paintShade(cells[index], trail[index]);
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
