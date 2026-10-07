const LENGTH = 13.4;
const WIDTH = 6.1;
const NET = 0.5;
const SHORT = 1.98 / LENGTH;
const LONG = 0.76 / LENGTH;
const SINGLES = 0.46 / WIDTH;
const ROLE = { front: "Front", back: "Back" };

const ROSTER = [
  { side: "home", role: "front", name: "Kevin" },
  { side: "home", role: "back", name: "Marcus" },
  { side: "away", role: "front", name: "Ahsan" },
  { side: "away", role: "back", name: "Hendra" },
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

export function createBadminton() {
  let cols = 48;
  let rows = 40;
  let cells = [];
  let server = "home";
  let serveRight = true;
  let phase = "between";
  let pause = 16;
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
  const log = [];
  const players = ROSTER.map((slot) => ({
    ...slot,
    x: slot.side === "home" ? 0.18 : 0.82,
    y: slot.role === "front" ? 0.35 : 0.65,
    px: 0,
    py: 0,
    slotX: 0.5,
    slotY: 0.5,
    stamina: 100,
  }));
  const ball = { x: 0.1, y: 0.74, px: 0.1, py: 0.74 };

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
    const shortHome = NET - SHORT;
    const shortAway = NET + SHORT;
    const longHome = LONG;
    const longAway = 1 - LONG;
    vLine(shortHome, 0, 1);
    vLine(shortAway, 0, 1);
    vLine(longHome, 0, 1);
    vLine(longAway, 0, 1);
    vLine(NET, 0, 1);
    hLine(0, shortHome, 0.5);
    hLine(shortAway, 1, 0.5);
    hLine(0, 1, SINGLES);
    hLine(0, 1, 1 - SINGLES);
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

  const periodText = () => {
    if (finale) return "Full Time";
    if (points.home >= 20 && points.away >= 20) return "Setting";
    return "Game";
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

  const say = (text, tone = "neutral", ticks = 28) => {
    voice = { text, tone, until: ticks };
  };

  const armBanner = (label, ticks) => {
    banner = label;
    bannerLeft = ticks;
  };

  const shotLine = () => {
    if (!striker || !motion) return;
    if (motion.kind === "smash" || motion.kind === "winner") {
      say(`${striker.name} smashes.`, striker.side, 14);
      return;
    }
    if (motion.kind === "clear") {
      say(`${striker.name} sends up a clear.`, striker.side, 16);
      return;
    }
    if (motion.kind === "drop") {
      say(`${striker.name} plays a drop at the net.`, striker.side, 16);
      return;
    }
    if (motion.kind === "drive") {
      say(`${striker.name} drives it flat.`, striker.side, 14);
      return;
    }
    const where = striker.role === "front" ? "at the net" : "from the back";
    say(`${striker.name} plays it ${where}.`, striker.side, 16);
  };

  const fillVoice = () => {
    if (phase === "between") {
      const taker = by(server, "back");
      const box = serveRight ? "right" : "left";
      say(`${taker.name} to serve from the ${box} for ${sideName(server)}.`, "kick", 24);
      return;
    }
    if (motion?.kind === "let") {
      say("The serve clips the net.", "kick", 14);
      return;
    }
    if (motion?.kind === "serve" || motion?.kind === "serve-out" || motion?.kind === "serve-net") {
      say("The serve is on its way.", server, 14);
      return;
    }
    if (striker) {
      shotLine();
      return;
    }
    say("The rally stays up.", "neutral", 14);
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

  const serveSpot = (side, right) => {
    const x = side === "home" ? 0.1 : 0.9;
    const y = right
      ? (side === "home" ? 0.74 : 0.26)
      : (side === "home" ? 0.26 : 0.74);
    return { x, y };
  };

  const serviceTarget = (side, right) => {
    const span = Math.max(0.08, 0.5 - SHORT - LONG - 0.08);
    const inset = 0.03 + Math.random() * span;
    const x = side === "home" ? NET + SHORT + inset : NET - SHORT - inset;
    const near = 0.16 + Math.random() * 0.24;
    const far = 0.6 + Math.random() * 0.24;
    const y = right
      ? (side === "home" ? near : far)
      : (side === "home" ? far : near);
    return { x: clamp(x, 0.08, 0.92), y };
  };

  const closer = (side, spot) => {
    const front = by(side, "front");
    const back = by(side, "back");
    const frontDist = Math.hypot(front.slotX - spot.x, front.slotY - spot.y);
    const backDist = Math.hypot(back.slotX - spot.x, back.slotY - spot.y);
    return frontDist <= backDist ? front : back;
  };

  const placeServe = () => {
    const spot = serveSpot(server, serveRight);
    const back = by(server, "back");
    const front = by(server, "front");
    const receiver = by(other(server), "back");
    const oppFront = by(other(server), "front");
    const partnerY = spot.y > 0.5 ? 0.3 : 0.7;
    back.slotX = spot.x;
    back.slotY = spot.y;
    if (server === "home") {
      front.slotX = 0.36;
      front.slotY = partnerY;
      receiver.slotX = 0.88;
      receiver.slotY = spot.y > 0.5 ? 0.3 : 0.7;
      oppFront.slotX = 0.64;
      oppFront.slotY = partnerY > 0.5 ? 0.32 : 0.68;
    } else {
      front.slotX = 0.64;
      front.slotY = partnerY;
      receiver.slotX = 0.12;
      receiver.slotY = spot.y > 0.5 ? 0.3 : 0.7;
      oppFront.slotX = 0.36;
      oppFront.slotY = partnerY > 0.5 ? 0.32 : 0.68;
    }
  };

  const rallySlots = () => {
    by("home", "front").slotX = 0.38;
    by("home", "front").slotY = 0.36;
    by("home", "back").slotX = 0.14;
    by("home", "back").slotY = 0.68;
    by("away", "front").slotX = 0.62;
    by("away", "front").slotY = 0.64;
    by("away", "back").slotX = 0.86;
    by("away", "back").slotY = 0.32;
  };

  const landIn = (side, kind) => {
    const y = 0.12 + Math.random() * 0.76;
    if (kind === "drop") {
      return { x: side === "home" ? 0.4 + Math.random() * 0.06 : 0.54 + Math.random() * 0.06, y };
    }
    if (kind === "clear") {
      return { x: side === "home" ? 0.06 + Math.random() * 0.1 : 0.84 + Math.random() * 0.1, y };
    }
    if (kind === "smash" || kind === "winner") {
      return {
        x: side === "home" ? 0.16 + Math.random() * 0.22 : 0.62 + Math.random() * 0.22,
        y: 0.16 + Math.random() * 0.68,
      };
    }
    return {
      x: side === "home" ? 0.14 + Math.random() * 0.28 : 0.58 + Math.random() * 0.28,
      y,
    };
  };

  const course = (shot, hitter) => {
    const side = hitter.side;
    if (shot.kind === "serve" || shot.kind === "let") {
      const to = serviceTarget(side, serveRight);
      const via = shot.kind === "let" ? { x: NET, y: clamp((hitter.y + to.y) / 2, 0.2, 0.8) } : null;
      return { to, via, duration: shot.kind === "let" ? 8 : 6, receiver: closer(other(side), to) };
    }
    if (shot.kind === "serve-net" || shot.kind === "net") {
      return {
        to: { x: NET, y: clamp(hitter.y, 0.16, 0.84) },
        via: null,
        duration: 5,
        receiver: null,
      };
    }
    if (shot.kind === "serve-out" || shot.kind === "out") {
      const wide = Math.random() < 0.35;
      return {
        to: wide
          ? { x: side === "home" ? 0.72 : 0.28, y: Math.random() < 0.5 ? -0.12 : 1.12 }
          : { x: side === "home" ? 1.12 : -0.12, y: 0.15 + Math.random() * 0.7 },
        via: null,
        duration: 6,
        receiver: null,
      };
    }
    const to = landIn(other(side), shot.kind);
    const duration = shot.kind === "smash" || shot.kind === "winner" ? 4 : shot.kind === "clear" ? 10 : shot.kind === "drop" ? 8 : 6;
    return { to, via: null, duration, receiver: closer(other(side), to) };
  };

  const buildScript = () => {
    const tired = (by(server, "back").stamina ?? 100) < 45;
    const roll = Math.random();
    if (roll < 0.05) return [{ kind: "let" }];
    if (roll < (tired ? 0.18 : 0.1)) return [{ kind: Math.random() < 0.45 ? "serve-net" : "serve-out" }];
    const shots = [{ kind: "serve" }];
    const rally = ["clear", "drop", "drive", "smash"];
    const pick = () => rally[Math.floor(Math.random() * rally.length)];
    const extra = Math.random();
    if (extra < 0.82) shots.push({ kind: pick() });
    if (extra < 0.46) shots.push({ kind: pick() });
    if (extra < 0.18) shots.push({ kind: pick() });
    const end = Math.random();
    shots.push({ kind: end < 0.42 ? "winner" : end < 0.7 ? "net" : "out" });
    return shots;
  };

  const beginShot = (snap) => {
    const shot = script[scriptIndex];
    const hitter = shot.kind.startsWith("serve") || shot.kind === "let" ? by(server, "back") : nextHitter;
    if (snap && hitter) {
      hitter.x = clamp(ball.x, 0.06, 0.94);
      hitter.y = clamp(ball.y, 0.08, 0.92);
    }
    if (!shot.kind.startsWith("serve") && shot.kind !== "let") rallySlots();
    const spec = course(shot, hitter);
    motion = {
      kind: shot.kind,
      hitter,
      from: { x: hitter.x, y: hitter.y },
      to: spec.to,
      via: spec.via,
      duration: spec.duration,
      age: 0,
      receiver: spec.receiver,
    };
    nextHitter = spec.receiver;
    phase = "flight";
    striker = hitter;
    spend(hitter, shot.kind === "smash" || shot.kind === "winner" ? -2.2 : shot.kind.startsWith("serve") || shot.kind === "let" ? -1.1 : -1.5);
    if (shot.kind === "serve") {
      recordParts([
        { text: sideName(server), tone: server },
        { text: " serve", tone: "kick" },
      ]);
      armBanner("Serve", 10);
    }
  };

  const gameWon = (side) => {
    const mine = points[side];
    const theirs = points[other(side)];
    if (mine >= 30) return true;
    return mine >= 21 && mine - theirs >= 2;
  };

  const wouldWin = (side) => {
    const mine = points[side] + 1;
    const theirs = points[other(side)];
    if (mine >= 30) return true;
    return mine >= 21 && mine - theirs >= 2;
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
    const side = points.home === points.away ? null : (points.home > points.away ? "home" : "away");
    finale = { side, tick: 0 };
    confetti = [];
    record("Full Time");
    armBanner("Enter · new match    Esc · exit", 100000);
    const line = `Home ${points.home}, Away ${points.away}`;
    say(
      side
        ? `${sideName(side)} win the game. ${line}.`
        : `The game is level. ${line}.`,
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
    points[winner] += 1;
    const label = reason === "WINNER" ? "winner" : reason.toLowerCase();
    const tone = reason === "NET" || reason === "OUT" ? "foul" : "goal";
    if (gameWon(winner)) {
      recordParts([
        { text: sideName(winner), tone: winner },
        { text: " game", tone: "goal" },
        { text: `  ${points.home}-${points.away}`, tone: "neutral" },
      ]);
      beginFinale();
      return;
    }
    recordParts([
      { text: sideName(winner), tone: winner },
      { text: ` ${label}`, tone },
      { text: `  ${points.home}-${points.away}`, tone: "neutral" },
    ]);
    armBanner(label.replace(/\b\w/g, (letter) => letter.toUpperCase()), 12);
    const setting = points.home === 20 && points.away === 20;
    const gamePoint = wouldWin("home") || wouldWin("away");
    let line = `${sideName(winner)} ${label}. ${points.home}-${points.away}.`;
    if (setting) line = `Setting. Two clear. ${line}`;
    else if (gamePoint) line = `${line} Game point.`;
    say(line, winner, 16);
    server = winner;
    serveRight = points[server] % 2 === 0;
    phase = "between";
    pause = 14;
  };

  const arrive = () => {
    const kind = motion.kind;
    const hitterSide = motion.hitter.side;
    if (kind === "let") {
      motion = null;
      striker = null;
      recordParts([{ text: "Let", tone: "kick" }]);
      armBanner("Let", 12);
      say("Let. The serve is taken again.", "kick", 16);
      phase = "between";
      pause = 14;
      return;
    }
    if (kind === "net" || kind === "serve-net") {
      award(other(hitterSide), "NET");
      return;
    }
    if (kind === "out" || kind === "serve-out") {
      award(other(hitterSide), "OUT");
      return;
    }
    if (kind === "winner") {
      award(hitterSide, "WINNER");
      return;
    }
    scriptIndex += 1;
    ball.x = motion.to.x;
    ball.y = motion.to.y;
    if (scriptIndex >= script.length) {
      award(hitterSide, "WINNER");
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
    if (leaving && (ball.x <= 0.02 || ball.x >= 0.98 || ball.y <= 0.02 || ball.y >= 0.98)) {
      ball.x = clamp(ball.x, 0, 1);
      ball.y = clamp(ball.y, 0, 1);
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
        const late = motion.kind === "winner" || motion.kind === "smash";
        spend(player, late ? -0.08 : -0.05);
        const speed = motion.kind === "winner" ? 0.012 : motion.kind === "smash" ? 0.04 : 0.05;
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
    markPeriod("Game");
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
    pause = 16;
    striker = starter;
    armBanner("Serve", 16);
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
        home: points.home,
        away: points.away,
        time: clockText(),
        period: periodText(),
        note: banner,
        homePlayer: cardFor("home"),
        awayPlayer: cardFor("away"),
      };
    },
    title() {
      const note = banner ? `  ${banner}` : "";
      return `badminton  HOME ${points.home} - ${points.away} AWAY  ${clockText()}  ${periodText()}${note}`;
    },
    score() {
      return `HOME ${points.home} - ${points.away} AWAY`;
    },
    get done() {
      return done;
    },
    get holding() {
      return Boolean(finale);
    },
  };
}
