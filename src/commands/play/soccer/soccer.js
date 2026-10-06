import {
  attributes,
  lineShift,
  paceFactor,
  parryChance,
  passMissChance,
  pressCount,
  shotWindow,
  tackleFoulChance,
  tackleWinChance,
  wideChance,
  xgOf,
} from "./ratings.js";

const LENGTH = 105;
const WIDTH = 68;
const GOAL_W = 7.32 / WIDTH;
const BOX_D = 16.5 / LENGTH;
const BOX_W = 40.32 / WIDTH;
const SIX_D = 5.5 / LENGTH;
const SIX_W = 18.32 / WIDTH;
const SPOT = 11 / LENGTH;
const CIRCLE_X = 9.15 / LENGTH;
const CIRCLE_Y = 9.15 / WIDTH;
const TICKS_PER_MATCH = 2250;
const CELEBRATE_TICKS = 84;
const SHOT_SPEED = 0.11;
const PASS_SPEED = 0.048;

const FORMATION = [
  { role: "gk", x: 0.05, y: 0.5 },
  { role: "def", x: 0.18, y: 0.12 },
  { role: "def", x: 0.16, y: 0.36 },
  { role: "def", x: 0.16, y: 0.64 },
  { role: "def", x: 0.18, y: 0.88 },
  { role: "mid", x: 0.38, y: 0.14 },
  { role: "mid", x: 0.34, y: 0.38 },
  { role: "mid", x: 0.34, y: 0.62 },
  { role: "mid", x: 0.38, y: 0.86 },
  { role: "fwd", x: 0.44, y: 0.36 },
  { role: "fwd", x: 0.44, y: 0.64 },
];

const SPEED = { gk: 0.011, def: 0.015, mid: 0.016, fwd: 0.017 };
const ROLE = { gk: "Keeper", def: "Defender", mid: "Midfielder", fwd: "Forward" };
const HOME_NAMES = ["Neuer", "Lahm", "Ramos", "Puyol", "Alba", "Xavi", "Iniesta", "Modric", "Kaka", "Messi", "Suarez"];
const AWAY_NAMES = ["Casillas", "Alves", "Silva", "Pique", "Marcelo", "Kroos", "Busquets", "Gerrard", "Zidane", "Ronaldo", "Henry"];
const HOME_BENCH = ["Pirlo", "Ronaldinho", "Beckham", "Cannavaro", "Cafu"];
const AWAY_BENCH = ["Nedved", "Seedorf", "Maldini", "Carlos", "Figo"];
const STAFF = {
  home: { coach: "Guardiola", manager: "Cruyff" },
  away: { coach: "Ancelotti", manager: "Sacchi" },
};
const SUBS_MAX = 3;
const BENCH_CHAR_ROWS = 6;
const BENCH_DOTS = BENCH_CHAR_ROWS * 4;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emptyStats() {
  return {
    hold: 0,
    passes: 0,
    tackles: 0,
    shots: 0,
    onTarget: 0,
    goals: 0,
    corners: 0,
    fouls: 0,
    yellows: 0,
    reds: 0,
    injuries: 0,
    subs: 0,
    xg: 0,
  };
}

let tape = null;

export function soccerReplay() {
  return tape;
}

