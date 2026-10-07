const LENGTH = 20;
const WIDTH = 10;
const POINT = ["0", "15", "30", "40"];
const NET = 0.5;
const SERVICE = 6.95 / 20;
const ROLE = { net: "Net", back: "Back" };

const ROSTER = [
  { side: "home", role: "net", name: "Galan" },
  { side: "home", role: "back", name: "Lebron" },
  { side: "away", role: "net", name: "Coello" },
  { side: "away", role: "back", name: "Tapia" },
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
  let pause = 18;
  let clock = 0;
  let done = false;
  let live = false;
  let finale = null;
  let confetti = [];
  let striker = null;
  let nextHitter = null;
  let motion = null;
  let script = [];
  let scriptIndex = 0;
  let banner = "";
  let bannerLeft = 0;
  let voice = { text: "", tone: "neutral", until: 0 };
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
    stamina: 100,
  }));
  const ball = { x: 0.08, y: 0.75, px: 0.08, py: 0.75 };

  const by = (side, role) => players.find((player) => player.side === side && player.role === role);
  const sideName = (side) => (side === "home" ? "Home" : "Away");

  const bounds = () => {
    const marginX = 4;
    const marginY = 4;
    const availW = Math.max(4, cols - marginX * 2);
    const availH = Math.max(4, rows - marginY * 2);
    const ratio = cols / Math.max(1, rows);
    let innerW = availW;
    let innerH = innerW / ratio;
    if (innerH > availH) {
      innerH = availH;
      innerW = innerH * ratio;
    }
    innerW = Math.max(4, Math.min(availW, innerW));
    innerH = Math.max(4, Math.min(availH, innerH));
    const left = Math.round((cols - innerW) / 2);
    const top = Math.round((rows - innerH) / 2);
    const right = Math.min(cols - 1, left + Math.round(innerW));
    const bottom = Math.min(rows - 1, top + Math.round(innerH));
    return { left, right: Math.max(left + 2, right), top, bottom: Math.max(top + 2, bottom) };
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
    vLine(NET, 0, 1);
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
    const taken = new Set();
    const cellsFor = (nameCol, nameRow, name) => {
      const spots = [];
      for (let index = 0; index < name.length; index += 1) spots.push([nameCol + index, nameRow]);
      spots.push([nameCol + Math.floor((name.length - 1) / 2), nameRow + 1]);
      return spots;
    };
    const freeAt = (nameCol, nameRow, name, avoidBall) => cellsFor(nameCol, nameRow, name).every(([letterCol, letterRow]) => {
      if (letterRow < 0 || letterRow >= charRows || letterCol < 0 || letterCol >= charCols) return false;
      if (avoidBall && Math.abs(letterCol - ballChar.col) <= 1 && Math.abs(letterRow - ballChar.row) <= 1) return false;
      return !taken.has(`${letterCol},${letterRow}`)
        && !taken.has(`${letterCol - 1},${letterRow}`)
        && !taken.has(`${letterCol + 1},${letterRow}`);
    });
    const drawFigure = (entity, name, tone, avoidBall) => {
      const origin = charAt(spotOf(entity, alpha).x, spotOf(entity, alpha).y);
      let nameCol = origin.col - Math.floor((name.length - 1) / 2);
      let nameRow = origin.row - 1;
      if (nameCol < 0) nameCol = 0;
      if (nameCol + name.length > charCols) nameCol = Math.max(0, charCols - name.length);
      if (nameRow < 0) nameRow = 0;
      if (!freeAt(nameCol, nameRow, name, avoidBall)) {
        for (let step = 1; step < charRows; step += 1) {
          if (freeAt(nameCol, origin.row - 1 - step, name, avoidBall)) {
            nameRow = origin.row - 1 - step;
            break;
          }
          if (freeAt(nameCol, origin.row - 1 + step, name, avoidBall)) {
            nameRow = origin.row - 1 + step;
            break;
          }
        }
      }
      const marker = { col: origin.col, row: origin.row };
      cellsFor(nameCol, nameRow, name).forEach(([letterCol, letterRow], index) => {
        const feet = index >= name.length;
        const spotCol = feet ? marker.col : letterCol;
        const spotRow = feet ? marker.row : letterRow;
        stamp(spotCol, spotRow, feet ? "●" : name[index], tone);
        taken.add(`${spotCol},${spotRow}`);
      });
      return marker;
    };
    const holder = phase === "between" ? striker : null;
    const drawPlayer = (player) => {
      const solid = player === striker;
      const tone = player.side === "home"
        ? (solid ? "is-blue" : "is-blue-dim")
        : (solid ? "is-red" : "is-red-dim");
      return drawFigure(player, player.name, tone, player !== holder);
    };
    players.filter((player) => player !== holder).forEach(drawPlayer);
    const carrier = holder ? drawPlayer(holder) : null;
    if (carrier && holder) {
      const step = holder.side === "home" ? 1 : -1;
      const candidates = [step, -step].map((dir) => ({ col: carrier.col + dir, row: carrier.row }));
      const spot = candidates.find((item) => (
        item.col >= 0 && item.row >= 0 && item.col < charCols && item.row < charRows
        && !taken.has(`${item.col},${item.row}`)
      )) || candidates.find((item) => item.col >= 0 && item.col < charCols);
      if (spot) ballChar = spot;
    }
    stamp(ballChar.col, ballChar.row, "●", "is-white");
    confetti.forEach((bit) => {
      const spot = charAt(bit.x, bit.y);
      const index = spot.row * 4 * cols + spot.col * 2;
      if (cells[index]?.glyph) return;
      stamp(spot.col, spot.row, bit.glyph, bit.tone);
    });
  };

  const clockText = () => {
    const total = Math.max(0, Math.floor(clock));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const periodText = () => (finale ? "Full Time" : `Set ${games.home}-${games.away}`);

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

  const say = (text, tone = "neutral", ticks = 28) => {
    voice = { text, tone, until: ticks };
  };

  const armBanner = (label, ticks) => {
    banner = label;
    bannerLeft = ticks;
  };

  const fillVoice = () => {
    if (phase === "between") {
      const taker = by(server, "back");
      say(`${taker.name} to serve for ${sideName(server)}.`, "kick", 24);
      return;
    }
    if (motion?.kind === "wall") {
      say("The ball comes off the glass.", "kick", 16);
      return;
    }
    if (motion?.kind === "serve" || motion?.kind === "serve-out" || motion?.kind === "serve-net") {
      say("The serve is on its way.", server, 14);
      return;
    }
    if (striker) {
      const where = striker.role === "net" ? "at the net" : "from the back";
      say(`${striker.name} plays it ${where}.`, striker.side, 18);
      return;
    }
    say("The rally stays up.", "neutral", 16);
  };

  const narrate = () => {
    if (voice.until > 0) {
      voice.until -= 1;
      return;
    }
    if (done || finale) return;
    fillVoice();
  };

  const spend = (player, cost) => {
    player.stamina = clamp((player.stamina ?? 100) + cost, 0, 100);
  };

  const effort = (player, speed) => speed * (0.55 + 0.45 * ((player.stamina ?? 100) / 100));

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
      return { to, via: null, duration: 8, receiver: closer(other(side), to) };
    }
    if (shot.kind === "serve-net" || shot.kind === "net") {
      return {
        to: { x: NET, y: clamp(hitter.y, 0.18, 0.82) },
        via: null,
        duration: 7,
        receiver: null,
      };
    }
    if (shot.kind === "serve-out" || shot.kind === "out") {
      return {
        to: { x: side === "home" ? 1.14 : -0.14, y: 0.2 + Math.random() * 0.6 },
        via: null,
        duration: 7,
        receiver: null,
      };
    }
    if (shot.kind === "wall") {
      const to = landIn(other(side));
      const sideGlass = Math.random() < 0.7;
      const via = sideGlass
        ? { x: side === "home" ? 0.62 + Math.random() * 0.24 : 0.14 + Math.random() * 0.24, y: to.y > 0.5 ? 0.98 : 0.02 }
        : { x: side === "home" ? 0.98 : 0.02, y: 0.2 + Math.random() * 0.6 };
      return { to, via, duration: 12, receiver: closer(other(side), to) };
    }
    const to = landIn(other(side));
    return { to, via: null, duration: 8, receiver: closer(other(side), to) };
  };

  const buildScript = () => {
    const tired = (by(server, "back").stamina ?? 100) < 45;
    if (Math.random() < (tired ? 0.16 : 0.08)) return [{ kind: Math.random() < 0.5 ? "serve-net" : "serve-out" }];
    const shots = [{ kind: "serve" }];
    const extra = Math.random();
    if (extra < 0.72) shots.push({ kind: Math.random() < 0.7 ? "wall" : "drive" });
    if (extra < 0.38) shots.push({ kind: Math.random() < 0.55 ? "drive" : "wall" });
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
    spend(hitter, shot.kind.startsWith("serve") ? -1.2 : -1.6);
    if (shot.kind === "serve") {
      recordParts([
        { text: sideName(server), tone: server },
        { text: " serve", tone: "kick" },
      ]);
      armBanner("Serve", 10);
    }
  };

  const setOver = () => {
    const hi = Math.max(games.home, games.away);
    const lo = Math.min(games.home, games.away);
    return hi >= 6 && hi - lo >= 2;
  };

  const lapPoint = (t) => {
    const edge = (((t % 1) + 1) % 1) * 4;
    if (edge < 1) return { x: 0.12 + edge * 0.76, y: 0.86 };
    if (edge < 2) return { x: 0.88, y: 0.86 - (edge - 1) * 0.72 };
    if (edge < 3) return { x: 0.88 - (edge - 2) * 0.76, y: 0.14 };
    return { x: 0.12, y: 0.14 + (edge - 3) * 0.72 };
  };

  const beginFinale = () => {
    if (finale) return;
    motion = null;
    striker = null;
    phase = "end";
    const side = games.home === games.away ? null : (games.home > games.away ? "home" : "away");
    finale = { side, tick: 0 };
    confetti = [];
    record("Full Time");
    armBanner("Enter · new match    Esc · exit", 100000);
    const line = `Home ${games.home}, Away ${games.away}`;
    say(
      side
        ? `${sideName(side)} win the set. ${line}.`
        : `The set is level. ${line}.`,
      side || "neutral",
      100000,
    );
  };

  const parade = () => {
    finale.tick += 1;
    if (!finale.side) return;
    const winners = players.filter((player) => player.side === finale.side);
    winners.forEach((person, index) => {
      const spot = lapPoint(finale.tick * 0.004 + index / Math.max(1, winners.length));
      moveToward(person, spot.x, spot.y, 0.018);
    });
    confetti.forEach((bit) => {
      bit.x = clamp(bit.x + bit.vx, 0.02, 0.98);
      bit.y += bit.vy;
    });
    confetti = confetti.filter((bit) => bit.y < 1.05);
    if (confetti.length >= 48) return;
    const tones = ["is-yellow", "is-white", finale.side === "home" ? "is-blue" : "is-red"];
    const glyphs = ["*", "+", "·", "x"];
    for (let n = 0; n < 2; n += 1) {
      confetti.push({
        x: 0.08 + Math.random() * 0.84,
        y: -0.04 - Math.random() * 0.08,
        vy: 0.012 + Math.random() * 0.016,
        vx: (Math.random() - 0.5) * 0.01,
        glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
        tone: tones[Math.floor(Math.random() * tones.length)],
      });
    }
  };

  const award = (winner, reason) => {
    motion = null;
    striker = null;
    const label = reason === "DOUBLE BOUNCE" ? "double bounce" : reason.toLowerCase();
    const tone = reason === "NET" || reason === "OUT" ? "foul" : "goal";
    if (points[winner] >= 3) {
      games[winner] += 1;
      points.home = 0;
      points.away = 0;
      recordParts([
        { text: sideName(winner), tone: winner },
        { text: " game", tone: "goal" },
        { text: `  ${games.home}-${games.away}`, tone: "neutral" },
      ]);
      armBanner("Game", 22);
      say(`${sideName(winner)} take the game, ${games.home}-${games.away}.`, winner, 22);
      if (setOver()) {
        beginFinale();
        return;
      }
      server = other(server);
      serveRight = true;
      phase = "between";
      pause = 22;
      return;
    }
    points[winner] += 1;
    recordParts([
      { text: sideName(winner), tone: winner },
      { text: ` ${label}`, tone },
      { text: `  ${POINT[points.home]}-${POINT[points.away]}`, tone: "neutral" },
    ]);
    armBanner(label.replace(/\b\w/g, (letter) => letter.toUpperCase()), 12);
    say(`${sideName(winner)} ${label}. ${POINT[points.home]}-${POINT[points.away]}.`, winner, 16);
    serveRight = !serveRight;
    phase = "between";
    pause = 16;
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
          duration: 5,
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
    players.forEach((player) => {
      spend(player, 0.04);
      moveToward(player, player.slotX, player.slotY, effort(player, speed));
    });
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
        if (motion.age > 2) {
          spend(player, 0.05);
          moveToward(player, player.slotX, player.slotY, effort(player, 0.03));
        }
        return;
      }
      if (player === motion.receiver) {
        spend(player, motion.kind === "double" ? -0.03 : -0.05);
        const speed = motion.kind === "double" ? 0.012 : 0.05;
        moveToward(player, motion.to.x, motion.to.y, effort(player, speed));
        return;
      }
      spend(player, 0.02);
      const y = clamp(player.slotY * 0.7 + ball.y * 0.3, 0.12, 0.88);
      moveToward(player, player.slotX, y, effort(player, 0.035));
    });
    if (motion && motion.age >= motion.duration) arrive();
  };

  const opening = () => {
    server = "home";
    serveRight = true;
    points.home = 0;
    points.away = 0;
    games.home = 0;
    games.away = 0;
    markPeriod("Set");
    placeServe();
    players.forEach((player) => {
      player.x = player.slotX;
      player.y = player.slotY;
      player.px = player.x;
      player.py = player.y;
      player.stamina = 100;
    });
    const starter = by(server, "back");
    ball.x = starter.x;
    ball.y = starter.y;
    ball.px = ball.x;
    ball.py = ball.y;
    phase = "between";
    pause = 18;
    striker = starter;
    armBanner("Serve", 18);
  };

  const cardFor = (side) => {
    const owned = striker && striker.side === side ? striker : null;
    const player = owned || players
      .filter((item) => item.side === side)
      .sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y))[0];
    if (!player) return null;
    return {
      name: player.name,
      role: ROLE[player.role] || player.role,
      stamina: Math.round(player.stamina ?? 100),
    };
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
      narrate();
      if (finale) {
        parade();
        render();
        return;
      }
      capture();
      clock += 0.08;
      if (bannerLeft > 0) bannerLeft -= 1;
      if (bannerLeft <= 0) banner = "";
      if (phase === "between") {
        placeServe();
        walk(0.08);
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
    commentary() {
      return { text: voice.text, tone: voice.tone };
    },
    pitch() {
      return { length: LENGTH, width: WIDTH };
    },
    hud() {
      return {
        home: finale ? games.home : POINT[points.home],
        away: finale ? games.away : POINT[points.away],
        time: clockText(),
        period: periodText(),
        note: banner,
        homePlayer: cardFor("home"),
        awayPlayer: cardFor("away"),
      };
    },
    title() {
      const note = banner ? `  ${banner}` : "";
      return `padel  HOME ${POINT[points.home]} - ${POINT[points.away]} AWAY  ${clockText()}  ${periodText()}${note}`;
    },
    score() {
      return `HOME ${games.home} - ${games.away} AWAY`;
    },
    get done() {
      return done;
    },
    get holding() {
      return Boolean(finale);
    },
  };
}
