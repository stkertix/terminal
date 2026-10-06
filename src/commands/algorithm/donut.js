import { blankGrid, light, paintShade, clearCell } from "./grid.js";

export function donut() {
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
