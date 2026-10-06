import { blankGrid, paintShade } from "./grid.js";

export function wave() {
  let cols = 0;
  let rows = 0;
  let cells = [];
  let phase = 0;
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      phase = 0;
      this.step();
    },
    step() {
      phase += 0.28;
      const leftX = cols * 0.32;
      const rightX = cols * 0.68;
      const midY = rows * 0.5;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const left = Math.hypot(x - leftX, (y - midY) * 0.9);
          const right = Math.hypot(x - rightX, (y - midY) * 0.9);
          const amplitude = 0.5 + 0.25 * (Math.sin(left * 0.35 - phase) + Math.sin(right * 0.35 - phase));
          paintShade(cells[y * cols + x], amplitude);
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
