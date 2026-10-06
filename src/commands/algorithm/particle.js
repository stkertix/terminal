import { blankGrid, paintShade, clearCell } from "./grid.js";

export function particle() {
  let cols = 0;
  let rows = 0;
  let cells = [];
  let parts = [];
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      const count = Math.max(8, Math.min(60, Math.floor((cols * rows) / 16)));
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * cols,
        y: Math.random() * rows * 0.35,
        vx: (Math.random() - 0.5) * Math.max(0.8, cols * 0.02),
        vy: Math.random() * Math.max(0.2, rows * 0.008),
      }));
      this.step();
    },
    step() {
      parts.forEach((part) => {
        part.vy += Math.max(0.045, rows * 0.004);
        part.x += part.vx;
        part.y += part.vy;
        if (part.x < 0) {
          part.x = 0;
          part.vx *= -0.85;
        } else if (part.x >= cols) {
          part.x = cols - 1;
          part.vx *= -0.85;
        }
        if (part.y < 0) {
          part.y = 0;
          part.vy *= -0.5;
        } else if (part.y >= rows) {
          part.y = rows - 1;
          part.vy *= -0.75;
          part.vx *= 0.98;
          if (Math.abs(part.vy) < rows * 0.012) part.vy = -(0.45 + Math.random() * 0.45) * Math.max(1, rows / 12);
        }
      });
      cells.forEach(clearCell);
      parts.forEach((part) => {
        const x = Math.max(0, Math.min(cols - 1, Math.floor(part.x)));
        const y = Math.max(0, Math.min(rows - 1, Math.floor(part.y)));
        paintShade(cells[y * cols + x], Math.min(1, Math.hypot(part.vx, part.vy) / 1.6));
      });
    },
    cells() {
      return cells;
    },
    progress() {
      return 0;
    },
  };
}
