import { TONES, blankGrid, paintShade, clearCell } from "./grid.js";

export function fractal() {
  let cols = 0;
  let rows = 0;
  let cells = [];
  let zoom = 1;
  const targetX = -0.743643887037151;
  const targetY = 0.13182590420533;
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      zoom = 1;
      this.step();
    },
    step() {
      zoom *= 1.04;
      if (zoom > 500) zoom = 1;
      const blend = Math.min(1, (zoom - 1) / 40);
      const cx = -0.6 + (targetX + 0.6) * blend;
      const cy = targetY * blend;
      const scale = 3.2 / zoom;
      const xSpan = scale * (cols / Math.max(1, rows)) * 1.14;
      const ySpan = scale;
      const maxIter = TONES.length * 3;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x0 = cx + ((cols === 1 ? 0.5 : col / (cols - 1)) - 0.5) * xSpan;
          const y0 = cy + ((rows === 1 ? 0.5 : row / (rows - 1)) - 0.5) * ySpan;
          let x = 0;
          let y = 0;
          let iter = 0;
          while (x * x + y * y <= 4 && iter < maxIter) {
            const next = x * x - y * y + x0;
            y = 2 * x * y + y0;
            x = next;
            iter += 1;
          }
          const cell = cells[row * cols + col];
          if (iter >= maxIter) clearCell(cell);
          else paintShade(cell, iter / maxIter);
        }
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
