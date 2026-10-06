export const GAMES = ["soccer"];

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
const TICKS_PER_MATCH = 750;
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
  { role: "fwd", x: 0.56, y: 0.36 },
  { role: "fwd", x: 0.56, y: 0.64 },
];

const SPEED = { gk: 0.011, def: 0.015, mid: 0.016, fwd: 0.017 };
const HOME_NAMES = ["NEUER", "LAHM", "RAMOS", "PUYOL", "ALBA", "XAVI", "INIESTA", "MODRIC", "KAKA", "MESSI", "SUAREZ"];
const AWAY_NAMES = ["CASILLAS", "ALVES", "SILVA", "PIQUE", "MARCELO", "KROOS", "BUSQUETS", "GERRARD", "ZIDANE", "RONALDO", "HENRY"];

function soccer() {
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
  let live = false;
  let extra = false;
  let kickSide = "home";
  let phase = null;
  let banner = "";
  let bannerLeft = 0;
  let flash = "";
  let calm = 0;
  let celebrate = null;
  let second = false;
  let halfBreak = null;
  const log = [];

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const facesRight = (side) => (side === "home") !== second;
  const ownsLeft = (side) => facesRight(side);
  const depthOf = (player) => (facesRight(player.side) ? player.x : 1 - player.x);
  const dirOf = (player) => (facesRight(player.side) ? 1 : -1);

  const bounds = () => {
    const left = 1;
    const right = Math.max(left + 2, cols - 2);
    const top = 1;
    const bottom = Math.max(top + 2, rows - 2);
    return { left, right, top, bottom };
  };

  const pitchToCell = (x, y) => {
    const { left, right, top, bottom } = bounds();
    return {
      col: clamp(Math.round(left + clamp(x, 0, 1) * (right - left)), 0, cols - 1),
      row: clamp(Math.round(top + clamp(y, 0, 1) * (bottom - top)), 0, rows - 1),
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
    for (let col = from.col; col <= to.col; col += 1) paint(col, from.row, "is-matrix-dim");
  };

  const vLine = (x, y0, y1) => {
    const from = pitchToCell(x, Math.min(y0, y1));
    const to = pitchToCell(x, Math.max(y0, y1));
    for (let row = from.row; row <= to.row; row += 1) paint(from.col, row, "is-matrix-dim");
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
        paint(col, row, "is-matrix-dim");
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
        paint(left - 1, row, "is-green");
        paint(right + 1, row, "is-green");
      } else {
        paint(left, row, "is-matrix-dim");
        paint(right, row, "is-matrix-dim");
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
        if (Math.abs(dist - 1) <= band) paint(col, row, "is-matrix-dim");
      }
    }
    drawArc(SPOT, "home");
    drawArc(1 - SPOT, "away");
    [pitchToCell(0.5, 0.5), pitchToCell(SPOT, 0.5), pitchToCell(1 - SPOT, 0.5)].forEach((spot) => {
      paint(spot.col, spot.row, "is-green");
    });
  };

  const capture = () => {
    players.forEach((player) => {
      player.px = player.x;
      player.py = player.y;
    });
    if (!ball) return;
    ball.px = ball.x;
    ball.py = ball.y;
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
    if (owner && !owner.out) {
      const feet = charAt(spotOf(owner, alpha).x, spotOf(owner, alpha).y);
      const below = feet.row + 2;
      const above = feet.row - 2;
      ballChar = { col: feet.col, row: below < charRows ? below : Math.max(0, above) };
    }
    const taken = new Set();
    const markOf = (player) => (player.role === "gk" ? "G" : player.side === "home" ? "H" : "A");
    const cellsFor = (nameCol, nameRow, name) => {
      const spots = [];
      for (let index = 0; index < name.length; index += 1) spots.push([nameCol + index, nameRow]);
      spots.push([nameCol + Math.floor((name.length - 1) / 2), nameRow + 1]);
      return spots;
    };
    const freeAt = (nameCol, nameRow, name, gap) => {
      const spots = cellsFor(nameCol, nameRow, name);
      return spots.every(([letterCol, letterRow]) => {
        if (letterRow < 0 || letterRow >= charRows || letterCol < 0 || letterCol >= charCols) return false;
        if (Math.abs(letterCol - ballChar.col) <= gap && Math.abs(letterRow - ballChar.row) <= gap) return false;
        return !taken.has(`${letterCol},${letterRow}`)
          && !taken.has(`${letterCol - 1},${letterRow}`)
          && !taken.has(`${letterCol + 1},${letterRow}`);
      });
    };
    const drawPlayer = (player) => {
      const origin = charAt(spotOf(player, alpha).x, spotOf(player, alpha).y);
      const name = player.name;
      let nameCol = origin.col - Math.floor((name.length - 1) / 2);
      let nameRow = origin.row - 1;
      if (nameCol < 0) nameCol = 0;
      if (nameCol + name.length > charCols) nameCol = Math.max(0, charCols - name.length);
      if (nameRow < 0) nameRow = 0;
      const gap = player === owner ? 1 : 0;
      if (!freeAt(nameCol, nameRow, name, gap)) {
        let placed = false;
        for (let step = 1; step < charRows && !placed; step += 1) {
          if (freeAt(nameCol, origin.row - 1 - step, name, gap)) {
            nameRow = origin.row - 1 - step;
            placed = true;
          } else if (freeAt(nameCol, origin.row - 1 + step, name, gap)) {
            nameRow = origin.row - 1 + step;
            placed = true;
          }
        }
      }
      const solid = player === owner;
      const tone = player.yellows > 0
        ? (solid ? "is-orange" : "is-orange-dim")
        : player.side === "home"
          ? (solid ? "is-blue" : "is-blue-dim")
          : (solid ? "is-red" : "is-red-dim");
      cellsFor(nameCol, nameRow, name).forEach(([letterCol, letterRow], index) => {
        const glyph = index < name.length ? name[index] : markOf(player);
        stamp(letterCol, letterRow, glyph, tone);
        taken.add(`${letterCol},${letterRow}`);
      });
    };
    players.filter((player) => !player.out && player !== owner).forEach(drawPlayer);
    if (owner && !owner.out) drawPlayer(owner);
    stamp(ballChar.col, ballChar.row, "o", "is-yellow");
  };

  const stamp = () => {
    const total = Math.max(0, Math.floor(clock * 60));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const record = (text) => {
    log.push(`${stamp()} - ${text}`);
  };

  const armBanner = (label, ticks) => {
    banner = label;
    bannerLeft = ticks;
    if (label === "GOAL") flash = "GOAL";
    else if (label === "CORNER") flash = "CORNER";
    else if (label.includes("PENALTY")) flash = "PENALTY";
    else if (label.includes("FREE KICK")) flash = "FOUL";
    else flash = "";
  };

  const show = (label) => {
    armBanner(label, 18);
    record(label);
  };

  const kickoff = () => {
    if (!players.length) {
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
          out: false,
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
          out: false,
        })),
      ];
    } else {
      players.forEach((player) => {
        if (player.out) return;
        player.x = player.slotX;
        player.y = player.slotY;
        player.passCool = 0;
      });
    }
    ball = { x: 0.5, y: 0.5, vx: 0, vy: 0, ignore: null, cool: 0, touch: kickSide };
    owner = null;
    phase = null;
    capture();
    if (log.length === 0) record("KICK OFF");
  };

  const score = (side) => {
    if (side === "home") homeScore += 1;
    else awayScore += 1;
    record(side === "home" ? "HOME GOAL" : "AWAY GOAL");
    kickSide = side === "home" ? "away" : "home";
    let scorer = ball.ignore;
    if (!scorer || scorer.out || scorer.side !== side || scorer.role === "gk") {
      scorer = nearest(ball, (player) => player.side === side && player.role !== "gk");
    }
    owner = null;
    phase = null;
    ball.vx = 0;
    ball.vy = 0;
    celebrate = {
      side,
      scorer,
      wait: 28,
      x: facesRight(side) ? 0.92 : 0.08,
      y: ball.y < 0.5 ? 0.14 : 0.86,
    };
    armBanner("GOAL", 30);
  };

  const endIfDue = () => {
    if (!extra && clock >= 90) {
      if (homeScore !== awayScore) {
        clock = 90;
        record("FULL TIME");
        done = true;
        return true;
      }
      extra = true;
      show("EXTRA TIME");
    }
    if (extra && clock >= 120) {
      clock = 120;
      record("FULL TIME");
      done = true;
      return true;
    }
    return false;
  };

  const beginHalf = () => {
    clock = 45;
    halfBreak = { wait: 18 };
    show("HALF TIME");
  };

  const finishHalf = () => {
    halfBreak = null;
    second = true;
    kickSide = "away";
    players.forEach((player) => {
      player.slotX = facesRight(player.side) ? player.baseX : 1 - player.baseX;
      player.slotY = player.baseY;
    });
    kickoff();
  };

  const celebrateMove = () => {
    const party = players.filter((player) => !player.out && player.side === celebrate.side && player.role !== "gk");
    party.forEach((player, index) => {
      const angle = (index / Math.max(1, party.length)) * Math.PI;
      const lead = player === celebrate.scorer;
      moveToward(player, celebrate.x + Math.cos(angle) * (lead ? 0.02 : 0.07), celebrate.y + Math.sin(angle) * 0.1, lead ? 0.032 : 0.026);
      player.y = clamp(player.y + Math.sin(celebrate.wait * 1.6 + index) * 0.028, 0.04, 0.96);
    });
    players.forEach((player) => {
      if (player.out || (player.side === celebrate.side && player.role !== "gk")) return;
      moveToward(player, player.slotX, player.slotY, 0.012);
    });
  };

  const nearest = (from, accept) => {
    let best = null;
    let bestDist = Infinity;
    players.forEach((player) => {
      if (player.out || !accept(player)) return;
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
    const slide = (ball.x - 0.5) * 0.16 * dir;
    let x = player.slotX + push * dir + slide;
    let y = player.slotY + (ball.y - 0.5) * 0.42;
    if (player.role === "fwd" && attacking) x += 0.07 * dir;
    if (player.role === "def" && !attacking) x -= 0.03 * dir;
    return { x: clamp(x, 0.04, 0.96), y: clamp(y, 0.06, 0.94) };
  };

  const pressers = () => {
    const defending = owner ? (owner.side === "home" ? "away" : "home") : null;
    const ranked = players
      .filter((player) => player !== owner)
      .filter((player) => {
        if (player.out) return false;
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
    const picked = ranked.slice(0, owner ? 2 : 1);
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

  const launch = (from, tx, ty, speed) => {
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
    return open[Math.floor(Math.random() * open.length)].mate;
  };

  const decide = (player) => {
    if (player.role === "gk") {
      launch(player, facesRight(player.side) ? 0.58 : 0.42, 0.16 + Math.random() * 0.68, PASS_SPEED);
      return;
    }
    const depth = depthOf(player);
    const marker = nearest(player, (other) => other.side !== player.side && other.role !== "gk");
    const markerDist = marker ? Math.hypot(marker.x - player.x, marker.y - player.y) : Infinity;
    if (calm <= 0 && depth >= 1 - BOX_D && marker && markerDist < 0.09 && Math.random() < 0.05) {
      whistle(marker, player);
      return;
    }
    const closedDown = marker && markerDist < 0.04;
    if (depth >= 0.9 || (depth >= 0.74 && !closedDown)) {
      const keeper = nearest(player, (other) => other.role === "gk" && other.side !== player.side);
      const edge = GOAL_W / 2 - 0.012;
      let aimY = 0.5 + (Math.random() - 0.5) * GOAL_W * 0.7;
      if (Math.random() < 0.16) aimY = Math.random() < 0.5 ? 0.5 - GOAL_W : 0.5 + GOAL_W;
      else if (keeper && Math.random() < 0.7) aimY = keeper.y >= 0.5 ? 0.5 - edge : 0.5 + edge;
      launch(player, facesRight(player.side) ? 1.08 : -0.08, aimY, SHOT_SPEED);
      return;
    }
    if (player.passCool > 0) {
      player.passCool -= 1;
      return;
    }
    const mate = choosePass(player);
    if (!mate || Math.random() < 0.35) return;
    launch(player, mate.x, mate.y, PASS_SPEED);
  };

  const inOwnBox = (side, x, y) => {
    const y0 = (1 - BOX_W) / 2;
    const y1 = (1 + BOX_W) / 2;
    if (y < y0 || y > y1) return false;
    return ownsLeft(side) ? x <= BOX_D : x >= 1 - BOX_D;
  };

  const beginSet = (kind, side, x, y, label) => {
    if (phase) return;
    owner = null;
    ball.x = clamp(x, 0.02, 0.98);
    ball.y = clamp(y, 0.03, 0.97);
    ball.vx = 0;
    ball.vy = 0;
    ball.cool = 0;
    ball.ignore = null;
    ball.touch = side;
    ball.px = ball.x;
    ball.py = ball.y;
    phase = { kind, side, wait: 12 };
    calm = 70;
    show(label);
  };

  const takeSet = () => {
    const piece = phase;
    phase = null;
    if (!piece) return;
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
      const aimY = Math.random() < 0.65 ? (Math.random() < 0.5 ? 0.5 - edge : 0.5 + edge) : 0.5;
      launch(kicker, attackingGoal, aimY, SHOT_SPEED);
      return;
    }
    if (piece.kind === "corner") {
      launch(kicker, spotX, 0.5 + (Math.random() - 0.5) * 0.22, PASS_SPEED);
      return;
    }
    if (piece.kind === "goal") {
      launch(kicker, 0.5, 0.28 + Math.random() * 0.44, PASS_SPEED);
      return;
    }
    if (depthOf(kicker) >= 0.7) {
      launch(kicker, attackingGoal, 0.5 + (Math.random() - 0.5) * 0.1, SHOT_SPEED);
      return;
    }
    launch(kicker, spotX, 0.32 + Math.random() * 0.36, PASS_SPEED);
  };

  const whistle = (offender, victim) => {
    const spotX = clamp(victim.x, 0.05, 0.95);
    const spotY = clamp(victim.y, 0.08, 0.92);
    const roll = Math.random();
    let card = "FOUL";
    if (offender.yellows > 0 && roll < 0.4) {
      offender.out = true;
      card = "2ND YELLOW";
    } else if (roll < 0.05) {
      offender.out = true;
      card = "RED";
    } else if (roll < 0.42 && offender.yellows === 0) {
      offender.yellows += 1;
      card = "YELLOW";
    }
    const attack = offender.side === "home" ? "away" : "home";
    if (inOwnBox(offender.side, spotX, spotY)) {
      const spot = ownsLeft(offender.side) ? SPOT : 1 - SPOT;
      beginSet("penalty", attack, spot, 0.5, `${card} · PENALTY`);
      return;
    }
    beginSet("free", attack, spotX, spotY, `${card} · FREE KICK`);
  };

  const tackle = () => {
    if (!owner || ball.cool > 0) return false;
    let best = null;
    let bestDist = Infinity;
    players.forEach((player) => {
      if (player.out || player.side === owner.side) return;
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
    if (calm <= 0 && Math.random() < 0.3) {
      whistle(best, owner);
      return true;
    }
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

  const claimLoose = (pace) => {
    let best = null;
    let bestDist = Infinity;
    players.forEach((player) => {
      if (player.out || (ball.cool > 0 && player === ball.ignore)) return;
      if (player.role === "gk" && pace > PASS_SPEED && keeperReaches(player) && Math.random() < 0.45) {
        const attack = player.side === "home" ? "away" : "home";
        const x = ownsLeft(player.side) ? 0.03 : 0.97;
        const y = ball.y < 0.5 ? 0.04 : 0.96;
        beginSet("corner", attack, x, y, "CORNER");
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
      ball.x += ball.vx / slices;
      ball.y += ball.vy / slices;
      if (ball.x < 0 || ball.x > 1) {
        const leftSide = ownsLeft("home") ? "home" : "away";
        const scored = ball.x < 0 ? (leftSide === "home" ? "away" : "home") : leftSide;
        if (inGoalY(ball.y)) {
          score(scored);
          return;
        }
        const defending = ball.x < 0 ? leftSide : (leftSide === "home" ? "away" : "home");
        const attacking = defending === "home" ? "away" : "home";
        const y = ball.y < 0.5 ? 0.04 : 0.96;
        if (ball.touch === defending) beginSet("corner", attacking, ball.x < 0 ? 0.03 : 0.97, y, "CORNER");
        else beginSet("goal", defending, ownsLeft(defending) ? 0.08 : 0.92, 0.5, "GOAL KICK");
        return;
      }
      if (ball.y < 0 || ball.y > 1) {
        ball.y = clamp(ball.y, 0.02, 0.98);
        ball.vy = 0;
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
      capture();
      clock += 90 / TICKS_PER_MATCH;
      if (calm > 0) calm -= 1;
      if (bannerLeft > 0) bannerLeft -= 1;
      if (bannerLeft <= 0) {
        banner = "";
        flash = "";
      }
      if (celebrate) {
        celebrate.wait -= 1;
        celebrateMove();
        if (celebrate.wait <= 0) {
          celebrate = null;
          if (!endIfDue()) {
            if (!second && clock >= 45) beginHalf();
            else kickoff();
          }
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
      if (!second && clock >= 45) {
        beginHalf();
        render();
        return;
      }
      if (!extra && clock >= 90) {
        if (homeScore !== awayScore) {
          clock = 90;
          record("FULL TIME");
          done = true;
          render();
          return;
        }
        extra = true;
        if (!banner) show("EXTRA TIME");
      }
      if (extra && clock >= 120) {
        clock = 120;
        record("FULL TIME");
        done = true;
        render();
        return;
      }
      if (phase) {
        phase.wait -= 1;
        if (phase.wait <= 0) takeSet();
        render();
        return;
      }
      const chasing = new Set(pressers());
      const helper = support();
      players.forEach((player) => {
        if (player.out) return;
        if (player === owner) {
          if (player.role === "gk") return;
          const aimY = clamp(player.y + (0.5 - player.y) * 0.08 + (player.y < 0.5 ? -0.04 : 0.04), 0.16, 0.84);
          moveToward(player, clamp(player.x + dirOf(player) * 0.18, 0.04, 0.96), aimY, 0.018);
          return;
        }
        if (chasing.has(player)) {
          moveToward(player, ball.x, ball.y, player.role === "gk" ? SPEED.gk : 0.017);
          return;
        }
        if (player === helper) {
          const dir = dirOf(owner);
          moveToward(player, clamp(owner.x - dir * 0.1, 0.08, 0.92), clamp(owner.y + (owner.y < 0.5 ? 0.12 : -0.12), 0.1, 0.9), SPEED[player.role]);
          return;
        }
        const spot = anchor(player);
        moveToward(player, spot.x, spot.y, SPEED[player.role]);
      });
      if (owner) {
        ball.x = owner.x;
        ball.y = owner.y;
        if (!tackle()) decide(owner);
      } else resolveLooseBall();
      render();
    },
    present(alpha) {
      if (done) return;
      render(Math.min(1, Math.max(0, alpha)));
    },
    cells() {
      return cells;
    },
    events() {
      return log;
    },
    highlight() {
      if (!flash) return null;
      if (flash !== "GOAL") return { word: flash };
      return { word: "GOAL", home: homeScore, away: awayScore };
    },
    title() {
      const minute = Math.min(extra ? 120 : 90, Math.floor(clock));
      const mark = extra ? " ET" : "";
      const note = banner ? `  ${banner}` : "";
      return `soccer  HOME ${homeScore} - ${awayScore} AWAY  ${minute}'${mark}${note}`;
    },
    score() {
      const homeN = players.filter((player) => player.side === "home" && !player.out).length;
      const awayN = players.filter((player) => player.side === "away" && !player.out).length;
      const men = homeN === 11 && awayN === 11 ? "" : `  ${homeN}v${awayN}`;
      return `HOME ${homeScore} - ${awayScore} AWAY${men}`;
    },
    get done() {
      return done;
    },
  };
}

const GLYPHS = {
  " ": ["   ", "   ", "   ", "   ", "   ", "   ", "   "],
  "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
  0: [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  1: ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  2: [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  3: [" ### ", "#   #", "    #", "  ## ", "    #", "#   #", " ### "],
  4: ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  5: ["#####", "#    ", "#    ", "#### ", "    #", "#   #", " ### "],
  6: [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "],
  7: ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  8: [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  9: [" ### ", "#   #", "#   #", " ####", "    #", "    #", " ### "],
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  C: [" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  G: [" ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ### "],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  N: ["#   #", "##  #", "# # #", "# # #", "#  ##", "#   #", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  R: ["#### ", "#   #", "#   #", "#### ", "#  # ", "#   #", "#   #"],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
};

const BRAILLE = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

const dotRows = (text) => {
  const height = GLYPHS.A.length;
  const rows = Array.from({ length: height }, () => []);
  [...String(text)].forEach((char, index) => {
    const glyph = GLYPHS[char] || GLYPHS[" "];
    if (index) rows.forEach((row) => row.push(0));
    glyph.forEach((line, y) => {
      [...line].forEach((cell) => rows[y].push(cell === "#" ? 1 : 0));
    });
  });
  return rows;
};

const scaleDots = (rows, sx, sy) => {
  const scaled = [];
  rows.forEach((row) => {
    const wide = [];
    row.forEach((bit) => {
      for (let step = 0; step < sx; step += 1) wide.push(bit);
    });
    for (let step = 0; step < sy; step += 1) scaled.push(wide);
  });
  return scaled;
};

const centerDots = (rows, width) => rows.map((row) => {
  const pad = Math.max(0, Math.floor((width - row.length) / 2));
  return [...Array(pad).fill(0), ...row, ...Array(Math.max(0, width - row.length - pad)).fill(0)];
});

const toBraille = (dots) => {
  if (!dots.length || !dots[0].length) return "";
  const cols = Math.ceil(dots[0].length / 2);
  const rows = Math.ceil(dots.length / 4);
  const lines = [];
  for (let row = 0; row < rows; row += 1) {
    let line = "";
    for (let col = 0; col < cols; col += 1) {
      let mask = 0;
      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          if (dots[row * 4 + dy]?.[col * 2 + dx]) mask |= BRAILLE[dy][dx];
        }
      }
      line += mask ? String.fromCharCode(0x2800 + mask) : " ";
    }
    lines.push(line.replace(/\s+$/u, ""));
  }
  return lines.join("\n");
};

export function bannerArt(call, cols = 48, rows = 16) {
  if (!call?.word) return "";
  const word = dotRows(call.word);
  let dots = word;
  if (call.word === "GOAL") {
    const score = dotRows(`${call.home} - ${call.away}`);
    const width = Math.max(word[0].length, score[0].length);
    dots = [...centerDots(word, width), Array(width).fill(0), ...centerDots(score, width)];
  }
  const roomW = Math.max(8, Math.floor((cols || 48) * 0.92));
  const roomH = Math.max(4, Math.floor((rows || 16) * 0.84));
  let scale = 1;
  while ((dots[0].length * (scale + 1) * 2) <= roomW && (dots.length * (scale + 1)) <= roomH) scale += 1;
  return toBraille(scaleDots(dots, scale * 4, scale * 4));
}

export function createGame(name) {
  if (name !== "soccer") throw new Error(`Unknown game: ${name}`);
  return soccer();
}
