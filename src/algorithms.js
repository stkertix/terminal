const TONES = ["is-purple", "is-indigo", "is-blue", "is-green", "is-yellow", "is-orange", "is-red"];
const DIRS = [[0, -2], [2, 0], [0, 2], [-2, 0]];
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const ALGORITHMS = ["matrix", "fractal", "donut", "maze", "sort", "conway", "particle", "labyrinth", "lorenz", "wave"];

const FINITE = new Set(["maze", "sort", "labyrinth"]);

function blankGrid(cols, rows) {
  return Array.from({ length: cols * rows }, () => ({ lit: false, tone: "" }));
}

function shade(unit) {
  const index = Math.round(Math.min(1, Math.max(0, unit)) * (TONES.length - 1));
  return TONES[index];
}

function light(cell, tone) {
  cell.lit = true;
  cell.tone = tone;
}

function paintShade(cell, unit) {
  light(cell, shade(unit));
}

function clearCell(cell) {
  cell.lit = false;
  cell.tone = "";
}

function interiorOdd(size) {
  let value = size - 2;
  if (value % 2 === 0) value -= 1;
  return Math.max(1, value);
}

function passageCount(cols, rows) {
  let total = 0;
  for (let y = 1; y < rows - 1; y += 2) {
    for (let x = 1; x < cols - 1; x += 2) total += 1;
  }
  return total;
}

function matrix() {
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

function fractal() {
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

function donut() {
  let cols = 0;
  let rows = 0;
  let cells = [];
  let angleA = 0;
  let angleB = 0;
  const draw = () => {
    const depth = new Float32Array(cols * rows);
    const light = new Float32Array(cols * rows);
    const cosA = Math.cos(angleA);
    const sinA = Math.sin(angleA);
    const cosB = Math.cos(angleB);
    const sinB = Math.sin(angleB);
    const thetaStep = 6.28 / Math.max(48, rows * 1.6);
    const phiStep = 6.28 / Math.max(96, cols * 2);
    for (let theta = 0; theta < 6.28; theta += thetaStep) {
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      for (let phi = 0; phi < 6.28; phi += phiStep) {
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        const ring = cosT + 2;
        const distance = 1 / (sinP * ring * sinA + sinT * cosA + 5);
        const projected = sinP * ring * cosA - sinT * sinA;
        const screenX = cosP * ring * cosB - projected * sinB;
        const screenY = cosP * ring * sinB + projected * cosB;
        const x = Math.floor(cols / 2 + screenX * distance * cols * 1.35);
        const y = Math.floor(rows / 2 - screenY * distance * rows * 1.55);
        const luminance = (sinT * sinA - sinP * cosT * cosA) * cosB - sinP * cosT * sinA - sinT * cosA - cosP * cosT * sinB;
        const index = y * cols + x;
        if (y >= 0 && y < rows && x >= 0 && x < cols && distance > depth[index]) {
          depth[index] = distance;
          light[index] = luminance;
        }
      }
    }
    for (let index = 0; index < cells.length; index += 1) {
      if (depth[index] === 0) clearCell(cells[index]);
      else paintShade(cells[index], (light[index] + 1.2) / 2.4);
    }
  };
  return {
    done: false,
    reset(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      cells = blankGrid(cols, rows);
      angleA = 0;
      angleB = 0;
      draw();
    },
    step() {
      angleA += 0.08;
      angleB += 0.04;
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

function maze() {
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

function sortBars() {
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

function conway() {
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

function particle() {
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

function carveMaze(cols, rows) {
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

function labyrinth() {
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

function lorenz() {
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

function wave() {
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

const BUILDERS = { matrix, fractal, donut, maze, sort: sortBars, conway, particle, labyrinth, lorenz, wave };

export function createAlgorithm(name) {
  const sim = BUILDERS[name]();
  const finite = FINITE.has(name);
  return {
    finite,
    reset(cols, rows) {
      sim.reset(cols, rows);
    },
    step() {
      sim.step();
    },
    cells() {
      return sim.cells();
    },
    progress() {
      return finite ? sim.progress() : null;
    },
    get done() {
      return sim.done;
    },
  };
}
