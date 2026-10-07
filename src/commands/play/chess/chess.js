import { analyze, evaluate } from "./engine.js";
import {
  START_FEN,
  glyph,
  inCheck,
  insufficient,
  isWhitePiece,
  legalMoves,
  make,
  matingMaterial,
  parseFen,
  pieceKind,
  posKey,
  toSan,
  toUci,
} from "./rules.js";

const FIRST = ["Lina", "Mateo", "Kenji", "Anika", "Ivo", "Rafael", "Noor", "Soren", "Eli", "Marco", "Jamal", "Theo", "Pavel", "Diego", "Hana", "Nico", "Omar", "Levi", "Iris", "Yuri"];
const LAST = ["Reyes", "Okonkwo", "Sato", "Brooks", "Ibarra", "Nash", "Duarte", "Keller", "Mendez", "Hale", "Lang", "Okafor", "Weiss", "Costa", "Abebe", "Novak", "Silva", "Kato", "Berg", "Quiroz"];
const STYLES = ["TACTICAL", "POSITIONAL", "AGGRESSIVE", "SOLID", "UNIVERSAL", "ENDGAME"];
const STYLE_LABEL = {
  TACTICAL: "Tactical",
  POSITIONAL: "Positional",
  AGGRESSIVE: "Aggressive",
  SOLID: "Solid",
  UNIVERSAL: "Universal",
  ENDGAME: "Endgame",
};
const TIME_STYLES = ["OPTIMIZER", "DEEP", "FAST", "TROUBLE"];
const FAMILIES = ["open", "sicilian", "french", "caro", "queen", "indian", "english", "flank", "gambit"];
const CONTROLS = [
  { name: "Bullet", label: "1+0", initial: 60, inc: 0, weight: 1 },
  { name: "Bullet", label: "2+1", initial: 120, inc: 1, weight: 1 },
  { name: "Blitz", label: "3+2", initial: 180, inc: 2, weight: 3 },
  { name: "Blitz", label: "5+0", initial: 300, inc: 0, weight: 3 },
  { name: "Rapid", label: "10+5", initial: 600, inc: 5, weight: 4 },
  { name: "Rapid", label: "15+10", initial: 900, inc: 10, weight: 2 },
  { name: "Classical", label: "30+0", initial: 1800, inc: 0, weight: 1 },
];
const LINES = [
  { name: "Ruy Lopez", family: "open", uci: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6"] },
  { name: "Italian Game", family: "open", uci: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "c2c3", "g8f6"] },
  { name: "Scotch Game", family: "open", uci: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4"] },
  { name: "Petrov Defense", family: "open", uci: ["e2e4", "e7e5", "g1f3", "g8f6", "f3e5", "d7d6"] },
  { name: "Philidor Defense", family: "open", uci: ["e2e4", "e7e5", "g1f3", "d7d6", "d2d4"] },
  { name: "Sicilian Defense", family: "sicilian", uci: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"] },
  { name: "Sicilian Dragon", family: "sicilian", uci: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "g7g6"] },
  { name: "French Defense", family: "french", uci: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3"] },
  { name: "Caro-Kann", family: "caro", uci: ["e2e4", "c7c6", "d2d4", "d7d5", "b1c3"] },
  { name: "Scandinavian Defense", family: "caro", uci: ["e2e4", "d7d5", "e4d5", "d8d5"] },
  { name: "Queen's Gambit", family: "queen", uci: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6"] },
  { name: "Slav Defense", family: "queen", uci: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3"] },
  { name: "King's Indian", family: "indian", uci: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4"] },
  { name: "Nimzo-Indian", family: "indian", uci: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"] },
  { name: "Queen's Indian", family: "indian", uci: ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "b7b6"] },
  { name: "English Opening", family: "english", uci: ["c2c4", "e7e5", "b1c3", "g8f6"] },
  { name: "Reti Opening", family: "flank", uci: ["g1f3", "d7d5", "c2c4"] },
  { name: "Vienna Game", family: "open", uci: ["e2e4", "e7e5", "b1c3", "g8f6"] },
  { name: "King's Gambit", family: "gambit", uci: ["e2e4", "e7e5", "f2f4", "e5f4"] },
  { name: "Pirc Defense", family: "flank", uci: ["e2e4", "d7d6", "d2d4", "g8f6", "b1c3", "g7g6"] },
];
const REASON = {
  CHECKMATE: "Checkmate",
  RESIGNATION: "Resignation",
  TIMEOUT: "Timeout",
  STALEMATE: "Stalemate",
  REPETITION: "Threefold",
  FIFTY: "50-move",
  MATERIAL: "Insufficient material",
  AGREEMENT: "Agreement",
  ADJUDICATION: "Adjudication",
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function createRng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng, entries) {
  let total = 0;
  entries.forEach((entry) => {
    total += entry.weight;
  });
  let roll = rng() * total;
  for (let i = 0; i < entries.length; i += 1) {
    roll -= entries[i].weight;
    if (roll <= 0) return entries[i];
  }
  return entries[entries.length - 1];
}

function clockText(seconds) {
  const left = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(left / 60);
  const remain = left % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function evalText(centipawns) {
  if (Math.abs(centipawns) > 9000) {
    const mate = Math.max(1, Math.round((20000 - Math.abs(centipawns)) / 2));
    return `${centipawns > 0 ? "+" : "-"}M${mate}`;
  }
  const pawns = centipawns / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(1)}`;
}

function classify(loss) {
  if (loss < 15) return "best";
  if (loss < 45) return "excellent";
  if (loss < 90) return "good";
  if (loss < 160) return "inaccuracy";
  if (loss < 320) return "mistake";
  return "blunder";
}

function phaseOf(pos) {
  let queens = 0;
  let officers = 0;
  for (let sq = 0; sq < 120; sq += 1) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const kind = pieceKind(pos.board[sq]);
    if (!kind || kind === 1 || kind === 6) continue;
    officers += 1;
    if (kind === 5) queens += 1;
  }
  if (pos.full <= 10 && officers >= 10) return "Opening";
  if (!queens && officers <= 4) return "Endgame";
  if (officers <= 8) return "Late Middlegame";
  return "Middlegame";
}

export function createChess(seed = Math.floor(Math.random() * 0xffffffff)) {
  const rng = createRng(seed);
  const control = pickWeighted(rng, CONTROLS);
  const pos = parseFen(START_FEN);
  const white = createPlayer(rng, "w");
  const black = createPlayer(rng, "b");
  white.clock = control.initial;
  black.clock = control.initial;
  let log = [];
  let voice = { text: "", tone: "neutral" };
  let banner = "";
  let phase = "ready";
  let pending = null;
  let thinkLeft = 0;
  let result = null;
  let evalNow = 0;
  let phaseName = "Opening";
  let opening = "";
  let leftBook = false;
  let history = [];
  const seen = new Map([[posKey(pos), 1]]);
  const sans = [];
  let lastFrom = -1;
  let lastTo = -1;
  let glide = null;
  let scrambleNoted = false;
  let stamp = "";
  const FAMILY_LABEL = {
    open: "Open Game",
    sicilian: "Sicilian Defense",
    french: "French Defense",
    caro: "Caro-Kann Defense",
    queen: "Queen's Pawn",
    indian: "Indian Defense",
    english: "English Opening",
    flank: "Flank Opening",
    gambit: "King's Gambit",
  };

  function createPlayer(random, side) {
    const band = pickWeighted(random, [
      { weight: 1, lo: 900, hi: 1150 },
      { weight: 3, lo: 1150, hi: 1500 },
      { weight: 4, lo: 1500, hi: 1850 },
      { weight: 2, lo: 1850, hi: 2150 },
      { weight: 1, lo: 2150, hi: 2450 },
    ]);
    const rating = band.lo + Math.floor(random() * (band.hi - band.lo));
    const base = clamp((rating - 700) / 16, 12, 96);
    const skill = (spread) => clamp(Math.round(base + (random() - 0.5) * spread), 8, 99);
    const style = STYLES[Math.floor(random() * STYLES.length)];
    const book = {};
    FAMILIES.forEach((family) => {
      book[family] = clamp(Math.round(skill(28) + (random() - 0.45) * 30), 15, 98);
    });
    const first = FIRST[Math.floor(random() * FIRST.length)];
    const last = LAST[Math.floor(random() * LAST.length)];
    return {
      side,
      first,
      last,
      name: `${first} ${last}`,
      rating,
      style,
      styleLabel: STYLE_LABEL[style],
      timeStyle: TIME_STYLES[Math.floor(random() * TIME_STYLES.length)],
      opening: skill(18),
      tactical: clamp(skill(style === "TACTICAL" ? 12 : 22) + (style === "TACTICAL" ? 6 : 0), 8, 99),
      calculation: skill(style === "UNIVERSAL" ? 14 : 20),
      positional: clamp(skill(style === "POSITIONAL" ? 12 : 22) + (style === "POSITIONAL" ? 6 : 0), 8, 99),
      endgame: clamp(skill(style === "ENDGAME" ? 10 : 24) + (style === "ENDGAME" ? 8 : 0), 8, 99),
      defense: skill(style === "SOLID" ? 12 : 20),
      attack: clamp(skill(style === "AGGRESSIVE" ? 12 : 20) + (style === "AGGRESSIVE" ? 6 : 0), 8, 99),
      time: skill(20),
      risk: clamp(Math.round(35 + (style === "AGGRESSIVE" ? 25 : 0) + (style === "SOLID" ? -18 : 0) + (random() - 0.5) * 30), 8, 92),
      consistency: skill(16),
      adaptation: skill(18),
      book,
      clock: 0,
      confidence: 58,
      tilt: 0,
      fatigue: 0,
      checks: 0,
      moves: 0,
      lossSum: 0,
      blunders: 0,
      mistakes: 0,
      inaccuracies: 0,
    };
  }

  function playerToMove() {
    return pos.side === "w" ? white : black;
  }

  function other(player) {
    return player === white ? black : white;
  }

  function toneOf(player) {
    return player.side === "w" ? "home" : "away";
  }

  function push(callTone, parts) {
    log.push({ time: stamp || clockText(playerToMove().clock), parts });
    voice = { text: parts.map((part) => part.text).join(""), tone: callTone };
  }

  function line(callTone, ...bits) {
    const parts = bits.map((bit) => (
      Array.isArray(bit) ? { text: bit[0], tone: bit[1] } : { text: String(bit), tone: "neutral" }
    ));
    push(callTone, parts);
  }

  function divider(text) {
    log.push({ divider: text });
  }

  function matchingLines() {
    return LINES.filter((row) => {
      if (history.length > row.uci.length) return false;
      for (let i = 0; i < history.length; i += 1) {
        if (history[i] !== row.uci[i]) return false;
      }
      return history.length < row.uci.length;
    });
  }

  function refreshOpening(lines) {
    if (!history.length || !lines.length) return;
    const names = new Set(lines.map((row) => row.name));
    if (names.size === 1) {
      opening = lines[0].name;
      return;
    }
    const families = new Set(lines.map((row) => row.family));
    if (families.size === 1 && history.length >= 2) opening = FAMILY_LABEL[lines[0].family] || opening;
  }

  function bookOptions() {
    const lines = matchingLines();
    refreshOpening(lines);
    const options = new Map();
    const player = playerToMove();
    lines.forEach((row) => {
      const next = row.uci[history.length];
      const know = player.book[row.family] || 40;
      options.set(next, (options.get(next) || 0) + know);
    });
    return [...options.entries()].map(([uci, weight]) => ({ uci, weight }));
  }

  function thinkSeconds(player, complexity, critical, book) {
    if (book) return 0.5 + rng() * (player.timeStyle === "DEEP" ? 3.2 : 1.6);
    const scale = control.initial >= 900 ? 2.1 : control.initial >= 300 ? 1 : control.initial >= 120 ? 0.62 : 0.4;
    let seconds = (0.7 + complexity * 0.32) * scale;
    if (player.timeStyle === "DEEP") seconds *= 1.45;
    if (player.timeStyle === "FAST") seconds *= 0.55;
    if (player.timeStyle === "OPTIMIZER") seconds *= 0.82;
    if (player.timeStyle === "TROUBLE") seconds *= player.clock < control.initial * 0.3 ? 1.45 : 1.12;
    seconds *= 1.15 - player.time / 220;
    if (critical) seconds *= 1.4;
    if (player.clock < 10) seconds = Math.min(seconds, 0.45 + rng() * 0.35);
    else if (player.clock < 30) seconds *= 0.62;
    const cap = Math.max(0.35, player.clock * (player.timeStyle === "DEEP" ? 0.2 : 0.12));
    seconds = clamp(seconds, 0.25, cap);
    if (player.clock <= 8) seconds = Math.min(seconds, Math.max(0.12, player.clock * 0.4));
    if (seconds > player.clock * 0.92) seconds = Math.max(0.12, player.clock * 0.45);
    return seconds;
  }

  function styleBias(player, move) {
    let bias = 0;
    const kind = pieceKind(move.piece);
    const enemyKing = pos.side === "w" ? pos.kingB : pos.kingW;
    const dist = (sq) => Math.max(Math.abs((sq & 7) - (enemyKing & 7)), Math.abs((sq >> 4) - (enemyKing >> 4)));
    if (player.style === "AGGRESSIVE" || player.attack > player.defense + 8) {
      if (dist(move.to) < dist(move.from)) bias += 10 + player.risk / 12;
      if (move.captured) bias += 16;
    }
    if (player.style === "SOLID") {
      if (move.captured && pieceKind(move.captured) >= kind) bias += 18;
      if (!move.captured && kind === 5 && phaseName === "Opening") bias -= 24;
      bias -= player.risk > 60 ? 0 : 8;
    }
    if (player.style === "POSITIONAL" || player.positional > 70 || phaseName === "Opening") {
      if (kind === 2 || kind === 3) bias += phaseName === "Opening" ? 10 : 6;
      if (kind === 5 && !move.captured) bias -= phaseName === "Opening" ? 26 : 8;
    }
    if (kind === 2 && phaseName === "Opening" && (move.to === 32 || move.to === 39 || move.to === 80 || move.to === 87)) {
      bias -= 30;
    }
    if (player.style === "TACTICAL" && (move.captured || move.promo)) bias += 22;
    if (phaseName === "Endgame" && kind === 1) bias += player.endgame / 7;
    if (phaseName === "Endgame" && kind === 6) bias += player.endgame / 10;
    if (player.risk < 35 && move.captured && VAL(move.piece) > VAL(move.captured) + 80) bias -= 40;
    if (player.risk > 70 && move.captured && VAL(move.piece) > VAL(move.captured) + 80) bias += 28;
    const foe = other(player);
    if (foe.checks >= 2 && player.adaptation > 48 && move.captured) bias += 12 + player.adaptation / 12;
    return bias;
  }

  function VAL(piece) {
    return [0, 100, 320, 330, 500, 900, 20000][pieceKind(piece)] || 0;
  }

  function blunderChance(player, complexity) {
    const ratingTerm = clamp((1900 - player.rating) / 2200, 0, 0.7);
    const time = player.clock < 10 ? 0.09 : player.clock < 25 ? 0.035 : 0;
    const messy = complexity > 7 ? 0.025 : 0;
    return clamp(0.004 + ratingTerm * 0.07 + time + messy + player.tilt / 500 + player.fatigue / 800 - player.consistency / 2500, 0.002, 0.28);
  }

  function selectMove() {
    const player = playerToMove();
    const moves = legalMoves(pos);
    const book = bookOptions();
    const captures = moves.filter((move) => move.captured).length;
    const complexity = moves.length / 5 + captures * 0.85 + (inCheck(pos) ? 2.4 : 0);
    if (book.length) {
      const bestKnow = Math.max(...book.map((row) => row.weight));
      const familiarity = clamp(bestKnow / 90, 0.35, 1);
      const stay = familiarity * clamp(0.55 + player.opening / 200, 0.4, 0.93);
      if (rng() < stay) {
        const chosen = pickWeighted(rng, book);
        const move = moves.find((row) => toUci(row) === chosen.uci);
        if (move) {
          return {
            move,
            book: true,
            loss: 0,
            critical: false,
            seconds: thinkSeconds(player, complexity, false, true),
          };
        }
      } else if (!leftBook && history.length > 1) {
        leftBook = true;
        banner = "Out of book";
      }
    }
    let depth = 3;
    if (player.clock < 8) depth = 1;
    else if (player.clock < 20) depth = 2;
    let candidates = player.calculation > 75 || player.timeStyle === "DEEP" ? 10 : 8;
    if (player.timeStyle === "FAST") candidates = Math.max(6, candidates - 2);
    if (player.clock < 12) candidates = Math.min(candidates, 5);
    const cap = depth >= 3 ? 12000 : 6000;
    const scored = analyze(pos, depth, candidates, cap);
    if (!scored.length) return { none: true };
    const ranked = scored.some((row) => row.searched) ? scored.filter((row) => row.searched) : scored;
    const engineBest = ranked[0].score;
    const critical = ranked.length > 1 && engineBest - ranked[1].score > 140;
    const noise = clamp((2000 - player.rating) / 28, 4, 36) * (1 + player.tilt / 160) * (player.clock < 12 ? 1.35 : 1);
    ranked.forEach((row) => {
      row.rank = row.score + styleBias(player, row.move) + (rng() - 0.5) * noise * 2;
    });
    let chosen = ranked[0];
    let picked = false;
    if (engineBest > 9000) {
      const see = 0.2 + (player.tactical / 100) * (player.calculation / 100) * 0.75;
      if (rng() < see) {
        chosen = ranked[0];
        picked = true;
      } else {
        ranked.forEach((row) => {
          if (row.score > 9000) row.rank = 30 + rng() * 40;
        });
      }
    }
    if (!picked && rng() < blunderChance(player, complexity) && ranked.length > 2) {
      const pool = ranked.filter((row) => row.score < engineBest - 70);
      const bag = pool.length ? pool : ranked.slice(Math.ceil(ranked.length / 2));
      chosen = bag[Math.floor(rng() * bag.length)];
      picked = true;
    }
    if (!picked) {
      const temp = clamp(16 + (2200 - player.rating) / 22 + (player.clock < 12 ? 28 : 0) + player.tilt * 0.25, 14, 80);
      const max = Math.max(...ranked.map((row) => row.rank));
      let total = 0;
      const weights = ranked.map((row) => {
        const weight = Math.exp(clamp(row.rank - max, -800, 0) / temp);
        total += weight;
        return weight;
      });
      let roll = rng() * total;
      for (let i = 0; i < ranked.length; i += 1) {
        roll -= weights[i];
        if (roll <= 0) {
          chosen = ranked[i];
          break;
        }
      }
    }
    const loss = Math.max(0, engineBest - chosen.score);
    if (history.length > 18 && engineBest < -550 && engineBest > -15000) {
      const pride = clamp((player.rating - 900) / 1400, 0.15, 1);
      const chance = clamp(((-engineBest - 400) / 1600) * pride * (1.1 - player.risk / 160), 0, 0.4);
      if (rng() < chance) {
        return { resign: true, seconds: thinkSeconds(player, complexity, true, false) };
      }
    }
    return {
      move: chosen.move,
      book: false,
      loss,
      critical,
      seconds: thinkSeconds(player, complexity, critical, false),
    };
  }

  function finish(reason, winner) {
    phase = "over";
    pending = null;
    result = {
      reason,
      winner: winner ? winner.last : "",
      winnerSide: winner ? winner.side : "",
    };
    banner = "";
    divider(REASON[reason] || reason);
    const whiteAcc = accuracy(white);
    const blackAcc = accuracy(black);
    const score = winner === white ? "1-0" : winner === black ? "0-1" : "1/2-1/2";
    line("goal", [score, "goal"], "  ", REASON[reason] || reason);
    line("neutral", `Accuracy ${whiteAcc}% / ${blackAcc}%`);
    line("neutral", `Blunders ${white.blunders} / ${black.blunders}`);
    if (opening) line("neutral", opening);
    line("neutral", factor(reason, winner));
    voice = {
      text: winner ? `${winner.name} wins` : "Draw",
      tone: winner ? toneOf(winner) : "goal",
    };
  }

  function accuracy(player) {
    if (!player.moves) return 100;
    return clamp(Math.round(104 - player.lossSum / player.moves / 2.1), 20, 100);
  }

  function factor(reason, winner) {
    if (reason === "TIMEOUT") return "The clock decided a position that was still alive.";
    if (reason === "STALEMATE" || reason === "REPETITION" || reason === "FIFTY" || reason === "MATERIAL" || reason === "AGREEMENT") {
      return "Neither side could turn the position into a win.";
    }
    if (!winner) return "The position was split down the middle.";
    const loser = other(winner);
    if (loser.blunders > winner.blunders) return `${winner.last} converted the extra mistakes.`;
    if (winner.endgame > loser.endgame + 12 && phaseName === "Endgame") return `${winner.last} handled the ending more cleanly.`;
    if (winner.tactical > loser.tactical + 10) return `${winner.last}'s calculation carried the tactical positions.`;
    return `${winner.last} kept the better position through the game.`;
  }

  function flag(player) {
    player.clock = 0;
    const opp = other(player);
    if (!matingMaterial(pos, opp.side === "w")) finish("TIMEOUT", null);
    else finish("TIMEOUT", opp);
  }

  function remember() {
    const key = posKey(pos);
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    return count;
  }

  function recordQuality(player, loss, book) {
    player.moves += 1;
    if (book) return;
    player.lossSum += loss;
    if (loss >= 320) {
      player.blunders += 1;
      player.confidence = clamp(player.confidence - 9, 0, 100);
      player.tilt = clamp(player.tilt + 16, 0, 100);
    } else if (loss >= 160) {
      player.mistakes += 1;
      player.confidence = clamp(player.confidence - 4, 0, 100);
      player.tilt = clamp(player.tilt + 7, 0, 100);
    } else if (loss >= 90) {
      player.inaccuracies += 1;
      player.tilt = clamp(player.tilt + 2, 0, 100);
    } else player.confidence = clamp(player.confidence + 2, 0, 100);
    player.tilt = clamp(player.tilt - 1.5, 0, 100);
  }

  function commit() {
    const player = playerToMove();
    const plan = pending;
    pending = null;
    if (player.clock <= 0) {
      flag(player);
      return;
    }
    player.clock += control.inc;
    if (plan.resign) {
      finish("RESIGNATION", other(player));
      return;
    }
    stamp = clockText(player.clock);
    const moverWhite = player.side === "w";
    const travel = glyph(plan.move.piece);
    const land = glyph(plan.move.promo || plan.move.piece);
    const capturedGlyph = plan.move.captured ? glyph(plan.move.captured) : "";
    const capturedSq = plan.move.captured
      ? plan.move.to + (plan.move.flag === 1 ? (moverWhite ? -16 : 16) : 0)
      : -1;
    const rook = plan.move.flag === 2 ? {
      from: plan.move.to > plan.move.from ? plan.move.from + 3 : plan.move.from - 4,
      to: plan.move.to > plan.move.from ? plan.move.from + 1 : plan.move.from - 1,
      glyph: glyph(moverWhite ? 4 : 12),
    } : null;
    const san = toSan(pos, plan.move);
    const uci = toUci(plan.move);
    const checkedBefore = inCheck(pos);
    make(pos, plan.move);
    history.push(uci);
    sans.push(san);
    lastFrom = plan.move.from;
    lastTo = plan.move.to;
    glide = {
      id: history.length,
      from: plan.move.from,
      to: plan.move.to,
      travel,
      land,
      white: moverWhite,
      capturedGlyph,
      capturedSq,
      rook,
    };
    evalNow = evaluate(pos);
    const mark = plan.book ? "" : plan.loss >= 320 ? " ??" : plan.loss >= 160 ? " ?" : plan.loss >= 90 ? " ?!" : plan.critical && plan.loss < 20 ? " !" : "";
    const number = pos.side === "b" ? `${pos.full}.` : `${pos.full - 1}...`;
    const tone = toneOf(player);
    const call = plan.loss >= 320 ? "foul" : san.includes("#") ? "goal" : tone;
    const sanTone = plan.loss >= 320 ? "foul" : san.includes("#") ? "goal" : plan.critical && plan.loss < 20 ? "kick" : tone;
    line(call, [player.last, tone], " ", [`${number} ${san}${mark}`, sanTone]);
    if (san.includes("#")) voice = { text: "Checkmate", tone: "goal" };
    else if (plan.loss >= 320) voice = { text: `${player.last} blunders`, tone: "foul" };
    else if (san.includes("+")) voice = { text: `${player.last} gives check`, tone };
    else if (plan.move.flag === 2) voice = { text: `${player.last} castles`, tone };
    else if (plan.move.promo) voice = { text: `${player.last} promotes`, tone: "kick" };
    else voice = { text: `${player.last} plays ${san}`, tone };
    stamp = "";
    recordQuality(player, plan.loss, plan.book);
    if (san.includes("+") || san.includes("#")) player.checks += 1;
    player.fatigue = clamp(player.fatigue + 0.4 + (player.clock < 20 ? 0.6 : 0), 0, 40);
    const nextPhase = phaseOf(pos);
    if (nextPhase !== phaseName) {
      phaseName = nextPhase;
      divider(phaseName);
    }
    if (!scrambleNoted && playerToMove().clock < 10 && phase === "think") {
      scrambleNoted = true;
      banner = "Time scramble";
    } else if (san.includes("+")) banner = "Check";
    else if (banner === "Check") banner = "";
    const reps = remember();
    const mate = san.includes("#");
    const quiet = legalMoves(pos).length === 0;
    if (mate || (quiet && inCheck(pos))) {
      finish("CHECKMATE", player);
      return;
    }
    if (quiet) {
      finish("STALEMATE", null);
      return;
    }
    if (insufficient(pos)) {
      finish("MATERIAL", null);
      return;
    }
    if (pos.half >= 100) {
      finish("FIFTY", null);
      return;
    }
    if (reps >= 3) {
      finish("REPETITION", null);
      return;
    }
    if (history.length > 24 && Math.abs(evalNow) < 35 && phaseName === "Endgame" && white.risk < 48 && black.risk < 48 && rng() < 0.07) {
      finish("AGREEMENT", null);
      return;
    }
    if (history.length >= 160) {
      if (Math.abs(evalNow) < 80) finish("ADJUDICATION", null);
      else finish("ADJUDICATION", evalNow > 0 ? white : black);
      return;
    }
    if (checkedBefore && plan.loss < 40) player.confidence = clamp(player.confidence + 1, 0, 100);
    beginThink();
  }

  function beginThink() {
    if (phase === "over") return;
    const player = playerToMove();
    if (player.clock <= 0) {
      flag(player);
      return;
    }
    if (!scrambleNoted && player.clock < 10) {
      scrambleNoted = true;
      banner = "Time scramble";
      divider("Time scramble");
    }
    const plan = selectMove();
    if (plan.none) {
      if (inCheck(pos)) finish("CHECKMATE", other(player));
      else finish("STALEMATE", null);
      return;
    }
    const floor = player.clock < 10 ? 9 : 16;
    const cap = player.clock < 10 ? 18 : 34;
    const ticks = clamp(Math.round(floor + plan.seconds * 0.55), floor, cap);
    pending = plan;
    pending.ticks = ticks;
    thinkLeft = ticks;
    phase = "think";
  }

  function beginMatch() {
    divider(`${control.name} ${control.label}`);
    line("home", [white.name, "home"], "  ", [String(white.rating), "neutral"], "  ", white.styleLabel);
    line("away", [black.name, "away"], "  ", [String(black.rating), "neutral"], "  ", black.styleLabel);
    voice = { text: `${white.last} has white`, tone: "home" };
    beginThink();
  }

  return {
    reset() {},
    step() {
      if (result) return;
      if (phase === "ready") {
        beginMatch();
        return;
      }
      if (phase !== "think" || !pending) return;
      const player = playerToMove();
      player.clock -= pending.seconds / pending.ticks;
      thinkLeft -= 1;
      if (player.clock <= 0) {
        flag(player);
        return;
      }
      if (thinkLeft <= 0) commit();
    },
    present() {},
    feed() {
      return log;
    },
    commentary() {
      return { text: voice.text, tone: voice.tone };
    },
    motion() {
      return glide;
    },
    board() {
      const squares = [];
      for (let rank = 7; rank >= 0; rank -= 1) {
        for (let file = 0; file < 8; file += 1) {
          const sq = rank * 16 + file;
          const piece = pos.board[sq];
          squares.push({
            glyph: glyph(piece),
            white: piece ? isWhitePiece(piece) : false,
            last: sq === lastFrom || sq === lastTo,
            check: inCheck(pos) && sq === (pos.side === "w" ? pos.kingW : pos.kingB),
          });
        }
      }
      return { squares, turn: pos.side };
    },
    hud() {
      const card = (player) => ({
        name: player.name,
        role: `${player.rating} · ${player.styleLabel}\n${clockText(player.clock)}`,
        stamina: clamp((player.clock / control.initial) * 100, 0, 100),
        turn: player.side === pos.side && !result,
      });
      return {
        home: white.rating,
        away: black.rating,
        homeName: white.last,
        awayName: black.last,
        time: clockText(playerToMove().clock),
        period: result ? (REASON[result.reason] || result.reason) : `${control.label} · ${phaseName}`,
        note: banner,
        homePlayer: card(white),
        awayPlayer: card(black),
        eval: evalText(evalNow),
      };
    },
    title() {
      return `chess  ${white.last} vs ${black.last}`;
    },
    score() {
      if (!result) return `${white.last} vs ${black.last}`;
      const score = result.winnerSide === "w" ? "1-0" : result.winnerSide === "b" ? "0-1" : "1/2-1/2";
      const who = result.winner ? `${result.winner} ` : "";
      return `${who}${score} · ${REASON[result.reason]} · ${opening || "Unnamed"} · ${accuracy(white)}%/${accuracy(black)}%`;
    },
    pgn() {
      const lines = [
        `[White "${white.name}"]`,
        `[Black "${black.name}"]`,
        `[WhiteElo "${white.rating}"]`,
        `[BlackElo "${black.rating}"]`,
        `[TimeControl "${control.initial}+${control.inc}"]`,
        `[Opening "${opening || "?"}"]`,
      ];
      let moves = "";
      sans.forEach((san, index) => {
        if (index % 2 === 0) moves += `${index / 2 + 1}. `;
        moves += `${san} `;
      });
      const token = !result ? "*" : result.winnerSide === "w" ? "1-0" : result.winnerSide === "b" ? "0-1" : "1/2-1/2";
      return `${lines.join(" ")}\n${moves}${token}`;
    },
    get done() {
      return false;
    },
    get holding() {
      return phase === "over";
    },
  };
}
