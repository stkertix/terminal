import { blankGrid, light, clearCell } from "./grid.js";

export function sortBars() {
  let cols = 0;
  let rows = 0;
  let cells = [];
  let values = [];
  let index = 0;
  let scan = 1;
  let min = 0;
  const draw = () => {
    for (let col = 0; col < cols; col += 1) {
      let tone = "is-blue";
      if (col < index) tone = "is-green";
      else if (col === index || col === min) tone = "is-yellow";
      else if (col === scan) tone = "is-orange";
      const height = Math.max(1, Math.min(rows, values[col]));
      for (let row = 0; row < rows; row += 1) {
        const cell = cells[row * cols + col];
        if (rows - 1 - row < height) light(cell, tone);
        else clearCell(cell);
      }
    }
  };
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      values = Array.from({ length: cols }, () => 1 + Math.floor(Math.random() * rows));
      index = 0;
      scan = 1;
      min = 0;
      this.done = cols < 2;
      draw();
    },
    step() {
      if (this.done) return;
      const pace = Math.max(8, Math.ceil((cols * cols) / 80));
      for (let count = 0; count < pace && !this.done; count += 1) {
        if (index >= cols - 1) {
          this.done = true;
          break;
        }
        if (scan >= cols) {
          const current = values[index];
          values[index] = values[min];
          values[min] = current;
          index += 1;
          min = index;
          scan = index + 1;
          if (index >= cols - 1) this.done = true;
          continue;
        }
        if (values[scan] < values[min]) min = scan;
        scan += 1;
      }
      draw();
    },
    cells() {
      return cells;
    },
    progress() {
      if (cols < 2) return 100;
      return Math.min(100, Math.round((index / (cols - 1)) * 100));
    },
  };
}
