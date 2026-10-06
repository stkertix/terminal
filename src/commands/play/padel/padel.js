const POINT = ["0", "15", "30", "40"];
const NET = 0.5;
const SERVICE = 6.95 / 20;

const ROSTER = [
  { side: "home", role: "net", name: "GALAN" },
  { side: "home", role: "back", name: "LEBRON" },
  { side: "away", role: "net", name: "COELLO" },
  { side: "away", role: "back", name: "TAPIA" },
];

const other = (side) => (side === "home" ? "away" : "home");
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;

function sample(motion, t) {
  const u = clamp(t, 0, 1);
  if (!motion.via) {
    return { x: lerp(motion.from.x, motion.to.x, u), y: lerp(motion.from.y, motion.to.y, u) };
  }
  if (u < 0.5) {
    const v = u / 0.5;
    return { x: lerp(motion.from.x, motion.via.x, v), y: lerp(motion.from.y, motion.via.y, v) };
  }
  const v = (u - 0.5) / 0.5;
  return { x: lerp(motion.via.x, motion.to.x, v), y: lerp(motion.via.y, motion.to.y, v) };
}

export function createPadel() {
  let cols = 48;
  let rows = 40;
  let cells = [];
  let server = "home";
  let serveRight = true;
  let phase = "between";
  let pause = 6;
  let tick = 0;
  let done = false;
  let live = false;
  let flashLeft = 0;
  let endLeft = 0;
  let striker = null;
  let nextHitter = null;
  let motion = null;
  let script = [];
  let scriptIndex = 0;
  const points = { home: 0, away: 0 };
  const games = { home: 0, away: 0 };
  const log = [];
  const players = ROSTER.map((slot) => ({
    ...slot,
    x: slot.side === "home" ? 0.2 : 0.8,
    y: slot.role === "net" ? 0.35 : 0.65,
    px: 0,
    py: 0,
    slotX: 0.5,
    slotY: 0.5,
  }));
  const ball = { x: 0.08, y: 0.75, px: 0.08, py: 0.75 };

  const by = (side, role) => players.find((player) => player.side === side && player.role === role);

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

  const paint = (col, row, tone) => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return;
    const cell = cells[row * cols + col];
    if (!cell || cell.glyph) return;
    cell.lit = true;
    cell.tone = tone;
  };

  const hLine = (x0, x1, y, tone = "is-matrix-dim") => {
    const from = pitchToCell(Math.min(x0, x1), y);
    const to = pitchToCell(Math.max(x0, x1), y);
    for (let col = from.col; col <= to.col; col += 1) paint(col, from.row, tone);
  };

  const vLine = (x, y0, y1, tone = "is-matrix-dim") => {
    const from = pitchToCell(x, Math.min(y0, y1));
    const to = pitchToCell(x, Math.max(y0, y1));
    for (let row = from.row; row <= to.row; row += 1) paint(from.col, row, tone);
  };

  const drawCourt = () => {
    hLine(0, 1, 0);
    hLine(0, 1, 1);
    vLine(0, 0, 1);
    vLine(1, 0, 1);
    const homeLine = NET - SERVICE;
    const awayLine = NET + SERVICE;
    vLine(homeLine, 0, 1);
    vLine(awayLine, 0, 1);
    hLine(homeLine, NET, 0.5);
    hLine(NET, awayLine, 0.5);
    vLine(NET, 0, 1, "is-green");
  };

  const capture = () => {
    players.forEach((player) => {
      player.px = player.x;
      player.py = player.y;
    });
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
    drawCourt();
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
    if (striker) {
      const feet = charAt(spotOf(striker, alpha).x, spotOf(striker, alpha).y);
      const below = feet.row + 2;
      const above = feet.row - 2;
      ballChar = { col: feet.col, row: below < charRows ? below : Math.max(0, above) };
    }
    const taken = new Set();
    const cellsFor = (nameCol, nameRow, name) => {
      const spots = [];
      for (let index = 0; index < name.length; index += 1) spots.push([nameCol + index, nameRow]);
      spots.push([nameCol + Math.floor((name.length - 1) / 2), nameRow + 1]);
      return spots;
    };
    const freeAt = (nameCol, nameRow, name) => cellsFor(nameCol, nameRow, name).every(([letterCol, letterRow]) => {
      if (letterRow < 0 || letterRow >= charRows || letterCol < 0 || letterCol >= charCols) return false;
      if (Math.abs(letterCol - ballChar.col) <= 1 && Math.abs(letterRow - ballChar.row) <= 1) return false;
      return !taken.has(`${letterCol},${letterRow}`)
        && !taken.has(`${letterCol - 1},${letterRow}`)
        && !taken.has(`${letterCol + 1},${letterRow}`);
    });
    const drawPlayer = (player) => {
      const origin = charAt(spotOf(player, alpha).x, spotOf(player, alpha).y);
      const name = player.name;
      let nameCol = origin.col - Math.floor((name.length - 1) / 2);
      let nameRow = origin.row - 1;
      if (nameCol < 0) nameCol = 0;
      if (nameCol + name.length > charCols) nameCol = Math.max(0, charCols - name.length);
      if (nameRow < 0) nameRow = 0;
      if (!freeAt(nameCol, nameRow, name)) {
        for (let step = 1; step < charRows; step += 1) {
          if (freeAt(nameCol, origin.row - 1 - step, name)) {
            nameRow = origin.row - 1 - step;
            break;
          }
          if (freeAt(nameCol, origin.row - 1 + step, name)) {
            nameRow = origin.row - 1 + step;
            break;
          }
        }
      }
      const solid = player === striker;
      const tone = player.side === "home"
        ? (solid ? "is-blue" : "is-blue-dim")
        : (solid ? "is-red" : "is-red-dim");
      cellsFor(nameCol, nameRow, name).forEach(([letterCol, letterRow], index) => {
        stamp(letterCol, letterRow, index < name.length ? name[index] : (player.side === "home" ? "H" : "A"), tone);
        taken.add(`${letterCol},${letterRow}`);
      });
    };
    players.filter((player) => player !== striker).forEach(drawPlayer);
    if (striker) drawPlayer(striker);
    stamp(ballChar.col, ballChar.row, "o", "is-yellow");
  };

  const stampClock = () => {
    const total = Math.floor(tick * 0.08);
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const record = (text) => {
    log.push(`${stampClock()} - ${text}`);
  };

  const moveToward = (player, x, y, speed) => {
    const dx = x - player.x;
    const dy = y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return;
    const step = Math.min(speed, dist);
    player.x = clamp(player.x + (dx / dist) * step, 0.04, 0.96);
    player.y = clamp(player.y + (dy / dist) * step, 0.06, 0.94);
  };

  const serveSpot = (side, right) => (
    side === "home"
      ? { x: 0.08, y: right ? 0.75 : 0.25 }
      : { x: 0.92, y: right ? 0.25 : 0.75 }
  );

  const serviceTarget = (side, right) => (
    side === "home"
      ? { x: 0.68, y: right ? 0.3 : 0.7 }
      : { x: 0.32, y: right ? 0.7 : 0.3 }
  );

  const closer = (side, spot) => {
    const net = by(side, "net");
    const back = by(side, "back");
    const netDist = Math.hypot(net.slotX - spot.x, net.slotY - spot.y);
    const backDist = Math.hypot(back.slotX - spot.x, back.slotY - spot.y);
    return netDist <= backDist ? net : back;
  };

  const placeServe = () => {
    const spot = serveSpot(server, serveRight);
    const back = by(server, "back");
    const net = by(server, "net");
    const receiver = by(other(server), "back");
    const oppNet = by(other(server), "net");
    const partnerY = spot.y > 0.5 ? 0.28 : 0.72;
    back.slotX = spot.x;
    back.slotY = spot.y;
    if (server === "home") {
      net.slotX = 0.36;
      net.slotY = partnerY;
      receiver.slotX = 0.88;
      receiver.slotY = spot.y > 0.5 ? 0.32 : 0.68;
      oppNet.slotX = 0.64;
      oppNet.slotY = partnerY > 0.5 ? 0.32 : 0.68;
    } else {
      net.slotX = 0.64;
      net.slotY = partnerY;
      receiver.slotX = 0.12;
      receiver.slotY = spot.y > 0.5 ? 0.32 : 0.68;
      oppNet.slotX = 0.36;
      oppNet.slotY = partnerY > 0.5 ? 0.32 : 0.68;
    }
  };

  const rallySlots = () => {
    by("home", "net").slotX = 0.36;
    by("home", "net").slotY = 0.34;
    by("home", "back").slotX = 0.14;
    by("home", "back").slotY = 0.68;
    by("away", "net").slotX = 0.64;
    by("away", "net").slotY = 0.66;
    by("away", "back").slotX = 0.86;
    by("away", "back").slotY = 0.32;
  };

  const landIn = (side) => {
    const nearNet = side === "home" ? 0.4 : 0.6;
    const back = side === "home" ? 0.1 : 0.9;
    return {
      x: lerp(nearNet, back, 0.25 + Math.random() * 0.65),
      y: 0.14 + Math.random() * 0.72,
    };
  };

  const course = (shot, hitter) => {
    const side = hitter.side;
    if (shot.kind === "serve") {
      const to = serviceTarget(side, serveRight);
      return { to, via: null, duration: 4, receiver: closer(other(side), to) };
    }
    if (shot.kind === "serve-net" || shot.kind === "net") {
      return {
        to: { x: NET, y: clamp(hitter.y, 0.18, 0.82) },
        via: null,
        duration: 4,
        receiver: null,
      };
    }
    if (shot.kind === "serve-out" || shot.kind === "out") {
      return {
        to: { x: side === "home" ? 1.14 : -0.14, y: 0.2 + Math.random() * 0.6 },
        via: null,
        duration: 4,
        receiver: null,
      };
    }
    if (shot.kind === "wall") {
      const to = landIn(other(side));
      const sideGlass = Math.random() < 0.7;
      const via = sideGlass
        ? { x: side === "home" ? 0.62 + Math.random() * 0.24 : 0.14 + Math.random() * 0.24, y: to.y > 0.5 ? 0.98 : 0.02 }
        : { x: side === "home" ? 0.98 : 0.02, y: 0.2 + Math.random() * 0.6 };
      return { to, via, duration: 6, receiver: closer(other(side), to) };
    }
    const to = landIn(other(side));
    return { to, via: null, duration: 4, receiver: closer(other(side), to) };
  };

  const buildScript = () => {
    if (Math.random() < 0.08) return [{ kind: Math.random() < 0.5 ? "serve-net" : "serve-out" }];
    const shots = [{ kind: "serve" }];
    if (Math.random() < 0.45) shots.push({ kind: Math.random() < 0.75 ? "wall" : "drive" });
    const roll = Math.random();
    shots.push({ kind: roll < 0.46 ? "double" : roll < 0.73 ? "net" : "out" });
    return shots;
  };

  const beginShot = (snap) => {
    const shot = script[scriptIndex];
    const hitter = shot.kind.startsWith("serve") ? by(server, "back") : nextHitter;
    if (snap && hitter) {
      hitter.x = clamp(ball.x, 0.06, 0.94);
      hitter.y = clamp(ball.y, 0.08, 0.92);
    }
    if (!shot.kind.startsWith("serve")) rallySlots();
    const spec = course(shot, hitter);
    motion = {
      kind: shot.kind,
      hitter,
      from: { x: hitter.x, y: hitter.y },
      to: spec.to,
      via: spec.via,
      duration: spec.duration,
      age: 0,
      hop: false,
      receiver: spec.receiver,
    };
    nextHitter = spec.receiver;
    phase = "flight";
    striker = hitter;
    if (shot.kind === "serve") record(`${server === "home" ? "HOME" : "AWAY"} SERVE`);
  };

  const setOver = () => {
    const hi = Math.max(games.home, games.away);
    const lo = Math.min(games.home, games.away);
    if (hi >= 6 && hi - lo >= 2) return true;
    if (games.home === 6 && games.away === 6) return true;
    return false;
  };

  const award = (winner, reason) => {
    motion = null;
    striker = null;
    if (points[winner] >= 3) {
      games[winner] += 1;
      record(`${winner === "home" ? "HOME" : "AWAY"} ${reason}`);
      record(`GAME  HOME ${games.home} - ${games.away} AWAY`);
      flashLeft = 28;
      points.home = 0;
      points.away = 0;
      if (setOver()) {
        phase = "end";
        endLeft = 28;
        return;
      }
      server = other(server);
      serveRight = true;
      phase = "between";
      pause = 4;
      return;
    }
    points[winner] += 1;
    record(`${winner === "home" ? "HOME" : "AWAY"} ${reason}  ${POINT[points.home]}-${POINT[points.away]}`);
    serveRight = !serveRight;
    phase = "between";
    pause = 3;
  };

  const arrive = () => {
    const kind = motion.kind;
    const hitterSide = motion.hitter.side;
    if (kind === "net" || kind === "serve-net") {
      award(other(hitterSide), "NET");
      return;
    }
    if (kind === "out" || kind === "serve-out") {
      award(other(hitterSide), "OUT");
      return;
    }
    if (kind === "double") {
      if (!motion.hop) {
        const dir = hitterSide === "home" ? 1 : -1;
        motion = {
          ...motion,
          from: { x: motion.to.x, y: motion.to.y },
          to: {
            x: clamp(motion.to.x + dir * 0.14, 0.08, 0.92),
            y: clamp(motion.to.y + (Math.random() - 0.5) * 0.18, 0.1, 0.9),
          },
          via: null,
          duration: 3,
          age: 0,
          hop: true,
        };
        ball.x = motion.from.x;
        ball.y = motion.from.y;
        return;
      }
      award(hitterSide, "DOUBLE BOUNCE");
      return;
    }
    scriptIndex += 1;
    ball.x = motion.to.x;
    ball.y = motion.to.y;
    if (scriptIndex >= script.length) {
      award(hitterSide, "DOUBLE BOUNCE");
      return;
    }
    beginShot(true);
  };

  const walk = (speed) => {
    players.forEach((player) => moveToward(player, player.slotX, player.slotY, speed));
  };

  const stepFlight = () => {
    motion.age += 1;
    const point = sample(motion, motion.age / motion.duration);
    ball.x = point.x;
    ball.y = point.y;
    striker = motion.age <= 2 ? motion.hitter : null;
    const leaving = motion.kind === "out" || motion.kind === "serve-out";
    if (leaving && (ball.x <= 0.02 || ball.x >= 0.98)) {
      ball.x = clamp(ball.x, 0, 1);
      ball.y = clamp(ball.y, 0.04, 0.96);
      arrive();
      return;
    }
    players.forEach((player) => {
      if (player === motion.hitter) {
        if (motion.age > 2) moveToward(player, player.slotX, player.slotY, 0.035);
        return;
      }
      if (player === motion.receiver) {
        const speed = motion.kind === "double" ? 0.012 : 0.06;
        moveToward(player, motion.to.x, motion.to.y, speed);
        return;
      }
      const y = clamp(player.slotY * 0.7 + ball.y * 0.3, 0.12, 0.88);
      moveToward(player, player.slotX, y, 0.04);
    });
    if (motion.age >= motion.duration) arrive();
  };

  const opening = () => {
    server = "home";
    serveRight = true;
    points.home = 0;
    points.away = 0;
    games.home = 0;
    games.away = 0;
    placeServe();
    players.forEach((player) => {
      player.x = player.slotX;
      player.y = player.slotY;
      player.px = player.x;
      player.py = player.y;
    });
    const starter = by(server, "back");
    ball.x = starter.x;
    ball.y = starter.y;
    ball.px = ball.x;
    ball.py = ball.y;
    phase = "between";
    pause = 6;
    striker = starter;
  };

  return {
    reset(nextCols, nextRows) {
      cols = Math.max(8, nextCols);
      rows = Math.max(8, nextRows);
      if (!live) {
        live = true;
        opening();
      }
      render();
    },
    step() {
      if (done) return;
      capture();
      tick += 1;
      if (flashLeft > 0) flashLeft -= 1;
      if (phase === "end") {
        endLeft -= 1;
        if (endLeft <= 0) done = true;
        walk(0.04);
        render();
        return;
      }
      if (phase === "between") {
        placeServe();
        walk(0.1);
        const starter = by(server, "back");
        ball.x = starter.x;
        ball.y = starter.y;
        striker = starter;
        pause -= 1;
        if (pause <= 0) {
          players.forEach((player) => {
            player.x = player.slotX;
            player.y = player.slotY;
          });
          script = buildScript();
          scriptIndex = 0;
          beginShot(false);
        }
        render();
        return;
      }
      if (phase === "flight" && motion) stepFlight();
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
      if (flashLeft <= 0) return null;
      return { word: "GAME", home: games.home, away: games.away };
    },
    title() {
      return `padel  HOME ${POINT[points.home]} - ${POINT[points.away]} AWAY  ${games.home}-${games.away}`;
    },
    score() {
      return `HOME ${games.home} - ${games.away} AWAY`;
    },
    get done() {
      return done;
    },
  };
}
