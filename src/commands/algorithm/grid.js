export const TONES = ["is-purple", "is-indigo", "is-blue", "is-green", "is-yellow", "is-orange", "is-red"];
export const DIRS = [[0, -2], [2, 0], [0, 2], [-2, 0]];
export const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function blankGrid(cols, rows) {
  return Array.from({ length: cols * rows }, () => ({ lit: false, tone: "" }));
}

export function shade(unit) {
  const index = Math.round(Math.min(1, Math.max(0, unit)) * (TONES.length - 1));
  return TONES[index];
}

export function light(cell, tone) {
  cell.lit = true;
  cell.tone = tone;
}

export function paintShade(cell, unit) {
  light(cell, shade(unit));
}

export function clearCell(cell) {
  cell.lit = false;
  cell.tone = "";
}

export function interiorOdd(size) {
  let value = size - 2;
  if (value % 2 === 0) value -= 1;
  return Math.max(1, value);
}

export function passageCount(cols, rows) {
  let total = 0;
  for (let y = 1; y < rows - 1; y += 2) {
    for (let x = 1; x < cols - 1; x += 2) total += 1;
  }
  return total;
}

export function carveMaze(cols, rows) {
  const walls = new Uint8Array(cols * rows);
  walls.fill(1);
  if (cols < 3 || rows < 3) return walls;
  const stack = [[1, 1]];
  walls[cols + 1] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = [];
    DIRS.forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && walls[ny * cols + nx] === 1) options.push([nx, ny, dx, dy]);
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const pick = options[Math.floor(Math.random() * options.length)];
    walls[(y + pick[3] / 2) * cols + (x + pick[2] / 2)] = 0;
    walls[pick[1] * cols + pick[0]] = 0;
    stack.push([pick[0], pick[1]]);
  }
  return walls;
}