export function soccer(options = {}) {
  const quiet = Boolean(options.quiet);
  const homeScale = Number(options.homeScale) > 0 ? Number(options.homeScale) : 1;
  const awayScale = Number(options.awayScale) > 0 ? Number(options.awayScale) : 1;
  const seed = Number.isInteger(options.seed) ? options.seed : null;
  const random = seed == null ? globalThis.Math.random : mulberry32(seed);
  let cols = 24;
  let rows = 10;
  let cells = [];
  let players = [];
  let ball = null;
  let owner = null;
  let homeScore = 0;
  let awayScore = 0;
  let clock = 0;
  let done = false;
  let finale = null;
  let confetti = [];
  let live = false;
  let extra = false;
  let kickSide = "home";
  let phase = null;
  let banner = "";
  let bannerLeft = 0;
  let flash = "";
  let flashLeft = 0;
  let calm = 0;
  let celebrate = null;
  let referee = null;
  let linesmen = null;
  let second = false;
  let halfBreak = null;
  let oneTwo = null;
  let made = { home: 0, away: 0 };
  let bench = { home: [...HOME_BENCH], away: [...AWAY_BENCH] };
  let replaced = { home: [], away: [] };
  let staffWalkers = null;
  let paradeCast = [];
  let warmups = [];
  let injury = null;
  let subShow = null;
  let stats = { home: emptyStats(), away: emptyStats() };
  let tactic = {
    home: options.homeTactic || "High Press",
    away: options.awayTactic || "Low Block",
  };
  let shaken = { home: 0, away: 0 };
  let added = false;
  let stoppage = 0;
  let pens = null;
  let shootWinner = null;
  let coachMark = { home: "", away: "" };
  let voice = { text: "", tone: "neutral", until: 0 };
  const subQueue = [];
  const log = [];

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const facesRight = (side) => (side === "home") !== second;
  const ownsLeft = (side) => facesRight(side);
  const depthOf = (player) => (facesRight(player.side) ? player.x : 1 - player.x);
  const dirOf = (player) => (facesRight(player.side) ? 1 : -1);

  const bounds = () => {
    const marginX = 6;
    const marginTop = 8;
    const marginBottom = 8;
    const fieldRows = Math.max(marginTop + marginBottom + 4, rows - BENCH_DOTS);
    const availW = Math.max(4, cols - marginX * 2);
    const availH = Math.max(4, fieldRows - marginTop - marginBottom);
    const ratio = cols / fieldRows;
    let innerW = availW;
    let innerH = innerW / ratio;
    if (innerH > availH) {
      innerH = availH;
      innerW = innerH * ratio;
    }
    innerW = Math.max(4, Math.min(availW, innerW));
    innerH = Math.max(4, Math.min(availH, innerH));
    const left = Math.round((cols - innerW) / 2);
    const slack = Math.max(0, fieldRows - marginTop - marginBottom - innerH);
    const top = marginTop + Math.round(slack / 2);
    const right = Math.min(cols - 1, left + Math.round(innerW));
    const bottom = Math.min(fieldRows - marginBottom, top + Math.round(innerH));
    return { left, right: Math.max(left + 2, right), top, bottom: Math.max(top + 2, bottom) };
  };

  const pitchToCell = (x, y) => {
    const { left, right, top, bottom } = bounds();
    return {
      col: clamp(Math.round(left + x * (right - left)), 0, cols - 1),
      row: clamp(Math.round(top + y * (bottom - top)), 0, rows - 1),
    };
  };

  const outsideSpot = (x, y) => {
    const { left, right, top, bottom } = bounds();
    let col = left + clamp(x, 0, 1) * (right - left);
    let row = top + clamp(y, 0, 1) * (bottom - top);
    if (x <= 0.05) col = Math.floor(left / 2) * 2 - 2;
    else if (x >= 0.95) col = Math.floor(right / 2) * 2 + 2;
    if (y <= 0.05) row = Math.floor(top / 4) * 4 - 4;
    else if (y >= 0.95) row = Math.floor(bottom / 4) * 4 + 4;
    col = clamp(Math.round(col), 0, cols - 1);
    row = clamp(Math.round(row), 0, rows - 1);
    return {
      x: (col - left) / Math.max(1, right - left),
      y: (row - top) / Math.max(1, bottom - top),
    };
  };

  const inGoalY = (y) => y >= (1 - GOAL_W) / 2 && y <= (1 + GOAL_W) / 2;

  const paint = (col, row, tone) => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return;
    const cell = cells[row * cols + col];
    if (!cell || cell.glyph) return;
    cell.lit = true;
    cell.tone = tone;
  };

  const hLine = (x0, x1, y) => {
    const from = pitchToCell(Math.min(x0, x1), y);
    const to = pitchToCell(Math.max(x0, x1), y);
    for (let col = from.col; col <= to.col; col += 1) paint(col, from.row, "is-line");
  };

  const vLine = (x, y0, y1) => {
    const from = pitchToCell(x, Math.min(y0, y1));
    const to = pitchToCell(x, Math.max(y0, y1));
    for (let row = from.row; row <= to.row; row += 1) paint(from.col, row, "is-line");
  };

  const drawBox = (xNear, xFar, y0, y1) => {
    hLine(xNear, xFar, y0);
    hLine(xNear, xFar, y1);
    vLine(xFar, y0, y1);
  };

  const drawArc = (spotX, side) => {
    const { left, right, top, bottom } = bounds();
    const sx = left + spotX * (right - left);
    const sy = top + 0.5 * (bottom - top);
    const rx = Math.max(1, CIRCLE_X * (right - left));
    const ry = Math.max(1, CIRCLE_Y * (bottom - top));
    const band = 0.85 / Math.min(rx, ry);
    const boxCol = left + (side === "home" ? BOX_D : 1 - BOX_D) * (right - left);
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        const outside = side === "home" ? col > boxCol : col < boxCol;
        if (!outside) continue;
        const dist = Math.hypot((col - sx) / rx, (row - sy) / ry);
        if (Math.abs(dist - 1) > band) continue;
        paint(col, row, "is-line");
      }
    }
  };

  const drawPitch = () => {
    const { left, right, top, bottom } = bounds();
    hLine(0, 1, 0);
    hLine(0, 1, 1);
    const goalTop = pitchToCell(0, (1 - GOAL_W) / 2).row;
    const goalBot = pitchToCell(0, (1 + GOAL_W) / 2).row;
    const mouthTop = Math.max(top, goalBot - goalTop < 2 ? Math.floor((top + bottom) / 2) - 1 : goalTop);
    const mouthBot = Math.min(bottom, goalBot - goalTop < 2 ? mouthTop + 2 : goalBot);
    for (let row = top; row <= bottom; row += 1) {
      const mouth = row >= mouthTop && row <= mouthBot;
      if (mouth) {
        paint(left - 1, row, "is-line");
        paint(right + 1, row, "is-line");
      } else {
        paint(left, row, "is-line");
        paint(right, row, "is-line");
      }
    }
    vLine(0.5, 0, 1);
    const y0 = (1 - BOX_W) / 2;
    const y1 = (1 + BOX_W) / 2;
    drawBox(0, BOX_D, y0, y1);
    drawBox(1, 1 - BOX_D, y0, y1);
    const s0 = (1 - SIX_W) / 2;
    const s1 = (1 + SIX_W) / 2;
    drawBox(0, SIX_D, s0, s1);
    drawBox(1, 1 - SIX_D, s0, s1);
    const rx = Math.max(1, CIRCLE_X * (right - left));
    const ry = Math.max(1, CIRCLE_Y * (bottom - top));
    const band = 0.85 / Math.min(rx, ry);
    const cx = left + 0.5 * (right - left);
    const cy = top + 0.5 * (bottom - top);
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        const dist = Math.hypot((col - cx) / rx, (row - cy) / ry);
        if (Math.abs(dist - 1) <= band) paint(col, row, "is-line");
      }
    }
    drawArc(SPOT, "home");
    drawArc(1 - SPOT, "away");
    [pitchToCell(0.5, 0.5), pitchToCell(SPOT, 0.5), pitchToCell(1 - SPOT, 0.5)].forEach((spot) => {
      paint(spot.col, spot.row, "is-line");
    });
  };

  const capture = () => {
    players.forEach((player) => {
      player.px = player.x;
      player.py = player.y;
    });
    if (ball) {
      ball.px = ball.x;
      ball.py = ball.y;
    }
    if (referee) {
      referee.px = referee.x;
      referee.py = referee.y;
    }
    linesmen?.forEach((ar) => {
      ar.px = ar.x;
      ar.py = ar.y;
    });
  };

  const spotOf = (entity, alpha) => {
    const px = entity.px ?? entity.x;
    const py = entity.py ?? entity.y;
    const dx = entity.x - px;
    const dy = entity.y - py;
    if (!(alpha < 1) || dx * dx + dy * dy > 0.04) return { x: entity.x, y: entity.y };
    return { x: px + dx * alpha, y: py + dy * alpha };
  };

  const render = (alpha = 1) => {
    if (quiet) return;
    cells = Array.from({ length: cols * rows }, () => ({ lit: false, tone: "", glyph: "" }));
    drawPitch();
    const charCols = Math.max(1, Math.floor(cols / 2));
    const charRows = Math.max(1, Math.floor(rows / 4));
    const charAt = (x, y) => {
      const dot = pitchToCell(x, y);
      return {
        col: clamp(Math.floor(dot.col / 2), 0, charCols - 1),
        row: clamp(Math.floor(dot.row / 4), 0, charRows - 1),
      };
    };
    const stamp = (col, row, glyph, tone) => {
      if (col < 0 || row < 0 || col >= charCols || row >= charRows) return;
      cells[row * 4 * cols + col * 2] = { lit: true, tone, glyph };
    };
    const ballSpot = spotOf(ball, alpha);
    let ballChar = charAt(ballSpot.x, ballSpot.y);
    const taken = new Set();
    const cellsFor = (nameCol, nameRow, name, card) => {
      const spots = [];
      const mid = nameCol + Math.floor((name.length - 1) / 2);
      if (card) spots.push([mid, nameRow - 1]);
      for (let index = 0; index < name.length; index += 1) spots.push([nameCol + index, nameRow]);
      spots.push([mid, nameRow + 1]);
      return spots;
    };
    const freeAt = (nameCol, nameRow, name, gap, card, avoidBall) => {
      const spots = cellsFor(nameCol, nameRow, name, card);
      return spots.every(([letterCol, letterRow]) => {
        if (letterRow < 0 || letterRow >= charRows || letterCol < 0 || letterCol >= charCols) return false;
        if (avoidBall && Math.abs(letterCol - ballChar.col) <= gap && Math.abs(letterRow - ballChar.row) <= gap) return false;
        return !taken.has(`${letterCol},${letterRow}`)
          && !taken.has(`${letterCol - 1},${letterRow}`)
          && !taken.has(`${letterCol + 1},${letterRow}`);
      });
    };
    const drawFigure = (entity, name, tone, gap, card, avoidBall) => {
      const origin = charAt(spotOf(entity, alpha).x, spotOf(entity, alpha).y);
      const frame = bounds();
      const pitchTop = Math.floor(frame.top / 4);
      const pitchBottom = Math.floor(frame.bottom / 4);
      const pitchLeft = Math.floor(frame.left / 2);
      const pitchRight = Math.floor(frame.right / 2);
      const markerInside = origin.col >= pitchLeft && origin.col <= pitchRight && origin.row >= pitchTop && origin.row <= pitchBottom;
      const rowInside = (row) => !markerInside || (row >= pitchTop && row <= pitchBottom);
      let nameCol = origin.col - Math.floor((name.length - 1) / 2);
      let nameRow = origin.row - 1;
      if (nameCol < 0) nameCol = 0;
      if (nameCol + name.length > charCols) nameCol = Math.max(0, charCols - name.length);
      if (markerInside) {
        if (nameCol < pitchLeft) nameCol = pitchLeft;
        if (nameCol + name.length - 1 > pitchRight) nameCol = Math.max(pitchLeft, pitchRight - name.length + 1);
      }
      if (nameRow < 0) nameRow = card ? 1 : 0;
      if (markerInside && nameRow < pitchTop) nameRow = pitchTop;
      if (!rowInside(nameRow) || !freeAt(nameCol, nameRow, name, gap, card, avoidBall)) {
        let placed = false;
        for (let step = 1; step < charRows && !placed; step += 1) {
          if (rowInside(origin.row - 1 - step) && freeAt(nameCol, origin.row - 1 - step, name, gap, card, avoidBall)) {
            nameRow = origin.row - 1 - step;
            placed = true;
          } else if (rowInside(origin.row - 1 + step) && freeAt(nameCol, origin.row - 1 + step, name, gap, card, avoidBall)) {
            nameRow = origin.row - 1 + step;
            placed = true;
          }
        }
      }
      let mark = null;
      cellsFor(nameCol, nameRow, name, card).forEach(([letterCol, letterRow], index) => {
        const letterIndex = card ? index - 1 : index;
        const marker = letterIndex >= name.length;
        const glyph = letterIndex < 0 ? "■" : marker ? "●" : name[letterIndex];
        const spotCol = marker ? origin.col : letterCol;
        const spotRow = marker ? origin.row : letterRow;
        if (marker) mark = { col: spotCol, row: spotRow };
        stamp(spotCol, spotRow, glyph, letterIndex < 0 ? "is-yellow" : tone);
        taken.add(`${spotCol},${spotRow}`);
      });
      return mark;
    };
    const drawPlayer = (player) => {
      if (player.conceal) return null;
      const solid = player === owner;
      const tone = player.side === "home"
        ? (solid ? "is-blue" : "is-blue-dim")
        : (solid ? "is-red" : "is-red-dim");
      return drawFigure(player, player.name, tone, 0, player.yellows > 0, player !== owner);
    };
    const hurt = injury?.player && !injury.player.out ? injury.player : null;
    players.filter((player) => !player.out && player !== owner && player !== hurt).forEach(drawPlayer);
    const carrier = owner && !owner.out ? drawPlayer(owner) : null;
    if (carrier) {
      const side = dirOf(owner) >= 0 ? 1 : -1;
      const candidates = [side, -side].map((step) => ({ col: carrier.col + step, row: carrier.row }));
      const spot = candidates.find((item) => (
        item.col >= 0 && item.row >= 0 && item.col < charCols && item.row < charRows
        && !taken.has(`${item.col},${item.row}`)
      )) || candidates.find((item) => item.col >= 0 && item.col < charCols);
      if (spot) ballChar = spot;
    }
    warmups.forEach((person) => {
      const tone = person.side === "home" ? "is-blue" : "is-red";
      const hop = celebrate?.side === person.side && Math.sin(celebrate.wait * 0.85) > 0 ? -0.035 : 0;
      drawFigure({
        ...person,
        y: person.y + hop,
        py: (person.py ?? person.y) + hop,
      }, person.name, tone, 0, false, true);
    });
    paradeCast.forEach((person) => {
      const tone = person.gray ? "is-gray" : (person.side === "home" ? "is-blue" : "is-red");
      drawFigure(person, person.name, tone, 0, false, true);
    });
    if (injury?.medics) {
      injury.medics.forEach((medic) => drawFigure(medic, "Med", "is-white", 1, false, true));
    }
    if (subShow?.phase === "off") {
      const tone = subShow.side === "home" ? "is-blue" : "is-red";
      drawFigure({
        x: subShow.waitX,
        y: subShow.waitY,
        px: subShow.waitX,
        py: subShow.waitY,
      }, subShow.name, tone, 0, false, true);
    }
    if (subShow?.retiree) {
      const retiree = subShow.retiree;
      const tone = "is-gray";
      drawFigure(retiree, retiree.name, tone, 0, false, true);
    }
    if (referee) drawFigure(referee, "Ref", "is-yellow", 1, false, true);
    if (hurt) drawPlayer(hurt);
    linesmen?.forEach((ar) => {
      const mark = drawFigure(ar, "AR", "is-yellow", 1, false, true);
      if (ar.flag > 0 && mark) stamp(mark.col, mark.row - 2, "▲", "is-yellow");
    });
    stamp(ballChar.col, ballChar.row, "●", "is-white");
    confetti.forEach((bit) => {
      const spot = charAt(bit.x, bit.y);
      if (spot.row >= charRows - BENCH_CHAR_ROWS) return;
      const index = spot.row * 4 * cols + spot.col * 2;
      if (cells[index]?.glyph) return;
      stamp(spot.col, spot.row, bit.glyph, bit.tone);
    });
    const packLine = (people, width) => {
      const lines = [];
      let line = [];
      let used = 0;
      people.forEach((person) => {
        const gap = line.length ? 1 : 0;
        if (line.length && used + gap + person.name.length > width) {
          lines.push(line);
          line = [person];
          used = person.name.length;
          return;
        }
        line.push(person);
        used += gap + person.name.length;
      });
      if (line.length) lines.push(line);
      return lines;
    };
    const benchDance = (side, index) => {
      if (!celebrate || celebrate.side !== side) return { hop: 0, sway: 0 };
      const hop = Math.sin(celebrate.wait * 0.85 + index) > 0 ? -1 : 0;
      const sway = Math.round(Math.sin(celebrate.wait * 0.5 + index) * 2);
      return { hop, sway };
    };
    const drawBenchSide = (side, left, right) => {
      const width = right - left + 1;
      if (width < 4) return;
      const dim = side === "home" ? "is-blue-dim" : "is-red-dim";
      const people = [
        ...bench[side].map((name) => ({ name, tone: dim })),
        ...replaced[side].map((name) => ({ name, tone: "is-gray" })),
      ];
      const lines = packLine(people, width).slice(0, Math.floor(BENCH_CHAR_ROWS / 2) - 1);
      const benchTop = Math.max(0, charRows - BENCH_CHAR_ROWS);
      const seatTop = benchTop + 2;
      lines.forEach((line, index) => {
        const { hop, sway } = benchDance(side, index);
        const nameRow = clamp(seatTop + index * 2 + hop, benchTop, charRows - 2);
        const markRow = clamp(nameRow + 1, benchTop, charRows - 1);
        if (markRow >= charRows) return;
        const span = line.reduce((sum, person) => sum + person.name.length, 0) + Math.max(0, line.length - 1);
        let cursor = clamp(left + Math.max(0, Math.floor((width - span) / 2)) + sway, left, Math.max(left, right - span));
        line.forEach((person) => {
          const markerCol = cursor + Math.floor((person.name.length - 1) / 2);
          for (let letter = 0; letter < person.name.length; letter += 1) {
            stamp(cursor + letter, nameRow, person.name[letter], person.tone);
          }
          stamp(markerCol, markRow, "●", person.tone);
          cursor += person.name.length + 1;
        });
      });
    };
    drawBenchSide("home", 0, Math.max(4, Math.floor(charCols * 0.42) - 1));
    drawBenchSide("away", Math.min(charCols - 5, Math.ceil(charCols * 0.58)), charCols - 1);
    ensureStaff();
    const staffRow = Math.max(0, charRows - BENCH_CHAR_ROWS);
    staffWalkers?.forEach((person) => {
      if (person.parade) return;
      const spot = charAt(person.x, person.y);
      const tone = person.side === "home" ? "is-blue" : "is-red";
      const name = person.name;
      const [minCol, maxCol] = nameLane(person);
      const { hop, sway } = benchDance(person.side, person.role === "coach" ? 0 : 1);
      const nameCol = clamp(spot.col - Math.floor((name.length - 1) / 2) + sway, minCol, maxCol);
      const markerCol = nameCol + Math.floor((name.length - 1) / 2);
      const nameRow = clamp(staffRow + hop, 0, charRows - 2);
      for (let letter = 0; letter < name.length; letter += 1) {
        stamp(nameCol + letter, nameRow, name[letter], tone);
        taken.add(`${nameCol + letter},${nameRow}`);
      }
      stamp(markerCol, nameRow + 1, "●", tone);
    });
  };

  const clockText = () => {
    const shown = Math.max(0, clock);
    const total = Math.floor(shown * 60);
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const periodText = () => {
    if (finale) return "Full Time";
    if (pens) return `Penalties ${pens.home}-${pens.away}`;
    if (added) return "Added Time";
    if (extra) {
      const elapsed = Math.max(0, clock - 90);
      const total = Math.floor(elapsed * 60);
      const mm = String(Math.floor(total / 60)).padStart(2, "0");
      const ss = String(total % 60).padStart(2, "0");
      return `Extra Time ${mm}:${ss}`;
    }
    return second ? "Second Half" : "First Half";
  };

  const summaryRows = () => {
    const total = stats.home.hold + stats.away.hold;
    const pct = (side) => (total ? Math.round((100 * stats[side].hold) / total) : 50);
    const pair = (key) => `${stats.home[key]} - ${stats.away[key]}`;
    const rows = [
      ["Possession", `${pct("home")}% - ${pct("away")}%`],
      ["Shots", pair("shots")],
      ["On Target", pair("onTarget")],
      ["xG", `${stats.home.xg.toFixed(2)} - ${stats.away.xg.toFixed(2)}`],
      ["Fouls", pair("fouls")],
      ["Cards", `Y ${stats.home.yellows} R ${stats.home.reds} - Y ${stats.away.yellows} R ${stats.away.reds}`],
      ["Tactics", `${tactic.home} - ${tactic.away}`],
    ];
    if (pens) rows.push(["Penalties", `${pens.home} - ${pens.away}`]);
    if (seed != null) rows.push(["Seed", String(seed)]);
    return rows;
  };

  const saveTape = () => {
    tape = {
      score: `HOME ${homeScore} - ${awayScore} AWAY`,
      rows: summaryRows(),
      events: log.map((item) => (
        item.divider
          ? `—— ${item.divider} ——`
          : `${item.time} - ${item.parts.map((part) => part.text).join("")}`
      )),
    };
  };

  const recordParts = (parts) => {
    log.push({ time: clockText(), parts });
  };

  const record = (text, tone = "neutral") => {
    recordParts([{ text, tone }]);
  };

  const markPeriod = (label) => {
    if (log.some((item) => item.divider === label)) return;
    log.push({ divider: label });
  };

  const restartDelay = () => Math.round((2000 + random() * 1000) / 80);

  const armBanner = (label, ticks, flashTicks = ticks) => {
    banner = label;
    bannerLeft = ticks;
    const key = label.toUpperCase();
    if (key === "GOAL") flash = "GOAL";
    else if (key === "CORNER") flash = "CORNER";
    else if (key.includes("PENALTY")) flash = "PENALTY";
    else if (key.includes("FREE KICK")) flash = "FOUL";
    else flash = "";
    flashLeft = flash ? flashTicks : 0;
  };

  const show = (label) => {
    armBanner(label, 18);
    record(label);
  };

  const sheetFor = (name, role, side) => attributes(name, role, side === "home" ? homeScale : awayScale);

  const kickoff = () => {
    const opening = !players.length;
    if (opening) {
      players = [
        ...FORMATION.map((slot, index) => ({
          side: "home",
          role: slot.role,
          name: HOME_NAMES[index],
          x: slot.x,
          y: slot.y,
          baseX: slot.x,
          baseY: slot.y,
          slotX: slot.x,
          slotY: slot.y,
          passCool: 0,
          yellows: 0,
          stamina: 100,
          out: false,
          attr: sheetFor(HOME_NAMES[index], slot.role, "home"),
        })),
        ...FORMATION.map((slot, index) => ({
          side: "away",
          role: slot.role,
          name: AWAY_NAMES[index],
          x: 1 - slot.x,
          y: slot.y,
          baseX: slot.x,
          baseY: slot.y,
          slotX: 1 - slot.x,
          slotY: slot.y,
          passCool: 0,
          yellows: 0,
          stamina: 100,
          out: false,
          attr: sheetFor(AWAY_NAMES[index], slot.role, "away"),
        })),
      ];
    } else {
      substitute("home");
      substitute("away");
      players.forEach((player) => {
        if (player.out) return;
        player.passCool = 0;
        player.mark = { x: player.slotX, y: player.slotY };
      });
    }
    ball = { x: 0.5, y: 0.5, vx: 0, vy: 0, ignore: null, cool: 0, touch: kickSide };
    if (!referee) referee = { x: 0.5, y: 0.72, px: 0.5, py: 0.72 };
    if (!linesmen) {
      const top = outsideSpot(0.25, 0);
      const bottom = outsideSpot(0.75, 1);
      linesmen = [
        { half: "left", x: top.x, y: top.y, px: top.x, py: top.y, flag: 0 },
        { half: "right", x: bottom.x, y: bottom.y, px: bottom.x, py: bottom.y, flag: 0 },
      ];
    }
    owner = null;
    const wait = opening ? restartDelay() : 0;
    phase = { kind: "kickoff", side: kickSide, wait, place: !opening, label: "Kick Off", ticks: 0 };
    armBanner("Kick Off", opening ? wait : 120, 0);
    capture();
    if (log.length === 0) {
      markPeriod("First Half");
      const taker = nearest(ball, (player) => player.side === kickSide && player.role !== "gk");
      const parts = [{ text: "Kick Off", tone: "kick" }];
      if (taker) parts.push({ text: ` · ${taker.name}`, tone: taker.side });
      recordParts(parts);
      say(taker ? `${taker.name} to kick off for ${sideName(kickSide)}.` : "Kick off from the center.", "kick", opening ? wait : 40);
    } else {
      const taker = nearest(ball, (player) => player.side === kickSide && player.role !== "gk");
      say(taker ? `${taker.name} to kick off for ${sideName(kickSide)}.` : "Kick off from the center.", "kick", 40);
    }
  };

  const score = (side) => {
    if (ball?.shootout) {
      pens[side] += 1;
      pens[`${side}Taken`] += 1;
      const finisher = ball.ignore;
      const name = finisher?.name || sideName(side);
      recordParts([
        { text: side === "home" ? "Home" : "Away", tone: side },
        { text: " Goal", tone: "goal" },
        { text: ` · ${name}`, tone: side },
      ]);
      say(`Goal! ${name} scores. Penalties ${pens.home}-${pens.away}.`, "goal", 28);
      owner = null;
      ball.vx = 0;
      ball.vy = 0;
      ball.shootout = false;
      finishKick(true);
      return;
    }
    stats[side].goals += 1;
    shaken[side === "home" ? "away" : "home"] = 75;
    if (side === "home") homeScore += 1;
    else awayScore += 1;
    kickSide = side === "home" ? "away" : "home";
    const finisher = ball.ignore;
    const own = Boolean(finisher && !finisher.out && finisher.side !== side);
    let scorer = finisher;
    if (!scorer || scorer.out || scorer.side !== side || scorer.role === "gk") {
      scorer = nearest(ball, (player) => player.side === side && player.role !== "gk");
    }
    const scorerName = (own ? finisher : scorer)?.name;
    const scorerSide = (own ? finisher : scorer)?.side || side;
    const parts = own
      ? [{ text: "Own Goal", tone: "red" }]
      : [{ text: side === "home" ? "Home" : "Away", tone: side }, { text: " Goal", tone: "goal" }];
    if (scorerName) parts.push({ text: ` · ${scorerName}`, tone: scorerSide });
    recordParts(parts);
    say(
      own
        ? `Own goal by ${scorerName}. Home ${homeScore}, Away ${awayScore}.`
        : `Goal! ${scorerName || sideName(side)} scores for ${sideName(side)}. Home ${homeScore}, Away ${awayScore}.`,
      "goal",
      CELEBRATE_TICKS,
    );
    owner = null;
    oneTwo = null;
    phase = null;
    ball.vx = 0;
    ball.vy = 0;
    celebrate = {
      side,
      scorer,
      wait: CELEBRATE_TICKS,
      x: facesRight(side) ? 0.92 : 0.08,
      y: ball.y < 0.5 ? 0.14 : 0.86,
    };
    armBanner("GOAL", CELEBRATE_TICKS);
  };

  const lapPoint = (t) => {
    const edge = (((t % 1) + 1) % 1) * 4;
    if (edge < 1) return { x: 0.1 + edge * 0.8, y: 0.88 };
    if (edge < 2) return { x: 0.9, y: 0.88 - (edge - 1) * 0.76 };
    if (edge < 3) return { x: 0.9 - (edge - 2) * 0.8, y: 0.12 };
    return { x: 0.1, y: 0.12 + (edge - 3) * 0.76 };
  };

  const beginFinale = () => {
    if (finale) return;
    owner = null;
    oneTwo = null;
    phase = null;
    celebrate = null;
    halfBreak = null;
    if (subShow?.retiree && !replaced[subShow.retiree.side].includes(subShow.retiree.name)) {
      replaced[subShow.retiree.side].push(subShow.retiree.name);
    }
    subShow = null;
    subQueue.splice(0).forEach((job) => {
      if (!bench[job.side].includes(job.name)) bench[job.side].unshift(job.name);
      made[job.side] = Math.max(0, made[job.side] - 1);
    });
    warmups.splice(0).forEach((person) => {
      if (!bench[person.side].includes(person.name)) bench[person.side].unshift(person.name);
      made[person.side] = Math.max(0, made[person.side] - 1);
    });
    injury = null;
    players.forEach((player) => {
      if (player.down && !player.out) player.down = false;
    });
    ball.vx = 0;
    ball.vy = 0;
    const side = homeScore === awayScore
      ? shootWinner
      : (homeScore > awayScore ? "home" : "away");
    finale = { side, tick: 0 };
    confetti = [];
    buildParade(side);
    const line = `Home ${homeScore}, Away ${awayScore}`;
    const penLine = pens ? ` Penalties ${pens.home}-${pens.away}.` : "";
    say(
      side
        ? `${sideName(side)} win it. ${line}.${penLine} Press any key.`
        : `Full time, a draw. ${line}. Press any key.`,
      side || "neutral",
      100000,
    );
    banner = "Press any key";
    bannerLeft = 100000;
    saveTape();
  };

  const parade = () => {
    finale.tick += 1;
    moveStaff();
    const winners = players.filter((player) => !player.out && player.side === finale.side);
    const cast = [...winners, ...paradeCast];
    cast.forEach((person, index) => {
      const spot = lapPoint(finale.tick * 0.0035 + index / Math.max(1, cast.length));
      moveToward(person, spot.x, spot.y, person.sub ? 0.024 : 0.028);
    });
    confetti.forEach((bit) => {
      bit.x = clamp(bit.x + bit.vx, 0.02, 0.98);
      bit.y += bit.vy;
    });
    confetti = confetti.filter((bit) => bit.y < 1.05);
    if (!finale.side || confetti.length >= 72) return;
    const tones = ["is-yellow", "is-white", finale.side === "home" ? "is-blue" : "is-red"];
    const glyphs = ["*", "+", "·", "x"];
    for (let n = 0; n < 2; n += 1) {
      confetti.push({
        x: 0.06 + random() * 0.88,
        y: -0.04 - random() * 0.08,
        vy: 0.01 + random() * 0.016,
        vx: (random() - 0.5) * 0.01,
        glyph: glyphs[Math.floor(random() * glyphs.length)],
        tone: tones[Math.floor(random() * tones.length)],
      });
    }
  };

  const nominalEnd = () => {
    if (!second) return 45;
    if (!extra) return 90;
    return 120;
  };

  const openAddedTime = () => {
    const minutes = 1 + Math.floor(random() * 2);
    added = true;
    stoppage = minutes;
    record(minutes === 1 ? "Added Time 1" : "Added Time 2");
    say(minutes === 1 ? "One minute added." : "Two minutes added.", "neutral", 36);
    if (!banner) armBanner("Added Time", 18);
  };

  const atWhistle = () => {
    const end = nominalEnd();
    if (clock < end) return false;
    if (!added) {
      openAddedTime();
      return false;
    }
    return clock >= end + stoppage;
  };

  const closePeriod = () => {
    added = false;
    stoppage = 0;
  };

  const whistlePeriod = () => {
    if (pens || finale) return false;
    if (!atWhistle()) return false;
    if (!second) {
      closePeriod();
      beginHalf();
      return true;
    }
    if (!extra) {
      if (homeScore !== awayScore) {
        record("Full Time");
        beginFinale();
        return true;
      }
      closePeriod();
      clock = 90;
      extra = true;
      markPeriod("Extra Time");
      say("Still level. Extra time it is.", "neutral", 36);
      armBanner("Extra Time", 18);
      return true;
    }
    if (homeScore !== awayScore) {
      record("Full Time");
      beginFinale();
      return true;
    }
    beginShootout();
    return true;
  };

  const endIfDue = () => whistlePeriod();

  const beginHalf = () => {
    clock = 45;
    closePeriod();
    halfBreak = { wait: 18 };
    show("Half Time");
    say("Half time. The teams change ends.", "neutral", 24);
  };

  const finishHalf = () => {
    halfBreak = null;
    second = true;
    markPeriod("Second Half");
    kickSide = "away";
    substitute("home");
    substitute("away");
    players.forEach((player) => {
      player.slotX = facesRight(player.side) ? player.baseX : 1 - player.baseX;
      player.slotY = player.baseY;
    });
    kickoff();
  };

  const celebrateMove = () => {
    const party = players.filter((player) => !player.out && !player.down && player.side === celebrate.side && player.role !== "gk");
    party.forEach((player, index) => {
      const angle = (index / Math.max(1, party.length)) * Math.PI;
      const lead = player === celebrate.scorer;
      moveToward(player, celebrate.x + Math.cos(angle) * (lead ? 0.02 : 0.07), celebrate.y + Math.sin(angle) * 0.1, lead ? 0.032 : 0.026);
      player.y = clamp(player.y + Math.sin(celebrate.wait * 1.6 + index) * 0.028, 0.04, 0.96);
    });
    players.forEach((player) => {
      if (player.out || player.down || (player.side === celebrate.side && player.role !== "gk")) return;
      moveToward(player, player.slotX, player.slotY, 0.012);
    });
  };

  const nearest = (from, accept) => {
    let best = null;
    let bestDist = Infinity;
    players.forEach((player) => {
      if (player.out || player.down || !accept(player)) return;
      const dist = Math.hypot(player.x - from.x, player.y - from.y);
      if (dist >= bestDist) return;
      best = player;
      bestDist = dist;
    });
    return best;
  };

  const reach = () => ({
    x: 2.9 / Math.max(8, cols - 2),
    y: 5.8 / Math.max(6, rows - 2),
  });

  const near = (a, b) => {
    const zone = reach();
    return Math.hypot((a.x - b.x) / zone.x, (a.y - b.y) / zone.y) <= 1;
  };

  const sideName = (side) => (side === "home" ? "Home" : "Away");

  const say = (text, tone = "neutral", ticks = 36) => {
    voice = { text, tone, until: ticks };
  };

  const fillVoice = () => {
    if (injury && injury.phase !== "wait" && injury.phase !== "return") {
      say(injury.line, "foul", 28);
      return;
    }
    if (subShow) {
      if (subShow.phase === "off") {
        say(`${subShow.name} waits at the touchline for ${subShow.player.name}.`, subShow.side, 24);
      } else if (subShow.retiree) {
        say(`${subShow.retiree.name} and ${subShow.name} cross. ${subShow.retiree.name} takes a seat.`, subShow.side, 24);
      } else {
        say(`${subShow.name} is coming on.`, subShow.side, 24);
      }
      return;
    }
    if (halfBreak) {
      say("Half time. The teams change ends.", "neutral", 12);
      return;
    }
    if (phase?.kind === "kickoff") {
      const taker = nearest(ball, (player) => player.side === phase.side && player.role !== "gk");
      say(taker ? `${taker.name} to kick off for ${sideName(phase.side)}.` : "Kick off from the center.", "kick", 24);
      return;
    }
    if (phase?.kind === "corner") {
      say("They pack the box and wait on the corner.", "corner", 24);
      return;
    }
    if (phase?.kind === "penalty") {
      say("Everyone holds for the penalty.", "penalty", 24);
      return;
    }
    if (phase?.kind === "free") {
      say("The wall is set. The free kick is coming.", "foul", 24);
      return;
    }
    if (phase?.kind === "throw") {
      say("The throw-in is about to come in.", "kick", 24);
      return;
    }
    if (phase?.kind === "goal") {
      say("The goalkeeper sets the goal kick.", "kick", 24);
      return;
    }
    if (owner && !owner.out) {
      const depth = depthOf(owner);
      const where = depth >= 0.82
        ? "on the edge of the box"
        : depth >= 0.6
          ? "in the attacking third"
          : depth >= 0.4
            ? "in midfield"
            : "in his own half";
      say(`${owner.name} has the ball ${where}.`, owner.side, 28);
      return;
    }
    const pace = ball ? Math.hypot(ball.vx, ball.vy) : 0;
    if (pace > SHOT_SPEED * 0.8) say("The shot is on its way.", "goal", 14);
    else if (pace > 0.012) say("It's a loose ball in the middle.", "neutral", 18);
    else say("The play slows for a moment.", "neutral", 22);
  };

  const narrate = () => {
    if (voice.until > 0) {
      voice.until -= 1;
      return;
    }
    if (done || !ball) return;
    fillVoice();
  };

  const keeperReaches = (keeper) => {
    const inSix = ownsLeft(keeper.side) ? ball.x < SIX_D + 0.03 : ball.x > 1 - (SIX_D + 0.03);
    if (!inSix) return false;
    return Math.abs(keeper.y - ball.y) < 0.022 && Math.abs(keeper.x - ball.x) < 0.08;
  };

  const moveToward = (entity, tx, ty, speed) => {
    const dx = tx - entity.x;
    const dy = ty - entity.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= speed || dist === 0) {
      entity.x = tx;
      entity.y = ty;
      return;
    }
    entity.x += (dx / dist) * speed;
    entity.y += (dy / dist) * speed;
  };

  const effort = (player, speed) => speed * (0.6 + 0.4 * ((player.stamina ?? 100) / 100)) * paceFactor(player.attr?.pace ?? 70);

  const spend = (player, cost) => {
    player.stamina = clamp((player.stamina ?? 100) + cost, 0, 100);
  };

  const moveReferee = () => {
    if (!referee || !ball) return;
    const dx = ball.x - referee.x;
    const dy = ball.y - referee.y;
    const dist = Math.hypot(dx, dy) || 1;
    const keep = 0.16;
    if (dist <= keep) return;
    moveToward(
      referee,
      clamp(ball.x - (dx / dist) * keep, 0.08, 0.92),
      clamp(ball.y - (dy / dist) * keep, 0.1, 0.9),
      0.012,
    );
  };

  const secondLastX = (defending) => {
    const men = players.filter((player) => !player.out && player.side === defending);
    if (!men.length) return ownsLeft(defending) ? 0 : 1;
    const ranked = [...men].sort((a, b) => (ownsLeft(defending) ? a.x - b.x : b.x - a.x));
    return ranked[Math.min(1, ranked.length - 1)].x;
  };

  const offsideAt = (player, ballX) => {
    if (!player || player.out || player.role === "gk") return false;
    const attackingRight = facesRight(player.side);
    if (attackingRight ? player.x <= 0.5 : player.x >= 0.5) return false;
    const line = secondLastX(player.side === "home" ? "away" : "home");
    if (attackingRight) return player.x > line + 0.008 && player.x > ballX + 0.008;
    return player.x < line - 0.008 && player.x < ballX - 0.008;
  };

  const moveLinesmen = () => {
    if (!linesmen || !ball) return;
    linesmen.forEach((ar) => {
      if (ar.flag > 0) ar.flag -= 1;
      const defending = ar.half === "left"
        ? (ownsLeft("home") ? "home" : "away")
        : (ownsLeft("home") ? "away" : "home");
      let line = secondLastX(defending);
      if (ar.half === "left") line = clamp(Math.min(line, ball.x), 0.02, 0.5);
      else line = clamp(Math.max(line, ball.x), 0.5, 0.98);
      const y = outsideSpot(line, ar.half === "left" ? 0 : 1).y;
      moveToward(ar, line, y, 0.02);
    });
  };

  const staffBandY = () => {
    const { top, bottom } = bounds();
    const charRows = Math.max(1, Math.floor(rows / 4));
    const markRow = Math.max(0, charRows - BENCH_CHAR_ROWS) + 1;
    return (markRow * 4 - top) / Math.max(1, bottom - top);
  };

  const ensureStaff = () => {
    if (staffWalkers) return;
    const y = staffBandY();
    staffWalkers = ["home", "away"].flatMap((side) => (
      ["coach", "manager"].map((role, index) => {
        const person = { side, role, name: STAFF[side][role] };
        const [minStart, maxStart] = nameLane(person);
        const x = xForName(person, Math.round((minStart + maxStart) / 2));
        return {
          ...person,
          x,
          y,
          px: x,
          py: y,
          tx: x,
          ty: y,
          wait: 8 + index * 14,
        };
      })
    ));
  };

  const charForX = (x) => {
    const { left, right } = bounds();
    const dot = Math.round(left + clamp(x, 0, 1) * (right - left));
    const charCols = Math.max(1, Math.floor(cols / 2));
    return clamp(Math.floor(dot / 2), 0, charCols - 1);
  };

  const nameLane = (person) => {
    const coachSpan = STAFF[person.side].coach.length;
    const managerSpan = STAFF[person.side].manager.length;
    const gap = 2;
    if (person.side === "home") {
      const homeLeft = charForX(0.02);
      const homeRight = Math.max(homeLeft + coachSpan + managerSpan + gap, charForX(0.42));
      const slack = Math.max(0, homeRight - homeLeft - coachSpan - managerSpan - gap);
      const coachMax = homeLeft + Math.floor(slack / 2);
      const managerMin = coachMax + coachSpan + gap;
      const managerMax = Math.max(managerMin, homeRight - managerSpan);
      if (person.role === "coach") return [homeLeft, Math.max(homeLeft, coachMax)];
      return [managerMin, managerMax];
    }
    const awayRight = charForX(0.98);
    const awayLeft = Math.min(awayRight - coachSpan - managerSpan - gap, charForX(0.58));
    const slack = Math.max(0, awayRight - awayLeft - coachSpan - managerSpan - gap);
    const managerMax = awayLeft + Math.floor(slack / 2);
    const coachMin = managerMax + managerSpan + gap;
    const coachMax = Math.max(coachMin, awayRight - coachSpan);
    if (person.role === "manager") return [awayLeft, Math.max(awayLeft, managerMax)];
    return [coachMin, coachMax];
  };

  const xForName = (person, nameStart) => {
    const { left, right } = bounds();
    const centerChar = nameStart + Math.floor((person.name.length - 1) / 2);
    const dot = centerChar * 2;
    return clamp((dot - left) / Math.max(1, right - left), 0.01, 0.99);
  };

  const moveStaff = () => {
    ensureStaff();
    const y = staffBandY();
    staffWalkers.forEach((person) => {
      if (person.parade) return;
      person.px = person.x;
      person.py = person.y;
      const [minStart, maxStart] = nameLane(person);
      const dancing = celebrate?.side === person.side;
      const arrived = Math.abs(person.x - person.tx) < 0.006;
      if ((person.wait -= 1) <= 0 || arrived) {
        const start = minStart + Math.floor(random() * (maxStart - minStart + 1));
        person.tx = xForName(person, start);
        person.wait = dancing ? 4 : 16 + Math.floor(random() * 20);
      }
      person.ty = y;
      moveToward(person, person.tx, person.ty, dancing ? 0.03 : 0.012);
    });
  };

  const anchor = (player) => {
    const attacking = Boolean(owner && owner.side === player.side);
    const dir = dirOf(player);
    if (player.role === "gk") {
      const rushed = ownsLeft(player.side) ? ball.x < 0.22 : ball.x > 0.78;
      const x = rushed
        ? clamp(ownsLeft(player.side) ? ball.x - 0.04 : ball.x + 0.04, ownsLeft(player.side) ? 0.03 : 0.78, ownsLeft(player.side) ? 0.22 : 0.97)
        : player.slotX;
      return { x, y: clamp(0.5 + (ball.y - 0.5) * 0.55, 0.38, 0.62) };
    }
    const push = attacking ? 0.06 : -0.045;
    const shift = lineShift(tactic[player.side], {
      leading: (player.side === "home" ? homeScore - awayScore : awayScore - homeScore) > 0,
      trailing: (player.side === "home" ? homeScore - awayScore : awayScore - homeScore) < 0,
    });
    const slide = (ball.x - 0.5) * 0.16 * dir;
    let x = player.slotX + (push + shift) * dir + slide;
    let y = player.slotY + (ball.y - 0.5) * 0.42;
    if (attacking) {
      const trail = player.role === "def" ? 0.12 : 0.05;
      const squeeze = player.role === "def" ? 0.62 : 0.35;
      return {
        x: clamp(ball.x - dir * trail, 0.06, 0.94),
        y: clamp(ball.y * (1 - squeeze) + player.slotY * squeeze, 0.14, 0.86),
      };
    }
    if (player.role === "def" && !attacking) x -= 0.03 * dir;
    return { x: clamp(x, 0.04, 0.96), y: clamp(y, 0.06, 0.94) };
  };

  const attackPack = () => {
    if (!owner || owner.role === "gk") return [];
    return players.filter((player) => (
      !player.out
      && !player.down
      && player !== owner
      && player.side === owner.side
      && player.role !== "gk"
      && player.role !== "def"
    ));
  };

  const clusterSpot = (player, index, count) => {
    const dir = dirOf(player);
    const ahead = player.role === "fwd" ? 0.1 : 0.045;
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return {
      x: clamp(ball.x + dir * ahead + Math.cos(angle) * 0.065, 0.08, 0.92),
      y: clamp(ball.y + Math.sin(angle) * 0.09, 0.16, 0.84),
    };
  };

  const buildParade = (side) => {
    paradeCast = [];
    if (!side) return;
    ensureStaff();
    staffWalkers.forEach((person) => {
      if (person.side !== side) return;
      person.parade = true;
      paradeCast.push(person);
    });
    bench[side].splice(0).forEach((name, index) => {
      const spot = benchSeat(side);
      const x = clamp(spot.x + (index - 2) * 0.05, 0.08, 0.92);
      paradeCast.push({
        name,
        side,
        x,
        y: spot.y,
        px: x,
        py: spot.y,
        sub: true,
      });
    });
    replaced[side].splice(0).forEach((name, index) => {
      const spot = benchSeat(side);
      const x = clamp(spot.x + index * 0.05, 0.08, 0.92);
      paradeCast.push({
        name,
        side,
        x,
        y: spot.y,
        px: x,
        py: spot.y,
        sub: true,
        gray: true,
      });
    });
  };

  const warmupLane = (side) => {
    const near = outsideSpot(side === "home" ? 0.12 : 0.68, 1);
    const far = outsideSpot(side === "home" ? 0.38 : 0.9, 1);
    return {
      y: near.y,
      minX: Math.min(near.x, far.x),
      maxX: Math.max(near.x, far.x),
    };
  };

  const startWarmup = (player, name, side) => {
    const lane = warmupLane(side);
    const index = bench[side].indexOf(name);
    if (index >= 0) bench[side].splice(index, 1);
    const x = side === "home" ? lane.minX : lane.maxX;
    warmups.push({
      player,
      name,
      side,
      x,
      y: lane.y,
      px: x,
      py: lane.y,
      tx: side === "home" ? lane.maxX : lane.minX,
      minX: lane.minX,
      maxX: lane.maxX,
      left: 64,
    });
    recordParts([
      { text: "Warm Up", tone: "kick" },
      { text: ` · ${name}`, tone: side },
    ]);
    say(`${name} jogs the touchline before coming on for ${player.name}.`, side, 56);
  };

  const moveWarmups = () => {
    const dropped = [];
    warmups = warmups.filter((person) => {
      if (person.player.out && !person.player.hurt) {
        if (!bench[person.side].includes(person.name)) bench[person.side].unshift(person.name);
        made[person.side] = Math.max(0, made[person.side] - 1);
        return false;
      }
      person.px = person.x;
      person.py = person.y;
      if (Math.abs(person.x - person.tx) < 0.02) person.tx = person.tx === person.minX ? person.maxX : person.minX;
      moveToward(person, person.tx, person.y, 0.02);
      person.left -= 1;
      if (person.left > 0) return true;
      dropped.push(person);
      return false;
    });
    dropped.forEach((person) => {
      subQueue.push({ player: person.player, name: person.name, side: person.side });
      recordParts([
        { text: "Sub", tone: "kick" },
        { text: ` · ${person.name}`, tone: person.side },
        { text: " On", tone: "neutral" },
        { text: ` · ${person.player.name} Off`, tone: "neutral" },
      ]);
      say(`${person.name} is ready. ${person.player.name} is coming off.`, person.side, 48);
    });
  };

  const injure = (player, severe) => {
    if (!player || player.out || player.down || player.role === "gk" || injury) return false;
    if (owner === player) owner = null;
    player.down = true;
    player.dropX = player.x;
    player.dropY = player.y;
    const exit = outsideSpot(clamp(player.x, 0.1, 0.9), 1);
    const medics = [-1, 1].map((dir) => {
      const start = outsideSpot(clamp(player.x + dir * 0.08, 0.08, 0.92), 1);
      return { x: start.x, y: start.y, px: start.x, py: start.y };
    });
    const crowd = players
      .filter((mate) => mate !== player && !mate.out && !mate.down)
      .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))
      .slice(0, 4);
    injury = {
      player,
      severe,
      phase: "down",
      medics,
      crowd,
      exit,
      wait: 0,
      replace: false,
      line: `${player.name} is down. The referee and the medics come over.`,
    };
    recordParts([
      { text: "Injury", tone: "foul" },
      { text: ` · ${player.name}`, tone: player.side },
    ]);
    stats[player.side].injuries += 1;
    say(injury.line, "foul", 80);
    banner = "Injury";
    bannerLeft = 100000;
    return true;
  };

  const endTreatment = () => {
    if (banner === "Injury" || banner === "Stretcher") {
      banner = "";
      bannerLeft = 0;
    }
  };

  const gatherAround = () => {
    const player = injury.player;
    if (referee) {
      referee.px = referee.x;
      referee.py = referee.y;
      moveToward(referee, clamp(player.x, 0.08, 0.92), clamp(player.y + 0.07, 0.1, 0.9), 0.032);
    }
    (injury.crowd || []).forEach((mate, index) => {
      if (mate.out || mate.down) return;
      const angle = (index / Math.max(1, injury.crowd.length)) * Math.PI * 2 - Math.PI / 2;
      mate.px = mate.x;
      mate.py = mate.y;
      moveToward(
        mate,
        clamp(player.x + Math.cos(angle) * 0.065, 0.06, 0.94),
        clamp(player.y + Math.sin(angle) * 0.065, 0.08, 0.92),
        0.03,
      );
    });
  };

  const stepTreatment = () => {
    const player = injury.player;
    player.px = player.x;
    player.py = player.y;
    injury.medics.forEach((medic) => {
      medic.px = medic.x;
      medic.py = medic.y;
    });
    if (injury.phase === "down" || injury.phase === "treat") gatherAround();
    if (injury.phase === "down") {
      let arrived = true;
      injury.medics.forEach((medic, index) => {
        const tx = clamp(player.x + (index === 0 ? -0.035 : 0.035), 0.04, 0.96);
        moveToward(medic, tx, player.y, 0.045);
        if (Math.hypot(medic.x - tx, medic.y - player.y) > 0.03) arrived = false;
      });
      if (!arrived) return;
      injury.phase = "treat";
      injury.wait = injury.severe ? 16 : 26;
      injury.line = injury.severe
        ? `${player.name} needs a stretcher.`
        : `The medics treat ${player.name} on the pitch.`;
      say(injury.line, "foul", 70);
      return;
    }
    if (injury.phase === "treat") {
      injury.wait -= 1;
      if (injury.wait > 0) return;
      if (!injury.severe) {
        player.down = false;
        player.stamina = clamp((player.stamina ?? 100) - 18, 8, 100);
        say(`${player.name} is back up.`, player.side, 42);
        recordParts([
          { text: "Treated", tone: "kick" },
          { text: ` · ${player.name}`, tone: player.side },
        ]);
        injury = null;
        endTreatment();
        return;
      }
      injury.phase = "carry";
      injury.line = `${player.name} is stretchered off.`;
      banner = "Stretcher";
      say(injury.line, "foul", 70);
      recordParts([
        { text: "Stretcher", tone: "foul" },
        { text: ` · ${player.name}`, tone: player.side },
      ]);
      return;
    }
    const exit = injury.exit;
    moveToward(player, exit.x, exit.y, 0.022);
    injury.medics.forEach((medic, index) => {
      moveToward(medic, exit.x + (index === 0 ? -0.03 : 0.03), exit.y, 0.022);
    });
    if (Math.hypot(player.x - exit.x, player.y - exit.y) > 0.03) return;
    player.out = true;
    player.hurt = true;
    player.down = false;
    const side = player.side;
    const freeName = bench[side].find((name) => (
      !warmups.some((item) => item.name === name) && !subQueue.some((item) => item.name === name)
    ));
    injury.replace = made[side] < SUBS_MAX && Boolean(freeName) && random() < 0.6;
    injury.phase = "wait";
    injury.wait = injury.replace ? 10 : 55 + Math.floor(random() * 80);
    injury.medics = [];
    endTreatment();
    say(
      injury.replace
        ? `${player.name} will be replaced.`
        : `${player.name} is off, and will come back on.`,
      side,
      48,
    );
  };

  const runInjury = () => {
    if (!injury) return false;
    if (injury.phase === "down" || injury.phase === "treat" || injury.phase === "carry") {
      stepTreatment();
      return true;
    }
    if (injury.phase === "wait") {
      injury.wait -= 1;
      if (injury.wait > 0) return false;
      const player = injury.player;
      const replacing = injury.replace;
      injury = null;
      if (replacing && substitute(player.side, null, player)) return false;
      player.out = false;
      player.hurt = false;
      player.down = true;
      const back = outsideSpot(clamp(player.dropX ?? 0.5, 0.12, 0.88), 1);
      player.x = back.x;
      player.y = back.y;
      player.px = player.x;
      player.py = player.y;
      injury = { player, phase: "return", medics: [], line: `${player.name} comes back on.` };
      recordParts([
        { text: "Return", tone: "kick" },
        { text: ` · ${player.name}`, tone: player.side },
      ]);
      say(injury.line, player.side, 48);
      return false;
    }
    if (injury.phase === "return") {
      const player = injury.player;
      player.px = player.x;
      player.py = player.y;
      moveToward(player, player.slotX, player.slotY, 0.02);
      if (Math.hypot(player.x - player.slotX, player.y - player.slotY) <= 0.03) {
        player.x = player.slotX;
        player.y = player.slotY;
        player.down = false;
        player.mark = null;
        injury = null;
      }
    }
    return false;
  };

  const maybePull = () => {
    if (injury || phase || celebrate || halfBreak) return;
    if (random() > 0.0007) return;
    const tired = players
      .filter((player) => !player.out && !player.down && player.role !== "gk")
      .sort((a, b) => (a.stamina ?? 100) - (b.stamina ?? 100))[0];
    if (tired) injure(tired, random() < 0.45);
  };

  const substitute = (side, avoid = null, forced = null) => {
    if (made[side] >= SUBS_MAX) return false;
    const pending = new Set([
      ...subQueue.filter((item) => item.side === side).map((item) => item.name),
      ...warmups.filter((item) => item.side === side).map((item) => item.name),
    ]);
    if (subShow?.side === side) pending.add(subShow.name);
    const available = bench[side].filter((name) => !pending.has(name));
    if (!available.length) return false;
    const held = new Set(subQueue.map((item) => item.player));
    warmups.forEach((item) => held.add(item.player));
    if (subShow) held.add(subShow.player);
    if (forced) {
      if (held.has(forced) || forced.side !== side || forced.role === "gk") return false;
    }
    const diff = side === "home" ? homeScore - awayScore : awayScore - homeScore;
    const bias = (player) => {
      if (diff < 0 && player.role === "fwd") return 22;
      if (diff < 0 && player.role === "def") return -8;
      if (diff > 0 && player.role === "fwd") return -12;
      return 0;
    };
    const next = forced || players
      .filter((player) => !player.out && !player.down && player.side === side && player.role !== "gk" && player !== avoid && !held.has(player))
      .sort((a, b) => (a.stamina + bias(a)) - (b.stamina + bias(b)))[0];
    if (!next) return false;
    if (!forced) {
      let chance = next.stamina < 40 ? 0.9 : next.stamina < 72 ? 0.45 : 0.12;
      if (clock >= 60 && diff < 0) chance = Math.max(chance, 0.75);
      if (random() > chance) return false;
    }
    const name = available[0];
    made[side] += 1;
    stats[side].subs += 1;
    startWarmup(next, name, side);
    return true;
  };

  const benchSeat = (side) => {
    const { top, bottom } = bounds();
    const charRows = Math.max(1, Math.floor(rows / 4));
    const markRow = Math.max(0, charRows - BENCH_CHAR_ROWS) + 3;
    const y = (markRow * 4 - top) / Math.max(1, bottom - top);
    return { x: side === "home" ? 0.18 : 0.82, y };
  };

  const runSub = () => {
    if (!subShow && !subQueue.length) return false;
    capture();
    moveStaff();
    if (subShow?.retiree) {
      subShow.retiree.px = subShow.retiree.x;
      subShow.retiree.py = subShow.retiree.y;
    }
    if (!subShow) {
      const job = subQueue.shift();
      const gate = outsideSpot(0.5, 1);
      const shift = job.side === "home" ? -0.04 : 0.04;
      const index = bench[job.side].indexOf(job.name);
      if (index >= 0) bench[job.side].splice(index, 1);
      if (owner === job.player) owner = null;
      if (job.player.hurt && job.player.out) {
        const oldName = job.player.name;
        job.player.name = job.name;
        job.player.attr = sheetFor(job.name, job.player.role, job.side);
        job.player.stamina = 100;
        job.player.yellows = 0;
        job.player.out = false;
        job.player.hurt = false;
        job.player.down = false;
        job.player.conceal = 0;
        job.player.x = gate.x + shift;
        job.player.y = gate.y;
        job.player.px = job.player.x;
        job.player.py = job.player.y;
        subShow = {
          player: job.player,
          name: job.name,
          side: job.side,
          x: job.player.dropX ?? 0.5,
          y: job.player.dropY ?? 0.5,
          phase: "cross",
          gateX: gate.x,
          gateY: gate.y,
          waitX: gate.x + shift,
          waitY: gate.y,
          retiree: null,
          arrived: false,
          seated: true,
        };
        if (!replaced[job.side].includes(oldName)) replaced[job.side].push(oldName);
        say(`${job.name} comes on for ${oldName}.`, job.side, 60);
      } else {
        subShow = {
          player: job.player,
          name: job.name,
          side: job.side,
          x: job.player.x,
          y: job.player.y,
          phase: "off",
          gateX: gate.x,
          gateY: gate.y,
          waitX: gate.x + shift,
          waitY: gate.y,
          retiree: null,
          arrived: false,
          seated: false,
        };
        say(`${job.name} waits at the touchline for ${job.player.name}.`, job.side, 70);
      }
    }
    const player = subShow.player;
    if (player.out && !player.hurt) {
      if (!bench[subShow.side].includes(subShow.name)) bench[subShow.side].unshift(subShow.name);
      player.conceal = 0;
      subShow = null;
      return true;
    }
    if (subShow.phase === "off") {
      moveToward(player, subShow.gateX, subShow.gateY, 0.02);
      if (Math.hypot(player.x - subShow.gateX, player.y - subShow.gateY) <= 0.025) {
        const oldName = player.name;
        const retiree = {
          name: oldName,
          side: player.side,
          x: player.x,
          y: player.y,
          px: player.x,
          py: player.y,
        };
        player.name = subShow.name;
        player.attr = sheetFor(subShow.name, player.role, player.side);
        player.stamina = 100;
        player.yellows = 0;
        player.conceal = 0;
        player.x = subShow.waitX;
        player.y = subShow.waitY;
        player.px = player.x;
        player.py = player.y;
        subShow.retiree = retiree;
        subShow.phase = "cross";
        subShow.seat = benchSeat(player.side);
        say(`${oldName} and ${subShow.name} cross. ${oldName} takes a seat.`, player.side, 60);
      }
    } else {
      if (!subShow.arrived) {
        moveToward(player, subShow.x, subShow.y, 0.02);
        if (Math.hypot(player.x - subShow.x, player.y - subShow.y) <= 0.02) {
          player.x = subShow.x;
          player.y = subShow.y;
          subShow.arrived = true;
        }
      }
      if (subShow.retiree && !subShow.seated) {
        const retiree = subShow.retiree;
        moveToward(retiree, subShow.seat.x, subShow.seat.y, 0.024);
        if (Math.hypot(retiree.x - subShow.seat.x, retiree.y - subShow.seat.y) <= 0.03) {
          if (!replaced[retiree.side].includes(retiree.name)) replaced[retiree.side].push(retiree.name);
          subShow.seated = true;
          subShow.retiree = null;
        }
      }
      if (subShow.arrived && subShow.seated) subShow = null;
    }
    return true;
  };

  const pressers = () => {
    const defending = owner ? (owner.side === "home" ? "away" : "home") : null;
    const ranked = players
      .filter((player) => player !== owner)
      .filter((player) => {
        if (player.out || player.down) return false;
        if (!defending) return true;
        if (player.side !== defending) return false;
        if (player.role !== "gk") return true;
        return ownsLeft(defending) ? ball.x < BOX_D + 0.08 : ball.x > 1 - (BOX_D + 0.08);
      })
      .map((player) => ({ player, dist: Math.hypot(player.x - ball.x, player.y - ball.y) }))
      .sort((a, b) => a.dist - b.dist);
    if (!owner && ranked.length > 1 && Math.abs(ranked[0].dist - ranked[1].dist) <= 1e-6 && ranked[1].player.side === kickSide) {
      const swap = ranked[0];
      ranked[0] = ranked[1];
      ranked[1] = swap;
    }
    const picked = ranked.slice(0, owner ? pressCount(tactic[defending]) : 1);
    if (!owner && picked[0]?.player.role === "gk") {
      const cover = ranked.find((item) => item.player.role !== "gk");
      if (cover) picked.push(cover);
    }
    return picked.map((item) => item.player);
  };

  const support = () => {
    if (!owner) return null;
    return nearest(owner, (player) => player.side === owner.side && player !== owner && player.role !== "gk");
  };

  const launch = (from, tx, ty, speed, judged = true) => {
    const dx = tx - from.x;
    const dy = ty - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    ball.x = from.x;
    ball.y = from.y;
    ball.vx = (dx / dist) * speed;
    ball.vy = (dy / dist) * speed;
    ball.ignore = from;
    ball.cool = 5;
    ball.touch = from.side;
    from.passCool = 8;
    owner = null;
    const marked = [];
    if (judged) {
      players.forEach((mate) => {
        if (mate !== from && mate.side === from.side && offsideAt(mate, from.x)) marked.push(mate);
      });
    }
    ball.offside = marked;
    if (speed < SHOT_SPEED - 0.001) stats[from.side].passes += 1;
  };

  const choosePass = (player) => {
    const depth = depthOf(player);
    const options = [];
    players.forEach((mate) => {
      if (mate.out || mate.side !== player.side || mate === player || mate.role === "gk") return;
      const mateDepth = depthOf(mate);
      const dist = Math.hypot(mate.x - player.x, mate.y - player.y);
      if (dist < 0.08 || dist > 0.46 || mateDepth < depth - 0.04) return;
      const marker = nearest(mate, (other) => other.side !== mate.side);
      const space = marker ? Math.hypot(marker.x - mate.x, marker.y - mate.y) : 0.4;
      options.push({ mate, score: space + Math.max(0, mateDepth - depth) });
    });
    if (!options.length) return null;
    options.sort((a, b) => b.score - a.score);
    const open = options.filter((option) => option.score >= options[0].score * 0.82);
    return open[Math.floor(random() * open.length)].mate;
  };

  const tryOneTwo = (player) => {
    if (oneTwo || player.passCool > 0 || random() > 0.22) return false;
    const dir = dirOf(player);
    const marker = nearest(player, (other) => other.side !== player.side && other.role !== "gk");
    if (!marker || Math.hypot(marker.x - player.x, marker.y - player.y) > 0.16) return false;
    const partner = nearest(player, (other) => {
      if (other.out || other.side !== player.side || other === player || other.role === "gk") return false;
      const along = (other.x - player.x) * dir;
      const across = Math.abs(other.y - player.y);
      return along > -0.04 && along < 0.2 && across < 0.16 && Math.hypot(along, across) > 0.05;
    });
    if (!partner) return false;
    oneTwo = { passer: player, partner, phase: "give", ticks: 16 };
    recordParts([
      { text: "One-Two", tone: "kick" },
      { text: ` · ${player.name}`, tone: player.side },
      { text: ` · ${partner.name}`, tone: partner.side },
    ]);
    say(`${player.name} plays a one-two with ${partner.name}.`, "kick", 28);
    launch(player, partner.x, partner.y, PASS_SPEED * 0.9);
    return true;
  };

  const lateSpell = () => {
    if (!second && clock >= 35) return true;
    if (second && !extra && clock >= 80) return true;
    if (extra && clock >= 110) return true;
    return false;
  };

  const noteShot = (player, aimY) => {
    stats[player.side].shots += 1;
    stats[player.side].xg += xgOf(player.x, player.y, facesRight(player.side));
    if (inGoalY(aimY)) stats[player.side].onTarget += 1;
  };

  const decide = (player) => {
    if (oneTwo && player === oneTwo.partner && oneTwo.phase === "give") {
      const dir = dirOf(oneTwo.passer);
      const passer = oneTwo.passer.name;
      launch(
        player,
        clamp(oneTwo.passer.x + dir * 0.16, 0.06, 0.94),
        clamp(oneTwo.passer.y, 0.12, 0.88),
        PASS_SPEED,
      );
      oneTwo = null;
      say(`${player.name} returns it to ${passer}.`, "kick", 18);
      return;
    }
    if (player.role === "gk") {
      say(`${player.name} plays it out from the back.`, "kick", 24);
      launch(player, facesRight(player.side) ? 0.58 : 0.42, 0.16 + random() * 0.68, PASS_SPEED);
      return;
    }
    const depth = depthOf(player);
    const marker = nearest(player, (other) => other.side !== player.side && other.role !== "gk");
    const markerDist = marker ? Math.hypot(marker.x - player.x, marker.y - player.y) : Infinity;
    if (calm <= 0 && depth >= 1 - BOX_D && marker && markerDist < 0.09 && random() < 0.05) {
      whistle(marker, player);
      return;
    }
    if (depth < 0.9 && tryOneTwo(player)) return;
    const closedDown = marker && markerDist < 0.04;
    const diff = player.side === "home" ? homeScore - awayScore : awayScore - homeScore;
    const window = shotWindow(tactic[player.side], {
      leading: diff > 0,
      trailing: diff < 0,
      late: lateSpell(),
      home: player.side === "home",
    });
    if (depth >= window.close || (depth >= window.open && !closedDown)) {
      const keeper = nearest(player, (other) => other.role === "gk" && other.side !== player.side);
      const edge = GOAL_W / 2 - 0.012;
      const finishing = player.attr?.finishing ?? 60;
      let aimY = 0.5 + (random() - 0.5) * GOAL_W * 0.7;
      if (random() < wideChance(finishing)) aimY = random() < 0.5 ? 0.5 - GOAL_W : 0.5 + GOAL_W;
      else if (keeper && random() < 0.55 + finishing / 250) aimY = keeper.y >= 0.5 ? 0.5 - edge : 0.5 + edge;
      noteShot(player, aimY);
      launch(player, facesRight(player.side) ? 1.08 : -0.08, aimY, SHOT_SPEED);
      say(`${player.name} shoots!`, "goal", 22);
      return;
    }
    if (player.passCool > 0) {
      player.passCool -= 1;
      return;
    }
    const mate = choosePass(player);
    let miss = passMissChance(player.attr?.passing ?? 70, shaken[player.side] > 0);
    if (player.side === "home") miss *= 0.92;
    if (!mate || random() < miss) return;
    if (depthOf(mate) >= 0.62) say(`${player.name} finds ${mate.name} further forward.`, player.side, 22);
    launch(player, mate.x, mate.y, PASS_SPEED);
  };

  const inOwnBox = (side, x, y) => {
    const y0 = (1 - BOX_W) / 2;
    const y1 = (1 + BOX_W) / 2;
    if (y < y0 || y > y1) return false;
    return ownsLeft(side) ? x <= BOX_D : x >= 1 - BOX_D;
  };

  const cannotCatch = (leader, trailer, trailerTaken) => leader > trailer + Math.max(0, 5 - trailerTaken);

  const shootoutDone = () => {
    if (!pens) return false;
    if (cannotCatch(pens.home, pens.away, pens.awayTaken)) return true;
    if (cannotCatch(pens.away, pens.home, pens.homeTaken)) return true;
    return pens.homeTaken >= 5
      && pens.awayTaken >= 5
      && pens.homeTaken === pens.awayTaken
      && pens.home !== pens.away;
  };

  const takeShootoutKick = () => {
    phase = null;
    owner = null;
    oneTwo = null;
    if (ball) ball.shootout = false;
    const spot = facesRight(pens.side) ? 1 - SPOT : SPOT;
    beginSet("penalty", pens.side, spot, 0.5, "Penalty");
    if (phase) phase.shootout = true;
  };

  const finishKick = (scored) => {
    const side = pens.side;
    if (!scored) pens[`${side}Taken`] += 1;
    owner = null;
    oneTwo = null;
    phase = null;
    if (ball) ball.shootout = false;
    if (shootoutDone()) {
      shootWinner = pens.home === pens.away ? null : (pens.home > pens.away ? "home" : "away");
      record("Full Time");
      beginFinale();
      return;
    }
    pens.side = side === "home" ? "away" : "home";
    takeShootoutKick();
  };

  const beginShootout = () => {
    pens = { home: 0, away: 0, homeTaken: 0, awayTaken: 0, side: "home" };
    markPeriod("Penalties");
    record("Penalties");
    say("Still level. Penalties.", "penalty", 36);
    takeShootoutKick();
  };

  const beginSet = (kind, side, x, y, label, parts) => {
    if (ball?.shootout && kind !== "penalty") {
      ball.shootout = false;
      const saved = kind === "corner";
      record(saved ? "Saved" : "Miss");
      say(saved ? "The keeper keeps it out." : "The penalty misses.", "penalty", 28);
      finishKick(false);
      return;
    }
    if (phase) return;
    owner = null;
    const spot = kind === "throw" || kind === "corner" ? outsideSpot(x, y) : {
      x: clamp(x, 0.02, 0.98),
      y: clamp(y, 0.03, 0.97),
    };
    ball.x = spot.x;
    ball.y = spot.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.cool = 0;
    ball.ignore = null;
    ball.touch = side;
    ball.offside = null;
    ball.px = ball.x;
    ball.py = ball.y;
    const delayed = kind === "free" || kind === "penalty" || kind === "corner" || kind === "throw";
    const wait = delayed ? 0 : 12;
    phase = { kind, side, wait, place: delayed, label, ticks: 0 };
    calm = 90;
    const taker = kind === "goal"
      ? players.find((player) => player.side === side && player.role === "gk" && !player.out)
      : nearest(ball, (player) => player.side === side && player.role !== "gk")
        || nearest(ball, (player) => player.side === side);
    if (taker && !delayed) {
      taker.x = ball.x;
      taker.y = ball.y;
    }
    if (taker && delayed) taker.mark = { x: ball.x, y: ball.y };
    if (delayed) armBanner(label, 120, 0);
    else armBanner(label, 18);
    if (!parts) {
      const tone = kind === "corner" ? "corner" : kind === "throw" || kind === "goal" ? "kick" : "neutral";
      parts = [{ text: label, tone }];
      if (taker) parts.push({ text: ` · ${taker.name}`, tone: taker.side });
    }
    recordParts(parts);
    const named = taker ? taker.name : sideName(side);
    if (kind === "corner") say(`${named} will take the corner.`, "corner", 70);
    else if (kind === "throw") say(`Throw-in for ${sideName(side)}. ${named} takes it.`, "kick", 50);
    else if (kind === "goal") say(`${named} takes the goal kick.`, "kick", 36);
    else if (kind === "penalty") say(`Penalty to ${sideName(side)}. ${named} stands over it.`, "penalty", 70);
    else if (label === "Offside") {
      const guilty = parts?.find((part) => part.tone === "home" || part.tone === "away");
      const who = guilty ? guilty.text.replace(/^ · /, "") : sideName(side === "home" ? "away" : "home");
      say(`Offside. ${who} is in front of the last defender.`, "foul", 48);
    }
    else if (kind === "free") say(`Free kick to ${sideName(side)}. ${named} stands over it.`, "foul", 50);
    oneTwo = null;
    if (kind === "corner") stats[side].corners += 1;
    if (kind === "free") placeWall(side);
    if (kind === "corner") placeCornerCrowd(side, taker);
    if (kind === "penalty") placePenalty(side, taker);
    if (kind === "throw") placeThrow(side, taker);
    if (kind === "throw" || kind === "goal") {
      substitute(side, taker);
      substitute(side === "home" ? "away" : "home");
    }
  };

  const placeWall = (attackSide) => {
    const defending = attackSide === "home" ? "away" : "home";
    const goalX = facesRight(attackSide) ? 1 : 0;
    const dx = goalX - ball.x;
    const dy = 0.5 - ball.y;
    const dist = Math.hypot(dx, dy) || 1;
    const gap = 9.15 / LENGTH;
    const cx = ball.x + (dx / dist) * gap;
    const cy = ball.y + (dy / dist) * gap;
    const px = -dy / dist;
    const py = dx / dist;
    const wall = players
      .filter((player) => !player.out && player.side === defending && player.role !== "gk")
      .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
      .slice(0, 4);
    wall.forEach((player, index) => {
      const offset = (index - (wall.length - 1) / 2) * 0.09;
      player.mark = {
        x: clamp(cx + px * offset, 0.06, 0.94),
        y: clamp(cy + py * offset, 0.1, 0.9),
      };
    });
    const keeper = players.find((player) => player.side === defending && player.role === "gk" && !player.out);
    if (keeper) keeper.mark = { x: facesRight(attackSide) ? 0.97 : 0.03, y: 0.5 };
    players.forEach((player) => {
      if (player.out || player.mark || player.role === "gk") return;
      if (player.side === attackSide) {
        player.mark = {
          x: clamp(ball.x - ((goalX - ball.x) / dist) * 0.08, 0.06, 0.94),
          y: clamp(player.y, 0.12, 0.88),
        };
        return;
      }
      player.mark = {
        x: clamp(player.x + ((goalX - player.x) * 0.25), 0.06, 0.94),
        y: clamp(player.y, 0.1, 0.9),
      };
    });
  };

  const placeCornerCrowd = (attackSide, taker) => {
    const defending = attackSide === "home" ? "away" : "home";
    const forward = facesRight(attackSide);
    const attackers = players.filter((player) => !player.out && player.side === attackSide && player !== taker && player.role !== "gk");
    const markers = players.filter((player) => !player.out && player.side === defending && player.role !== "gk");
    const slots = [
      [0.05, -0.22], [0.09, -0.16], [0.13, -0.1], [0.06, -0.04],
      [0.1, 0.04], [0.14, 0.1], [0.07, 0.16], [0.11, 0.22], [0.15, 0], [0.12, -0.22],
    ];
    attackers.forEach((player, index) => {
      const [depth, wide] = slots[index % slots.length];
      player.mark = {
        x: clamp(forward ? 1 - depth : depth, 0.04, 0.96),
        y: clamp(0.5 + wide, 0.22, 0.78),
      };
    });
    markers.forEach((player, index) => {
      const mate = attackers[index % Math.max(1, attackers.length)];
      if (!mate?.mark) return;
      player.mark = {
        x: clamp(mate.mark.x + (forward ? 0.04 : -0.04), 0.04, 0.96),
        y: clamp(mate.mark.y + (index % 2 === 0 ? 0.055 : -0.055), 0.16, 0.84),
      };
    });
    const keeper = players.find((player) => player.side === defending && player.role === "gk" && !player.out);
    if (keeper) keeper.mark = { x: forward ? 0.97 : 0.03, y: 0.46 };
  };

  const placePenalty = (attackSide, taker) => {
    const defending = attackSide === "home" ? "away" : "home";
    const forward = facesRight(attackSide);
    const line = forward ? 1 - BOX_D - 0.04 : BOX_D + 0.04;
    const keeper = players.find((player) => player.side === defending && player.role === "gk" && !player.out);
    if (taker) taker.mark = { x: ball.x, y: ball.y };
    if (keeper) keeper.mark = { x: forward ? 0.97 : 0.03, y: 0.5 };
    const rest = players.filter((player) => !player.out && player !== taker && player !== keeper);
    rest.forEach((player, index) => {
      const row = index - (rest.length - 1) / 2;
      const drop = player.side === attackSide ? (forward ? -0.05 : 0.05) : (forward ? 0.02 : -0.02);
      player.mark = {
        x: clamp(line + drop, 0.05, 0.95),
        y: clamp(0.5 + row * 0.045, 0.08, 0.92),
      };
    });
  };

  const placeThrow = (side, taker) => {
    if (taker) taker.mark = { x: ball.x, y: ball.y };
    const inside = ball.y < 0.5 ? 0.18 : 0.82;
    const nearestToBall = (team) => players
      .filter((player) => !player.out && player.side === team && player !== taker && player.role !== "gk")
      .sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));
    const mates = nearestToBall(side).slice(0, 3);
    mates.forEach((player, index) => {
      player.mark = {
        x: clamp(ball.x + (index - 1) * 0.08, 0.08, 0.92),
        y: inside,
      };
    });
    nearestToBall(side === "home" ? "away" : "home").slice(0, 3).forEach((player, index) => {
      const mate = mates[index];
      if (!mate?.mark) return;
      player.mark = {
        x: mate.mark.x,
        y: clamp(mate.mark.y + (ball.y < 0.5 ? 0.1 : -0.1), 0.14, 0.86),
      };
    });
  };

  const takeSet = () => {
    const piece = phase;
    phase = null;
    if (!piece || piece.kind === "kickoff") return;
    const attackingGoal = facesRight(piece.side) ? 1.06 : -0.06;
    const spotX = facesRight(piece.side) ? 1 - SPOT : SPOT;
    let kicker = piece.kind === "goal"
      ? players.find((player) => player.side === piece.side && player.role === "gk" && !player.out)
      : null;
    if (!kicker) {
      kicker = nearest(ball, (player) => player.side === piece.side && player.role !== "gk")
        || nearest(ball, (player) => player.side === piece.side);
    }
    if (!kicker) return;
    kicker.x = ball.x;
    kicker.y = ball.y;
    if (piece.kind === "penalty") {
      const edge = GOAL_W / 2 - 0.01;
      const keeper = players.find((player) => player.role === "gk" && player.side !== kicker.side && !player.out);
      const handling = keeper?.attr?.handling ?? 78;
      let aimY = random() < 0.5 ? 0.5 - edge : 0.5 + edge;
      if (piece.shootout && random() < Math.min(0.42, Math.max(0.16, 0.2 + (handling - 75) * 0.004))) {
        aimY = random() < 0.5 ? 0.5 - GOAL_W : 0.5 + GOAL_W;
      } else if (!piece.shootout && random() >= 0.65) aimY = 0.5;
      noteShot(kicker, aimY);
      say(`${kicker.name} strikes the penalty.`, "penalty", 22);
      launch(kicker, attackingGoal, aimY, SHOT_SPEED);
      ball.shootout = Boolean(piece.shootout);
      return;
    }
    if (piece.kind === "corner") {
      say(`${kicker.name} swings the corner in.`, "corner", 22);
      launch(kicker, spotX, 0.5 + (random() - 0.5) * 0.22, PASS_SPEED, false);
      return;
    }
    if (piece.kind === "throw") {
      const mate = nearest(ball, (player) => player.side === piece.side && player !== kicker && player.role !== "gk");
      say(`${kicker.name} throws it in.`, "kick", 20);
      launch(kicker, mate ? clamp(mate.x, 0.08, 0.92) : 0.5, mate ? clamp(mate.y, 0.2, 0.8) : 0.5, PASS_SPEED, false);
      return;
    }
    if (piece.kind === "goal") {
      say(`${kicker.name} takes the goal kick.`, "kick", 20);
      launch(kicker, 0.5, 0.28 + random() * 0.44, PASS_SPEED, false);
      return;
    }
    if (piece.kind === "free" && piece.label !== "Offside" && depthOf(kicker) >= 0.7) {
      const aimY = 0.5 + (random() - 0.5) * 0.1;
      noteShot(kicker, aimY);
      say(`${kicker.name} shoots from the free kick.`, "foul", 22);
      launch(kicker, attackingGoal, aimY, SHOT_SPEED);
      return;
    }
    say(`${kicker.name} plays the free kick in.`, "foul", 20);
    launch(kicker, spotX, 0.32 + random() * 0.36, PASS_SPEED);
  };

  const whistle = (offender, victim) => {
    const spotX = clamp(victim.x, 0.05, 0.95);
    const spotY = clamp(victim.y, 0.08, 0.92);
    const roll = random();
    let card = "Foul";
    if (offender.yellows > 0 && roll < 0.4) {
      offender.out = true;
      card = "2nd Yellow";
    } else if (roll < 0.05) {
      offender.out = true;
      card = "Red";
      stats[offender.side].reds += 1;
    } else if (roll < 0.42 && offender.yellows === 0) {
      offender.yellows += 1;
      card = "Yellow";
      stats[offender.side].yellows += 1;
    }
    if (card === "2nd Yellow") stats[offender.side].reds += 1;
    stats[offender.side].fouls += 1;
    const attack = offender.side === "home" ? "away" : "home";
    const cardTone = card === "Red" ? "red" : card === "Foul" ? "foul" : "yellow";
    const inBox = inOwnBox(offender.side, spotX, spotY);
    const restart = inBox ? "Penalty" : "Free Kick";
    const parts = [
      { text: offender.name, tone: offender.side },
      { text: ` · ${card}`, tone: cardTone },
      { text: ` · ${restart}`, tone: inBox ? "penalty" : "foul" },
    ];
    const label = parts.map((part) => part.text).join("");
    if (inBox) {
      const spot = ownsLeft(offender.side) ? SPOT : 1 - SPOT;
      beginSet("penalty", attack, spot, 0.5, label, parts);
    } else beginSet("free", attack, spotX, spotY, label, parts);
    const cardLine = card === "Yellow"
      ? " Yellow card."
      : card === "Red" || card === "2nd Yellow"
        ? " He is sent off."
        : "";
    say(
      `${offender.name} fouls ${victim.name}.${cardLine} ${inBox ? "Penalty" : "Free kick"} to ${sideName(attack)}.`,
      inBox ? "penalty" : card === "Red" || card === "2nd Yellow" ? "red" : "foul",
      56,
    );
    if (!victim.out && victim.role !== "gk" && random() < 0.34) injure(victim, random() < 0.5);
  };

  const tackle = () => {
    if (!owner || ball.cool > 0) return false;
    let best = null;
    let bestDist = Infinity;
    players.forEach((player) => {
      if (player.out || player.down || player.side === owner.side) return;
      if (player.role === "gk") {
        const atGoal = ownsLeft(player.side) ? owner.x < BOX_D + 0.04 : owner.x > 1 - BOX_D - 0.04;
        if (!atGoal) return;
      }
      if (!near(player, owner)) return;
      const dist = Math.hypot(player.x - owner.x, player.y - owner.y);
      if (dist >= bestDist) return;
      best = player;
      bestDist = dist;
    });
    if (!best) return false;
    if (oneTwo && best !== oneTwo.partner) oneTwo = null;
    let win = tackleWinChance(best.attr?.tackling ?? 60);
    if (shaken[best.side] > 0) win *= 0.75;
    if (random() > win) return false;
    let foul = tackleFoulChance(best.attr?.tackling ?? 60);
    if (best.side === "home") foul *= 0.92;
    if (lateSpell()) foul *= 1.25;
    if (calm <= 0 && random() < foul) {
      whistle(best, owner);
      return true;
    }
    say(`${best.name} wins the ball.`, best.side, 20);
    stats[best.side].tackles += 1;
    ball.ignore = owner;
    ball.cool = 8;
    owner = best;
    owner.passCool = 6;
    ball.x = owner.x;
    ball.y = owner.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.touch = best.side;
    return true;
  };

  const flagOffside = (player) => {
    const defending = player.side === "home" ? "away" : "home";
    const half = facesRight(player.side) ? "right" : "left";
    const ar = linesmen?.find((item) => item.half === half);
    if (ar) ar.flag = 36;
    beginSet("free", defending, clamp(player.x, 0.08, 0.92), clamp(player.y, 0.1, 0.9), "Offside", [
      { text: "Offside", tone: "foul" },
      { text: ` · ${player.name}`, tone: player.side },
    ]);
  };

  const claimLoose = (pace) => {
    let best = null;
    let bestDist = Infinity;
    players.forEach((player) => {
      if (player.out || player.down || (ball.cool > 0 && player === ball.ignore)) return;
      if (ball.shootout) return;
      if (player.role === "gk" && pace > PASS_SPEED && keeperReaches(player) && random() < parryChance(player.attr?.handling ?? 70)) {
        const attack = player.side === "home" ? "away" : "home";
        const x = ownsLeft(player.side) ? 0 : 1;
        const y = ball.y < 0.5 ? 0 : 1;
        beginSet("corner", attack, x, y, "Corner");
        best = player;
        bestDist = -1;
        return;
      }
      const claimed = player.role === "gk"
        ? (pace < PASS_SPEED ? near(player, ball) : keeperReaches(player))
        : pace < PASS_SPEED && near(player, ball);
      if (!claimed) return;
      const dist = Math.hypot(player.x - ball.x, player.y - ball.y);
      const closer = dist < bestDist - 1e-6;
      const tied = Math.abs(dist - bestDist) <= 1e-6 && player.side === kickSide && best?.side !== kickSide;
      if (!closer && !tied) return;
      best = player;
      bestDist = dist;
    });
    if (!best) return false;
    if (phase) return true;
    if (ball.shootout && best.role === "gk") {
      ball.shootout = false;
      record("Saved");
      say("The keeper keeps it out.", "penalty", 28);
      finishKick(false);
      return true;
    }
    if (ball.offside?.includes(best)) {
      flagOffside(best);
      return true;
    }
    ball.offside = null;
    if (oneTwo && best !== oneTwo.partner && best !== oneTwo.passer) oneTwo = null;
    owner = best;
    best.passCool = 6;
    ball.vx = 0;
    ball.vy = 0;
    ball.touch = best.side;
    return true;
  };

  const resolveLooseBall = () => {
    if (ball.cool > 0) ball.cool -= 1;
    const pace = Math.hypot(ball.vx, ball.vy);
    const slices = pace > PASS_SPEED ? 4 : 1;
    for (let slice = 0; slice < slices; slice += 1) {
      const fromX = ball.x;
      const fromY = ball.y;
      ball.x += ball.vx / slices;
      ball.y += ball.vy / slices;
      const crossedOutX = fromX >= 0 && fromX <= 1 && (ball.x < 0 || ball.x > 1);
      const crossedOutY = fromY >= 0 && fromY <= 1 && (ball.y < 0 || ball.y > 1);
      if (crossedOutX) {
        const leftSide = ownsLeft("home") ? "home" : "away";
        const scored = ball.x < 0 ? (leftSide === "home" ? "away" : "home") : leftSide;
        if (inGoalY(ball.y)) {
          score(scored);
          return;
        }
        const defending = ball.x < 0 ? leftSide : (leftSide === "home" ? "away" : "home");
        const attacking = defending === "home" ? "away" : "home";
        if (ball.touch === defending) beginSet("corner", attacking, ball.x < 0 ? 0 : 1, ball.y < 0.5 ? 0 : 1, "Corner");
        else beginSet("goal", defending, ownsLeft(defending) ? 0.08 : 0.92, 0.5, "Goal Kick");
        return;
      }
      if (crossedOutY) {
        const side = ball.touch === "home" ? "away" : "home";
        beginSet("throw", side, clamp(ball.x, 0.08, 0.92), ball.y < 0.5 ? 0 : 1, "Throw In");
        return;
      }
      if (claimLoose(pace)) return;
    }
    ball.vx *= 0.92;
    ball.vy *= 0.92;
    if (Math.hypot(ball.vx, ball.vy) < 0.004) {
      ball.vx = 0;
      ball.vy = 0;
    }
  };

  const coach = () => {
    if (pens || finale) return;
    ["home", "away"].forEach((side) => {
      const diff = side === "home" ? homeScore - awayScore : awayScore - homeScore;
      const boss = STAFF[side].coach;
      const team = sideName(side);
      if (clock >= 60 && diff < 0 && tactic[side] !== "High Press" && coachMark[side] !== "chase") {
        tactic[side] = "High Press";
        coachMark[side] = "chase";
        recordParts([
          { text: "High Press", tone: "kick" },
          { text: ` · ${team}`, tone: side },
        ]);
        say(`${boss} switches ${team} to a high press.`, side, 48);
      } else if (clock >= 75 && diff > 0 && tactic[side] !== "Low Block" && coachMark[side] !== "hold") {
        tactic[side] = "Low Block";
        coachMark[side] = "hold";
        recordParts([
          { text: "Low Block", tone: "kick" },
          { text: ` · ${team}`, tone: side },
        ]);
        say(`${boss} drops ${team} into a low block.`, side, 48);
      }
    });
  };

  return {
    reset(nextCols, nextRows) {
      cols = Math.max(8, nextCols);
      rows = Math.max(8, nextRows);
      if (!live) {
        live = true;
        kickoff();
      }
      render();
    },
    step() {
      if (done) return;
      if (finale) {
        parade();
        render();
        return;
      }
      narrate();
      moveWarmups();
      if (runInjury()) {
        render();
        return;
      }
      if (runSub()) {
        render();
        return;
      }
      capture();
      if (!pens) {
        clock += 90 / TICKS_PER_MATCH;
        if (shaken.home > 0) shaken.home -= 1;
        if (shaken.away > 0) shaken.away -= 1;
        coach();
      }
      if (calm > 0) calm -= 1;
      moveReferee();
      moveLinesmen();
      moveStaff();
      if (bannerLeft > 0) bannerLeft -= 1;
      if (bannerLeft <= 0) banner = "";
      if (flashLeft > 0) flashLeft -= 1;
      if (flashLeft <= 0) flash = "";
      if (celebrate) {
        celebrate.wait -= 1;
        celebrateMove();
        if (celebrate.wait <= 0) {
          celebrate = null;
          if (!endIfDue()) kickoff();
        }
        render();
        return;
      }
      if (halfBreak) {
        clock = 45;
        halfBreak.wait -= 1;
        if (halfBreak.wait <= 0) finishHalf();
        render();
        return;
      }
      if (whistlePeriod()) {
        render();
        return;
      }
      if (phase) {
        if (phase.place) {
          phase.ticks += 1;
          let pending = false;
          players.forEach((player) => {
            if (player.out || player.down || !player.mark) return;
            const left = Math.hypot(player.x - player.mark.x, player.y - player.mark.y);
            if (left > 0.03 && phase.ticks < 60) {
              pending = true;
              moveToward(player, player.mark.x, player.mark.y, 0.03);
              return;
            }
            player.x = player.mark.x;
            player.y = player.mark.y;
          });
          if (!pending) {
            players.forEach((player) => { player.mark = null; });
            phase.place = false;
            phase.wait = restartDelay();
            armBanner(phase.label, phase.wait, phase.kind === "kickoff" ? 0 : 12);
          }
          render();
          return;
        }
        phase.wait -= 1;
        if (phase.wait <= 0) takeSet();
        render();
        return;
      }
      if (pens) {
        if (!phase && !ball?.shootout) takeShootoutKick();
        else resolveLooseBall();
        render();
        return;
      }
      if (oneTwo && (oneTwo.ticks -= 1) <= 0) oneTwo = null;
      if (!pens) maybePull();
      const chasing = new Set(pressers());
      const pack = attackPack();
      const packed = new Set(pack);
      const helper = support();
      players.forEach((player) => {
        if (player.out || player.down) return;
        if (oneTwo && player === oneTwo.passer && player !== owner) {
          const dir = dirOf(player);
          spend(player, -0.35);
          moveToward(
            player,
            clamp(oneTwo.partner.x + dir * 0.18, 0.06, 0.94),
            clamp(oneTwo.partner.y, 0.12, 0.88),
            effort(player, 0.021),
          );
          return;
        }
        if (packed.has(player)) {
          const spot = clusterSpot(player, pack.indexOf(player), pack.length);
          spend(player, -0.2);
          moveToward(player, spot.x, spot.y, effort(player, SPEED[player.role] + 0.005));
          return;
        }
        if (player === owner) {
          if (player.role === "gk") return;
          spend(player, -0.45);
          const aimY = clamp(player.y + (0.5 - player.y) * 0.08 + (player.y < 0.5 ? -0.04 : 0.04), 0.16, 0.84);
          moveToward(player, clamp(player.x + dirOf(player) * 0.18, 0.04, 0.96), aimY, effort(player, 0.018));
          return;
        }
        if (chasing.has(player)) {
          spend(player, player.role === "gk" ? -0.12 : -0.4);
          let chase = player.role === "gk" ? SPEED.gk : 0.017;
          if (player.side === "home") chase *= 1.04;
          moveToward(player, ball.x, ball.y, effort(player, chase));
          return;
        }
        if (player === helper) {
          spend(player, -0.15);
          const dir = dirOf(owner);
          moveToward(player, clamp(owner.x - dir * 0.1, 0.08, 0.92), clamp(owner.y + (owner.y < 0.5 ? 0.12 : -0.12), 0.1, 0.9), effort(player, SPEED[player.role]));
          return;
        }
        spend(player, 0.22);
        const spot = anchor(player);
        moveToward(player, spot.x, spot.y, effort(player, SPEED[player.role]));
      });
      if (owner) {
        stats[owner.side].hold += 1;
        ball.x = owner.x;
        ball.y = owner.y;
        if (!tackle()) decide(owner);
      } else resolveLooseBall();
      render();
    },
    present(alpha) {
      if (done || finale) return;
      render(Math.min(1, Math.max(0, alpha)));
    },
    cells() {
      return cells;
    },
    events() {
      return log.map((item) => (
        item.divider
          ? `—— ${item.divider} ——`
          : `${item.time} - ${item.parts.map((part) => part.text).join("")}`
      ));
    },
    feed() {
      return log;
    },
    highlight() {
      if (subShow) return { word: "SUB" };
      if (!flash) return null;
      if (flash !== "GOAL") return { word: flash };
      return { word: "GOAL", home: homeScore, away: awayScore };
    },
    commentary() {
      return { text: voice.text, tone: voice.tone };
    },
    pitch() {
      return { length: LENGTH, width: WIDTH };
    },
    hud() {
      const minute = Math.floor(clock);
      const card = (side) => {
        const player = owner && !owner.out && owner.side === side
          ? owner
          : nearest(ball, (item) => item.side === side && !item.out);
        if (!player) return null;
        return {
          name: player.name,
          role: ROLE[player.role] || player.role,
          stamina: Math.round(player.stamina ?? 100),
        };
      };
      return {
        home: homeScore,
        away: awayScore,
        minute,
        time: clockText(),
        period: periodText(),
        extra,
        note: subShow ? "Sub" : banner,
        homePlayer: card("home"),
        awayPlayer: card("away"),
      };
    },
    title() {
      const note = banner ? `  ${banner}` : "";
      return `soccer  HOME ${homeScore} - ${awayScore} AWAY  ${clockText()}  ${periodText()}${note}`;
    },
    score() {
      const homeN = players.filter((player) => player.side === "home" && !player.out).length;
      const awayN = players.filter((player) => player.side === "away" && !player.out).length;
      const men = homeN === 11 && awayN === 11 ? "" : `  ${homeN}v${awayN}`;
      const pen = pens ? `  PEN ${pens.home}-${pens.away}` : "";
      return `HOME ${homeScore} - ${awayScore} AWAY${men}${pen}`;
    },
    summary() {
      return summaryRows();
    },
    report() {
      const regulation = homeScore === awayScore ? "draw" : (homeScore > awayScore ? "home" : "away");
      const winner = regulation === "draw" ? (shootWinner || "draw") : regulation;
      return {
        home: homeScore,
        away: awayScore,
        winner,
        regulation,
        stats: {
          home: { ...stats.home },
          away: { ...stats.away },
        },
        tactics: { ...tactic },
        penalties: pens ? { home: pens.home, away: pens.away } : null,
      };
    },
    get done() {
      return done;
    },
    get holding() {
      return Boolean(finale);
    },
  };
}
