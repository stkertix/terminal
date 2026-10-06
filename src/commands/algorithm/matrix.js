import { blankGrid, light, clearCell } from "./grid.js";

export function matrix() {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let cols = 0;
  let rows = 0;
  let drops = [];
  let cells = [];
  const glyph = () => chars[Math.floor(Math.random() * chars.length)];
  const draw = () => {
    for (let col = 0; col < cols; col += 1) {
      const drop = drops[col];
      for (let row = 0; row < rows; row += 1) {
        const cell = cells[row * cols + col];
        const dist = drop.head - row;
        if (dist < 0 || dist > drop.length) {
          clearCell(cell);
          cell.glyph = " ";
        } else {
          light(cell, dist < 1 ? "is-matrix-head" : dist > drop.length * 0.65 ? "is-matrix-dim" : "is-matrix");
          cell.glyph = drop.glyphs[row];
        }
      }
    }
  };
  const nextDrop = (head) => ({
    head,
    speed: 0.15 + Math.random() * 0.7,
    length: 3 + Math.floor(Math.random() * Math.max(1, rows / 2)),
    glyphs: Array.from({ length: rows }, glyph),
  });
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      drops = Array.from({ length: cols }, () => nextDrop(Math.random() * rows));
      draw();
    },
    step() {
      drops.forEach((drop, index) => {
        drop.head += drop.speed;
        if (drop.head - drop.length > rows) {
          drops[index] = nextDrop(-Math.random() * rows * 0.35);
          return;
        }
        const headRow = Math.floor(drop.head);
        if (headRow >= 0 && headRow < rows) drop.glyphs[headRow] = glyph();
      });
      draw();
    },
    cells() {
      return cells;
    },
    progress() {
      return 0;
    },
  };
}
