const RING_M = 20;
const GAP_M = 1.15;
const SKY_M = 11;

const FIGHT = {
  rounds: 12,
  roundDuration: 180,
  restTicks: 16,
  ticks: 84,
  ringSize: 20,
  ruleset: "PRO_BOXING",
};

const STYLES = ["OUTBOX", "PRESSURE", "COUNTER", "SWARMER", "POWER", "BOXER_PUNCHER"];
const STYLE_LABEL = {
  OUTBOX: "Out Boxer",
  PRESSURE: "Pressure",
  COUNTER: "Counter",
  SWARMER: "Swarmer",
  POWER: "Power",
  BOXER_PUNCHER: "Boxer Puncher",
};
const BASE_MODE = {
  OUTBOX: "OUTBOX",
  PRESSURE: "PRESSURE",
  COUNTER: "COUNTER",
  SWARMER: "PRESSURE",
  POWER: "HEAD_HUNT",
  BOXER_PUNCHER: "BALANCED",
};
const WANT = {
  OUTBOX: 0.3,
  DEFENSIVE: 0.28,
  COUNTER: 0.2,
  BALANCED: 0.2,
  PRESSURE: 0.12,
  AGGRESSIVE: 0.14,
  HEAD_HUNT: 0.16,
  BODY_ATTACK: 0.15,
};
const DELTA = {
  OUTBOX: { jab: 18, footwork: 16, slip: 12, discipline: 10, power: -8, aggression: -16, volume: -6, hook: -4 },
  PRESSURE: { aggression: 20, volume: 14, cardio: 10, body: 8, power: 6, slip: -4, discipline: -4 },
  COUNTER: { timing: 16, accuracy: 12, anticipation: 14, parry: 12, volume: -16, aggression: -12, power: 6, iq: 10 },
  SWARMER: { hook: 14, uppercut: 10, volume: 16, aggression: 14, body: 8, footwork: -6, jab: -8, reach: -8 },
  POWER: { power: 20, cross: 8, volume: -12, cardio: -8, speed: -4, footwork: -6 },
  BOXER_PUNCHER: { jab: 6, cross: 8, hook: 6, footwork: 4, power: 6, accuracy: 4, aggression: 4 },
};
const PUNCH = {
  JAB: { target: "HEAD", ranges: ["LONG", "MID"], power: 0.42, risk: 0.15, cost: 0.45, speed: 0.9 },
  CROSS: { target: "HEAD", ranges: ["MID", "CLOSE"], power: 0.86, risk: 0.35, cost: 0.85, speed: 0.72 },
  HOOK: { target: "HEAD", ranges: ["CLOSE", "MID"], power: 0.9, risk: 0.4, cost: 0.9, speed: 0.66 },
  UPPERCUT: { target: "HEAD", ranges: ["CLOSE", "CLINCH"], power: 0.96, risk: 0.5, cost: 1, speed: 0.6 },
  OVERHAND: { target: "HEAD", ranges: ["MID"], power: 1.05, risk: 0.55, cost: 1.15, speed: 0.52 },
  BODY: { target: "BODY", ranges: ["MID", "CLOSE", "CLINCH"], power: 0.72, risk: 0.28, cost: 0.8, speed: 0.68 },
  FEINT: { target: "NONE", ranges: ["LONG", "MID", "CLOSE", "CLINCH"], power: 0, risk: 0.08, cost: 0.18, speed: 0.8 },
};
const PUNCH_NAME = {
  JAB: "jab",
  CROSS: "cross",
  HOOK: "hook",
  UPPERCUT: "uppercut",
  OVERHAND: "overhand",
  BODY: "body shot",
  FEINT: "feint",
};
const JUDGES = [
  { name: "Martinez", clean: 1.15, agg: 0.82, def: 1, ring: 0.9 },
  { name: "Cole", clean: 0.88, agg: 1.22, def: 0.86, ring: 0.95 },
  { name: "Abe", clean: 0.96, agg: 0.9, def: 1.02, ring: 1.24 },
];
const LABEL = {
  UNANIMOUS_DECISION: "Unanimous Decision",
  MAJORITY_DECISION: "Majority Decision",
  SPLIT_DECISION: "Split Decision",
  DRAW: "Draw",
  MAJORITY_DRAW: "Majority Draw",
  SPLIT_DRAW: "Split Draw",
  KO: "KO",
  TKO: "TKO",
  DQ: "DQ",
  RTD: "RTD",
};
const FIRST = ["Luis", "Mateo", "Kenji", "Andre", "Ivo", "Rafael", "Noah", "Soren", "Eli", "Marco", "Jamal", "Theo", "Pavel", "Diego", "Harun", "Nico", "Omar", "Levi"];
const LAST = ["Reyes", "Okonkwo", "Sato", "Brooks", "Ibarra", "Nash", "Duarte", "Keller", "Mendez", "Hale", "Lang", "Okafor", "Weiss", "Costa", "Abebe", "Novak", "Silva", "Kato", "Berg", "Quiroz"];
const WEIGHTS = ["Flyweight", "Bantamweight", "Featherweight", "Lightweight", "Welterweight", "Middleweight", "Light Heavyweight", "Heavyweight"];
const REFS = ["Hale", "Costa", "Abebe", "Novak", "Berg"];

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

function pickWeighted(rng, table) {
  const entries = Object.entries(table).filter(([, weight]) => weight > 0);
  let total = 0;
  entries.forEach(([, weight]) => {
    total += weight;
  });
  if (!total || !entries.length) return "JAB";
  let roll = rng() * total;
  for (let index = 0; index < entries.length; index += 1) {
    roll -= entries[index][1];
    if (roll <= 0) return entries[index][0];
  }
  return entries[entries.length - 1][0];
}

export function createBoxing(seed = Math.floor(Math.random() * 0xffffffff)) {
  const rng = createRng(seed);
  let cols = 0;
  let rows = 0;
  let cells = [];
  let log = [];
  let voice = { text: "", tone: "neutral" };
  let banner = "";
  let bannerLeft = 0;
  let phase = "ready";
  let round = 0;
  let tickInRound = 0;
  let bellLeft = 0;
  let restLeft = 0;
  let clinchLeft = 0;
  let count = null;
  let spark = null;
  let result = null;
  let pinnedTime = "";
  let weight = "Welterweight";
  let refName = "Hale";
  let live = false;
  let book = blankBook();
  let home = null;
  let away = null;
  let referee = { x: 0.5, y: 0.62, px: 0.5, py: 0.62 };
  const cards = JUDGES.map((judge) => ({ name: judge.name, home: 0, away: 0, rounds: [] }));

  function blankBook() {
    const empty = () => ({
      clean: 0, agg: 0, def: 0, ring: 0, kd: 0, jabs: 0, body: 0, power: 0, counters: 0,
    });
    return { home: empty(), away: empty() };
  }

  function other(fighter) {
    return fighter === home ? away : home;
  }

  function toneOf(fighter) {
    return fighter.side === "home" ? "home" : "away";
  }

  function logTime() {
    if (pinnedTime) return pinnedTime;
    if (phase === "ready" || phase === "rest" || phase === "finale") return "0:00";
    const elapsed = Math.min(FIGHT.roundDuration, Math.floor((tickInRound / FIGHT.ticks) * FIGHT.roundDuration));
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function clockText() {
    if (phase === "count" && count) return String(count.number);
    if (phase === "rest") {
      const left = Math.max(0, Math.ceil((restLeft / FIGHT.restTicks) * 60));
      return `0:${String(left).padStart(2, "0")}`;
    }
    if (phase === "finale" || phase === "ready") return "3:00";
    const elapsed = Math.min(FIGHT.roundDuration, Math.floor((tickInRound / FIGHT.ticks) * FIGHT.roundDuration));
    const left = FIGHT.roundDuration - elapsed;
    const minutes = Math.floor(left / 60);
    const seconds = left % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function periodText() {
    if (result) return LABEL[result.method] || result.method;
    if (phase === "rest") return "Rest";
    if (phase === "count") return "Knockdown";
    if (phase === "ready" || round === 0) return weight;
    return `Round ${round}`;
  }

  function push(callTone, parts) {
    log.push({ time: logTime(), parts });
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

  function arm(text, ticks) {
    banner = text;
    bannerLeft = ticks;
  }

  function stat(base, delta) {
    return clamp(Math.round((base || 70) + (delta || 0) + (rng() * 16 - 8)), 38, 99);
  }

  function makeFighter(side, taken) {
    const style = STYLES[Math.floor(rng() * STYLES.length)];
    const shift = DELTA[style];
    let last = LAST[Math.floor(rng() * LAST.length)];
    while (taken.has(last)) last = LAST[Math.floor(rng() * LAST.length)];
    taken.add(last);
    const first = FIRST[Math.floor(rng() * FIRST.length)];
    const stanceRoll = rng();
    const stance = stanceRoll < 0.46 ? "ORTHODOX" : stanceRoll < 0.86 ? "SOUTHPAW" : "SWITCH";
    const age = 22 + Math.floor(rng() * 15);
    const fighter = {
      side,
      name: `${first[0]}. ${last}`,
      last,
      style,
      stance,
      styleLabel: STYLE_LABEL[style],
      stanceLabel: stance === "ORTHODOX" ? "Orthodox" : stance === "SOUTHPAW" ? "Southpaw" : "Switch",
      jab: stat(70, shift.jab),
      cross: stat(70, shift.cross),
      hook: stat(68, shift.hook),
      uppercut: stat(64, shift.uppercut),
      body: stat(66, shift.body),
      power: stat(70, shift.power),
      accuracy: stat(70, shift.accuracy),
      speed: stat(70, shift.speed - Math.max(0, age - 32)),
      volume: stat(66, shift.volume),
      guard: stat(70, shift.guard),
      parry: stat(64, shift.parry),
      slip: stat(66, shift.slip),
      footwork: stat(68, shift.footwork),
      reaction: stat(70, shift.reaction - Math.max(0, age - 33)),
      anticipation: stat(66, shift.anticipation),
      timing: stat(68, shift.timing + Math.max(0, age - 28) * 0.4),
      iq: stat(70, shift.iq + Math.max(0, age - 28) * 0.5),
      composure: stat(70, shift.composure),
      aggression: stat(62, shift.aggression),
      discipline: stat(70, shift.discipline),
      adaptability: stat(68, shift.adaptability),
      risk: stat(56, shift.risk),
      chin: stat(72, shift.chin),
      bodyDurability: stat(70, 0),
      recovery: stat(68, -Math.max(0, age - 30) * 1.1),
      cutResist: stat(70, 0),
      swellResist: stat(70, 0),
      kdRecovery: stat(68, 0),
      cardio: stat(74, shift.cardio - Math.max(0, age - 31)),
      reach: stat(70, shift.reach),
      age,
      confidence: stat(70, 0),
      x: side === "home" ? 0.24 : 0.76,
      y: side === "home" ? 0.76 : 0.24,
      px: side === "home" ? 0.24 : 0.76,
      py: side === "home" ? 0.76 : 0.24,
      stamina: 100,
      head: 0,
      bodyDmg: 0,
      balance: 100,
      swell: 0,
      cut: 0,
      cutWhere: "",
      swellNote: 0,
      guardState: "HIGH",
      mode: BASE_MODE[style],
      baseMode: BASE_MODE[style],
      circle: rng() < 0.5 ? 1 : -1,
      comboLen: 0,
      nextPunch: "",
      open: 0,
      justAttacked: 0,
      deduct: 0,
      fouls: 0,
      kdRound: 0,
      kdTotal: 0,
      down: false,
      recentClean: 0,
      zone: "MID",
      wobble: 0,
      pose: "guard",
      poseLeft: 0,
      ropeCool: 0,
      scar: 0,
      shield: 0,
      seen: { JAB: 0, CROSS: 0, HOOK: 0, UPPERCUT: 0, OVERHAND: 0, BODY: 0 },
      seenSlip: { L: 0, R: 0 },
      jabEarly: 0,
      jabLate: 0,
      centerTicks: 0,
      ringTicks: 0,
      jabShow: 0,
      stats: {
        thrown: 0, landed: 0, jabs: 0, jabLanded: 0, power: 0, powerLanded: 0,
        body: 0, bodyLanded: 0, counters: 0, blocks: 0, slips: 0, parries: 0,
      },
    };
    fighter.px = fighter.x;
    fighter.py = fighter.y;
    return fighter;
  }

  function freshFighters() {
    const taken = new Set();
    home = makeFighter("home", taken);
    away = makeFighter("away", taken);
    const used = new Set([home.last, away.last]);
    const pool = REFS.filter((name) => !used.has(name));
    refName = pool[Math.floor(rng() * pool.length)] || "Hale";
    weight = WEIGHTS[Math.floor(rng() * WEIGHTS.length)];
  }

  function form(fighter) {
    const rival = other(fighter);
    const pressed = zoneOf(fighter) !== "CENTER" && rival && zoneOf(rival) === "CENTER"
      ? (1 - fighter.composure / 130) * 0.28
      : 0;
    const vision = clamp(fighter.swell / 120, 0, 0.32) + (fighter.cut >= 3 ? 0.14 : fighter.cut === 2 ? 0.06 : 0);
    const hurt = clamp(fighter.head / 160, 0, 0.38) + clamp(fighter.bodyDmg / 170, 0, 0.28);
    const tired = (1 - fighter.stamina / 100) * 0.42;
    const guard = fighter.guardState === "BROKEN" ? 0.2 : fighter.guardState === "OPEN" ? 0.1 : fighter.guardState === "LOW" ? 0.04 : 0;
    return clamp(1 - pressed - vision - hurt - tired - guard, 0.3, 1);
  }

  function spend(fighter, amount) {
    const resist = 0.5 + fighter.cardio / 150;
    fighter.stamina = clamp(fighter.stamina - amount / resist, 0, 100);
  }

  function zoneOf(fighter) {
    const dx = Math.min(fighter.x, 1 - fighter.x);
    const dy = Math.min(fighter.y, 1 - fighter.y);
    const edge = Math.min(dx, dy);
    if (edge < 0.16 && dx < 0.2 && dy < 0.2) return "CORNER";
    if (edge < 0.16) return "ROPES";
    if (edge < 0.3) return "MID";
    return "CENTER";
  }

  function bandBetween(attacker, defender) {
    const dist = Math.hypot(attacker.x - defender.x, attacker.y - defender.y);
    const reach = ((attacker.reach - defender.reach) / 100) * 0.04;
    const adjusted = dist - reach;
    if (adjusted < 0.055) return "CLINCH";
    if (adjusted < 0.14) return "CLOSE";
    if (adjusted < 0.27) return "MID";
    return "LONG";
  }

  function clampRing(fighter) {
    fighter.x = clamp(fighter.x, 0.1, 0.9);
    fighter.y = clamp(fighter.y, 0.1, 0.9);
  }

  function moveToward(fighter, x, y, step) {
    const dx = x - fighter.x;
    const dy = y - fighter.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.004) return;
    const pace = Math.min(step, dist);
    fighter.x += (dx / dist) * pace;
    fighter.y += (dy / dist) * pace;
    clampRing(fighter);
  }

  function pace(fighter) {
    const zone = zoneOf(fighter);
    const room = zone === "CORNER" ? 0.42 : zone === "ROPES" ? 0.7 : 1;
    const legs = 0.55 + (fighter.stamina / 100) * 0.45;
    const skill = 0.01 + (fighter.footwork / 100) * 0.018 * form(fighter);
    return skill * room * legs * (0.82 + fighter.speed / 380);
  }

  function outboxAim(fighter, rival) {
    const dx = fighter.x - rival.x;
    const dy = fighter.y - rival.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const dist = WANT[fighter.mode] || 0.28;
    let x = rival.x + ux * dist + (-uy * fighter.circle) * 0.09;
    let y = rival.y + uy * dist + (ux * fighter.circle) * 0.09;
    if (zoneOf(fighter) !== "CENTER") {
      x = x * 0.45 + 0.5 * 0.55;
      y = y * 0.45 + 0.5 * 0.55;
      fighter.circle = zoneOf(fighter) === "CORNER" ? -fighter.circle : fighter.circle;
    } else {
      x = x * 0.86 + 0.5 * 0.14;
      y = y * 0.86 + 0.5 * 0.14;
    }
    return { x, y };
  }

  function pressureAim(fighter, rival) {
    const dx = rival.x - 0.5;
    const dy = rival.y - 0.5;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: rival.x * 0.58 + clamp(rival.x + (dx / len) * 0.16, 0.12, 0.88) * 0.42,
      y: rival.y * 0.58 + clamp(rival.y + (dy / len) * 0.16, 0.12, 0.88) * 0.42,
    };
  }

  function rangeAim(fighter, rival) {
    const dx = fighter.x - rival.x;
    const dy = fighter.y - rival.y;
    const len = Math.hypot(dx, dy) || 1;
    const dist = WANT[fighter.mode] || 0.2;
    return {
      x: rival.x + (dx / len) * dist + (-dy / len) * fighter.circle * 0.04,
      y: rival.y + (dy / len) * dist + (dx / len) * fighter.circle * 0.04,
    };
  }

  function aimOf(fighter, rival) {
    if (fighter.down) return { x: fighter.x, y: fighter.y };
    if (fighter.mode === "PRESSURE" || fighter.mode === "AGGRESSIVE" || (fighter.style === "SWARMER" && fighter.mode !== "DEFENSIVE" && fighter.mode !== "OUTBOX")) {
      return pressureAim(fighter, rival);
    }
    if (fighter.mode === "OUTBOX" || fighter.mode === "DEFENSIVE") return outboxAim(fighter, rival);
    return rangeAim(fighter, rival);
  }

  function separate() {
    let dx = home.x - away.x;
    let dy = home.y - away.y;
    let dist = Math.hypot(dx, dy);
    const min = 0.095;
    if (dist >= min) return;
    if (dist < 0.001) {
      dx = 0.02;
      dy = 0;
      dist = 0.02;
    }
    const push = (min - dist) / 2;
    home.x += (dx / dist) * push;
    home.y += (dy / dist) * push;
    away.x -= (dx / dist) * push;
    away.y -= (dy / dist) * push;
    clampRing(home);
    clampRing(away);
  }

  function refreshGuard(fighter) {
    if (fighter.stamina < 24 || fighter.head > 62) fighter.guardState = "BROKEN";
    else if (fighter.stamina < 40 || fighter.head > 42) fighter.guardState = "OPEN";
    else if (fighter.mode === "BODY_ATTACK" || fighter.bodyDmg > 38) fighter.guardState = "LOW";
    else if (fighter.style === "OUTBOX" || fighter.style === "COUNTER") fighter.guardState = "HIGH";
    else fighter.guardState = "MEDIUM";
    if (fighter.open > 0 && fighter.guardState === "HIGH") fighter.guardState = "MEDIUM";
    if (fighter.open > 0 && (fighter.guardState === "MEDIUM" || fighter.guardState === "LOW")) fighter.guardState = "OPEN";
  }

  function tally() {
    const won = { home: 0, away: 0 };
    const total = cards[0].rounds.length;
    for (let index = 0; index < total; index += 1) {
      let homeVotes = 0;
      let awayVotes = 0;
      cards.forEach((card) => {
        const score = card.rounds[index];
        if (score.home > score.away) homeVotes += 1;
        else if (score.away > score.home) awayVotes += 1;
      });
      if (homeVotes > awayVotes) won.home += 1;
      else if (awayVotes > homeVotes) won.away += 1;
    }
    return won;
  }

  function chooseMode(fighter) {
    const rival = other(fighter);
    const score = tally();
    const ahead = score[fighter.side] - score[rival.side];
    const seenJabs = fighter.seen.JAB || 0;
    const seenTotal = Object.values(fighter.seen).reduce((sum, value) => sum + value, 0);
    if (fighter.stamina < 36 && ahead > 0 && fighter.iq > 52) return "DEFENSIVE";
    if (fighter.head > 50 && fighter.composure > 58) return "OUTBOX";
    if (ahead < 0 && round >= FIGHT.rounds - 2 && fighter.risk > 46) return "HEAD_HUNT";
    if (rival.guardState === "HIGH" && round >= 3 && fighter.iq > 56 && fighter.adaptability > 48) return "BODY_ATTACK";
    if (seenTotal > 10 && seenJabs / seenTotal > 0.4 && (fighter.style === "COUNTER" || fighter.adaptability > 74)) return "COUNTER";
    if (rival.stamina + 10 < fighter.stamina && rival.stamina < 42) {
      return fighter.style === "OUTBOX" ? "OUTBOX" : "PRESSURE";
    }
    if (rng() > fighter.iq / 115) return fighter.baseMode;
    return fighter.baseMode;
  }

  function skillFor(fighter, punch) {
    if (punch === "JAB" || punch === "FEINT") return fighter.jab;
    if (punch === "CROSS" || punch === "OVERHAND") return fighter.cross;
    if (punch === "HOOK") return fighter.hook;
    if (punch === "UPPERCUT") return fighter.uppercut;
    if (punch === "BODY") return fighter.body;
    return 70;
  }

  function urge(fighter) {
    const rival = other(fighter);
    let value = fighter.aggression / 260 + fighter.volume / 280 + fighter.confidence / 400;
    if (fighter.mode === "COUNTER") value *= rival.justAttacked > 0 ? 1.7 : 0.42;
    if (fighter.mode === "OUTBOX" || fighter.mode === "DEFENSIVE") value *= 0.72;
    if (fighter.mode === "PRESSURE" || fighter.mode === "HEAD_HUNT" || fighter.mode === "AGGRESSIVE") value *= 1.28;
    if (fighter.mode === "BODY_ATTACK") value *= 1.05;
    if (fighter.stamina < 30) value *= 0.62;
    if (fighter.nextPunch) value += 0.22;
    if (round <= 1 && fighter.iq > 64) value *= 0.82;
    value *= 0.78 + rng() * 0.44;
    return value;
  }

  function pickPunch(fighter, rival, band) {
    if (fighter.nextPunch && PUNCH[fighter.nextPunch]?.ranges.includes(band)) {
      const queued = fighter.nextPunch;
      fighter.nextPunch = "";
      return queued;
    }
    fighter.nextPunch = "";
    const weights = {
      JAB: 1.2, CROSS: 1, HOOK: 0.8, UPPERCUT: 0.35, OVERHAND: 0.4, BODY: 0.7, FEINT: 0.45,
    };
    if (band === "LONG") {
      weights.JAB = 4.2;
      weights.CROSS = 0.25;
      weights.HOOK = 0.05;
      weights.UPPERCUT = 0;
      weights.OVERHAND = 0.15;
      weights.BODY = 0.15;
      weights.FEINT = 1.1;
    } else if (band === "MID") {
      weights.JAB = 1.8;
      weights.CROSS = 2.2;
      weights.HOOK = 1.2;
      weights.BODY = 1.15;
      weights.OVERHAND = 0.9;
      weights.UPPERCUT = 0.15;
    } else if (band === "CLOSE" || band === "CLINCH") {
      weights.JAB = 0.2;
      weights.HOOK = 2.6;
      weights.UPPERCUT = 2;
      weights.BODY = 1.8;
      weights.CROSS = 0.55;
      weights.OVERHAND = 0.2;
      weights.FEINT = 0.25;
    }
    weights.JAB *= fighter.jab / 70;
    weights.CROSS *= fighter.cross / 70;
    weights.HOOK *= fighter.hook / 70;
    weights.UPPERCUT *= fighter.uppercut / 70;
    weights.OVERHAND *= fighter.cross / 75;
    weights.BODY *= fighter.body / 70;
    if (rival.guardState === "HIGH") weights.BODY *= 1.25 + fighter.iq / 400;
    if (rival.guardState === "LOW" || rival.guardState === "OPEN" || rival.guardState === "BROKEN") {
      weights.CROSS *= 1.25;
      weights.OVERHAND *= 1.35;
      weights.HOOK *= 1.15;
    }
    if (fighter.mode === "BODY_ATTACK") weights.BODY *= 1.35;
    if (fighter.mode === "HEAD_HUNT") {
      weights.OVERHAND *= 1.6;
      weights.CROSS *= 1.3;
      weights.BODY *= 0.45;
    }
    if (fighter.mode === "OUTBOX" || fighter.mode === "DEFENSIVE") weights.JAB *= 1.5;
    if (fighter.mode === "COUNTER") weights.CROSS *= 1.2;
    const slips = fighter.seenSlip.L + fighter.seenSlip.R;
    if (slips >= 3) {
      weights.HOOK *= 1.15 + fighter.iq / 160;
      weights.FEINT *= 1.2 + fighter.adaptability / 140;
    }
    if (fighter.seen.JAB > 6 && fighter.style === "COUNTER") weights.FEINT *= 1.3;
    const tired = 1 - fighter.stamina / 100;
    weights.OVERHAND *= 1 - tired * 0.65;
    weights.UPPERCUT *= 1 - tired * 0.45;
    if (fighter.comboLen >= 3) {
      weights.OVERHAND *= 0.4;
      weights.UPPERCUT *= 0.55;
    }
    if (round === 1) weights.FEINT *= 1.35;
    return pickWeighted(rng, weights);
  }

  function pickDefense(defender, punch, band) {
    const weights = { BLOCK: 1.5, PARRY: 0.7, SLIP: 0.85, ROLL: 0.45, PULL: 0.55, STEP: 0.6, CLINCH: 0.25 };
    if (punch === "HOOK") {
      weights.ROLL += 1.2;
      weights.SLIP *= 0.65;
    }
    if (punch === "JAB" || punch === "CROSS") {
      weights.SLIP += 1;
      weights.PULL += 0.7;
      weights.PARRY += 0.55;
    }
    if (punch === "BODY") weights.BLOCK += 0.35;
    if (punch === "UPPERCUT" || punch === "OVERHAND") weights.CLINCH += 0.45;
    if (band === "CLOSE" || band === "CLINCH") weights.CLINCH += 1.1;
    if (defender.stamina < 36) {
      weights.CLINCH += 1.3;
      weights.SLIP *= 0.7;
    }
    if (defender.style === "COUNTER") {
      weights.SLIP += 0.7;
      weights.PARRY += 0.9;
    }
    if (defender.style === "PRESSURE" || defender.style === "SWARMER") weights.BLOCK += 0.45;
    if (zoneOf(defender) === "CORNER") {
      weights.STEP = 0.04;
      weights.CLINCH += 1.4;
    } else if (zoneOf(defender) === "ROPES") weights.STEP *= 0.35;
    if (defender.guardState === "BROKEN") weights.BLOCK *= 0.35;
    if ((defender.seen.JAB || 0) > 5) weights.SLIP += defender.iq / 90;
    weights.BLOCK *= defender.guard / 72;
    weights.PARRY *= defender.parry / 72;
    weights.SLIP *= defender.slip / 72;
    return pickWeighted(rng, weights);
  }

  function rawAccuracy(attacker, punch, band) {
    const fit = PUNCH[punch].ranges.includes(band) ? 0.1 : -0.18;
    const vision = clamp(attacker.swell / 110, 0, 0.28) + (attacker.cut >= 2 ? 0.06 : 0);
    const chance = 0.28 + (attacker.accuracy - 70) / 320 + (skillFor(attacker, punch) - 70) / 340 + (form(attacker) - 0.75) * 0.12 + fit - vision;
    return clamp(chance - attacker.comboLen * 0.04, 0.1, 0.52);
  }

  function defenseChance(defender, attacker, punch, defense) {
    const skill = {
      BLOCK: defender.guard,
      PARRY: (defender.parry + defender.timing) / 2,
      SLIP: (defender.slip + defender.reaction) / 2,
      ROLL: (defender.slip + defender.anticipation) / 2,
      PULL: (defender.footwork + defender.reaction) / 2,
      STEP: defender.footwork,
      CLINCH: (defender.discipline + defender.iq) / 2,
    }[defense] || 55;
    let chance = skill / 145 + defender.anticipation / 380 + form(defender) * 0.14;
    const straight = punch === "JAB" || punch === "CROSS";
    if (defense === "SLIP" || defense === "PULL") chance += straight ? 0.1 : -0.1;
    if (defense === "ROLL") chance += punch === "HOOK" ? 0.1 : -0.05;
    if (defense === "BLOCK" && defender.guardState === "HIGH" && PUNCH[punch].target === "HEAD") chance += 0.07;
    if (defense === "BLOCK" && punch === "BODY" && defender.guardState === "HIGH") chance -= 0.1;
    if (defense === "STEP" && zoneOf(defender) !== "CENTER" && zoneOf(defender) !== "MID") chance = 0.04;
    if (zoneOf(defender) === "CORNER") chance *= 0.6;
    else if (zoneOf(defender) === "ROPES") chance *= 0.78;
    if (defender.guardState === "BROKEN" && defense === "BLOCK") chance *= 0.45;
    if (defender.open > 0) chance *= 0.72;
    chance -= attacker.speed / 520 + PUNCH[punch].speed * 0.06;
    return clamp(chance, 0.05, 0.74);
  }

  function impactOf(attacker, punch, band, scale) {
    const spec = PUNCH[punch];
    const fit = spec.ranges.includes(band) ? 1 : 0.6;
    const speed = 0.78 + attacker.speed / 280;
    const tech = (skillFor(attacker, punch) / 100) * 0.65 + 0.48;
    const fresh = 0.58 + form(attacker) * 0.5;
    let impact = (attacker.power / 100) * spec.power * 8.5 * speed * tech * fit * fresh * scale;
    if (attacker.stance !== other(attacker).stance && (punch === "CROSS" || punch === "OVERHAND")) impact *= 1.07;
    if (attacker.confidence > 88) impact *= 1.04;
    return impact;
  }

  function refreshAfter(fighter) {
    fighter.balance = clamp(fighter.balance, 0, 100);
    refreshGuard(fighter);
  }

  function noteZone(fighter) {
    const zone = zoneOf(fighter);
    if (fighter.ropeCool > 0) fighter.ropeCool -= 1;
    if (zone === fighter.zone) return;
    const previous = fighter.zone;
    fighter.zone = zone;
    if (phase !== "active" || fighter.ropeCool > 0) return;
    if ((zone === "ROPES" || zone === "CORNER") && previous !== "ROPES" && previous !== "CORNER") {
      fighter.ropeCool = 28;
      const where = zone === "CORNER" ? "into a corner" : "onto the ropes";
      line("neutral", [fighter.last, toneOf(fighter)], ` is moved ${where}.`);
    }
  }

  function moveBoth() {
    [home, away].forEach((fighter) => {
      if (fighter.down) return;
      const aim = aimOf(fighter, other(fighter));
      const step = pace(fighter);
      moveToward(fighter, aim.x, aim.y, step);
      spend(fighter, step * 5.5);
      if (fighter.stamina < 32 && urge(fighter) < 0.35) {
        fighter.stamina = clamp(fighter.stamina + 0.12 * (fighter.recovery / 70), 0, 100);
      }
    });
    separate();
    [home, away].forEach((fighter) => {
      fighter.ringTicks += 1;
      if (zoneOf(fighter) === "CENTER") fighter.centerTicks += 1;
      const rival = other(fighter);
      if (zoneOf(fighter) === "CENTER" && zoneOf(rival) !== "CENTER") book[fighter.side].ring += 0.045;
      else if (zoneOf(fighter) === "CENTER") book[fighter.side].ring += 0.012;
      noteZone(fighter);
      refreshGuard(fighter);
    });
    const spot = {
      x: clamp((home.x + away.x) / 2 + (home.y - away.y) * 0.28, 0.18, 0.82),
      y: clamp((home.y + away.y) / 2 + (away.x - home.x) * 0.28, 0.18, 0.82),
    };
    moveToward(referee, spot.x, spot.y, 0.02);
  }

  function knockdownChance(defender, impact) {
    const threat = impact * 1.35
      + defender.head * 0.55
      + (100 - defender.chin) * 0.05
      + (100 - defender.balance) * 0.035
      + (100 - defender.stamina) * 0.015
      + (defender.guardState === "BROKEN" ? 5 : 0);
    const early = round <= 3 ? 0.35 : round <= 7 ? 0.7 : 1;
    let chance = 1 / (1 + Math.exp(-(threat - 34) / 3.3));
    if (impact < 5.2) chance *= 0.15;
    if (defender.shield > 0) chance *= 0.3;
    return clamp(chance * early, 0, 0.45);
  }

  function startCount(defender, attacker) {
    defender.down = true;
    defender.kdRound += 1;
    defender.kdTotal += 1;
    book[attacker.side].kd += 1;
    book[attacker.side].clean += 1.4;
    book[attacker.side].agg += 0.8;
    let riseAt = clamp(4 + Math.round(defender.head / 22 + (100 - defender.balance) / 40), 4, 8);
    if (defender.head > 56 && rng() < 0.2) riseAt = 12;
    else if (defender.guardState === "BROKEN" && defender.head > 46 && rng() < 0.12) riseAt = 12;
    count = { fighter: defender, attacker, tick: 0, riseAt, number: 0 };
    phase = "count";
    spark = { x: defender.x, y: defender.y, life: 6 };
    defender.shield = 12;
    line("goal", "Down goes ", [defender.last, toneOf(defender)], "!");
    arm("Knockdown", 24);
    if (defender.kdRound >= 3) finish("TKO", attacker, defender, "three knockdowns");
  }

  function checkStop(defender, attacker) {
    if (phase === "finale" || round < 5) return;
    const helpless = defender.guardState === "BROKEN" || (defender.guardState === "OPEN" && defender.head > 64);
    const washed = form(defender) < 0.42 && defender.head > 58 && defender.recentClean >= 4 && helpless;
    if (!washed) return;
    const chance = 0.06 + defender.head / 700;
    if (rng() < chance) finish("TKO", attacker, defender, "referee stoppage");
  }

  function worsenCut(defender, attacker) {
    if (defender.cut >= 3) {
      if (round > 4 && rng() < 0.08) finish("TKO", attacker, defender, "doctor stoppage");
      return;
    }
    defender.cut += 1;
    if (!defender.cutWhere) {
      const places = ["left eye", "right eye", "brow", "nose"];
      defender.cutWhere = places[Math.floor(rng() * places.length)];
    }
    const degree = defender.cut === 1 ? "opens a cut" : defender.cut === 2 ? "worsens the cut" : "rips the cut";
    line("foul", [attacker.last, toneOf(attacker)], ` ${degree} on the ${defender.cutWhere} of `, [defender.last, toneOf(defender)], ".");
  }

  function applyDamage(attacker, defender, punch, impact) {
    if (PUNCH[punch].target === "HEAD") {
      const gain = impact * (0.5 - defender.chin / 480);
      defender.head += gain;
      defender.scar += gain * 0.22;
      defender.balance -= impact * 0.45;
      defender.swell += impact * 0.28 * (1.15 - defender.swellResist / 160) * (punch === "HOOK" ? 1.8 : 1);
      const cutChance = (1 - defender.cutResist / 150) * (impact / 90) * (defender.cut > 0 ? 1.5 : 0.55);
      if (rng() < cutChance) worsenCut(defender, attacker);
      if (defender.swell > 32 && defender.swellNote < 1) {
        defender.swellNote = 1;
        line("neutral", [defender.last, toneOf(defender)], " is swelling around the eye.");
      } else if (defender.swell > 58 && defender.swellNote < 2) {
        defender.swellNote = 2;
        line("foul", "The swelling is closing ", [defender.last, toneOf(defender)], "'s eye.");
      }
    } else {
      defender.bodyDmg += impact * (1.08 - defender.bodyDurability / 220);
      defender.stamina = clamp(defender.stamina - impact * 0.08, 0, 100);
      book[attacker.side].body += 1;
    }
    defender.recentClean += PUNCH[punch].target === "HEAD" ? 1 : 0.45;
    refreshAfter(defender);
  }

  function credit(attacker, punch, quality, counter) {
    const clean = (punch === "JAB" ? 0.38 : punch === "BODY" ? 0.62 : 0.86) * quality;
    book[attacker.side].clean += clean;
    if (attacker.mode === "PRESSURE" || attacker.mode === "AGGRESSIVE" || zoneOf(other(attacker)) !== "CENTER") {
      book[attacker.side].agg += 0.18 * quality;
    }
    if (counter) book[attacker.side].counters += 1;
    if (punch === "JAB") book[attacker.side].jabs += 1;
    if (punch !== "JAB" && punch !== "FEINT" && punch !== "BODY") book[attacker.side].power += 1;
  }

  function queueCombo(attacker, punch) {
    const max = 2 + Math.round(attacker.volume / 45);
    if (attacker.comboLen >= max || attacker.stamina < 28) {
      attacker.comboLen = 0;
      attacker.nextPunch = "";
      return;
    }
    const next = {
      JAB: rng() < 0.55 ? "CROSS" : "BODY",
      BODY: "HOOK",
      CROSS: rng() < 0.5 ? "HOOK" : "BODY",
      FEINT: "CROSS",
      HOOK: rng() < 0.4 ? "UPPERCUT" : "",
    }[punch] || "";
    if (!next || rng() > 0.35 + attacker.volume / 180) {
      attacker.comboLen = 0;
      attacker.nextPunch = "";
      return;
    }
    attacker.comboLen += 1;
    attacker.nextPunch = next;
  }

  function armPose(fighter, pose) {
    fighter.pose = pose;
    fighter.poseLeft = 8;
  }

  function foul(attacker) {
    attacker.fouls += 1;
    attacker.deduct += attacker.fouls >= 2 ? 1 : 0;
    if (attacker.fouls >= 3) {
      line("foul", [attacker.last, toneOf(attacker)], " throws a low blow. Disqualified.");
      finish("DQ", other(attacker), attacker, "low blow");
      return;
    }
    const note = attacker.fouls === 1 ? "Warning for a low blow by " : "Point deducted from ";
    line("foul", note, [attacker.last, toneOf(attacker)], ".");
    arm("Low Blow", 16);
  }

  function throwPunch(attacker, defender, isCounter) {
    if (phase !== "active" || attacker.down || defender.down) return;
    const band = bandBetween(attacker, defender);
    let punch = pickPunch(attacker, defender, band);
    if (!PUNCH[punch] || !PUNCH[punch].ranges.includes(band)) punch = band === "LONG" ? "JAB" : band === "CLOSE" || band === "CLINCH" ? "HOOK" : "CROSS";
    armPose(attacker, punch === "FEINT" ? "feint" : punch === "HOOK" ? "hook" : punch === "UPPERCUT" || punch === "OVERHAND" ? "upper" : punch === "BODY" ? "body" : "straight");
    if (band === "CLINCH" && punch !== "FEINT" && rng() < 0.55) {
      armPose(attacker, "clinch");
      armPose(defender, "clinch");
      clinchLeft = 3 + Math.floor(rng() * 3);
      if (rng() < 0.65) line("neutral", [attacker.last, toneOf(attacker)], " forces a clinch.");
      if (attacker.discipline < 48 && attacker.fouls < 3 && rng() < 0.08) {
        attacker.fouls += 1;
        line("foul", "Referee ", refName, " warns ", [attacker.last, toneOf(attacker)], " for holding.");
        if (attacker.fouls >= 2) attacker.deduct += 1;
      }
      return;
    }
    spend(attacker, PUNCH[punch].cost * (0.32 + attacker.volume / 420));
    attacker.justAttacked = 2;
    attacker.open = (punch === "OVERHAND" || punch === "UPPERCUT") && attacker.risk > 62 ? 2 : attacker.open;
    if (punch === "FEINT") {
      defender.seen.JAB += 1;
      if (rng() < defender.reaction / 160) return;
      if (defender.guardState === "HIGH") defender.guardState = "MEDIUM";
      if (rng() < 0.45) defender.seenSlip.R += 0;
      if (attacker.comboLen < 2 && rng() < 0.4 + attacker.iq / 200) attacker.nextPunch = "CROSS";
      if (rng() < 0.34) line(toneOf(attacker), [attacker.last, toneOf(attacker)], " feints and shifts the guard.");
      return;
    }
    if (punch === "BODY" && attacker.stamina < 42 && attacker.discipline < 58 && rng() < 0.006) {
      foul(attacker);
      return;
    }
    attacker.stats.thrown += 1;
    defender.seen[punch] = (defender.seen[punch] || 0) + 1;
    if (punch === "JAB") attacker.stats.jabs += 1;
    else if (punch === "BODY") attacker.stats.body += 1;
    else attacker.stats.power += 1;
    const arrive = rng() < rawAccuracy(attacker, punch, band);
    if (!arrive) {
      attacker.comboLen = 0;
      attacker.nextPunch = "";
      return;
    }
    const defense = pickDefense(defender, punch, band);
    const chance = defenseChance(defender, attacker, punch, defense);
    const roll = rng();
    if (defense === "CLINCH" && roll < chance) {
      armPose(attacker, "clinch");
      armPose(defender, "clinch");
      clinchLeft = 3 + Math.floor(rng() * 3);
      book[defender.side].def += 0.12;
      if (rng() < 0.5) line("neutral", [defender.last, toneOf(defender)], " grabs and holds.");
      return;
    }
    const full = roll < chance * 0.62 && defense !== "BLOCK" && defense !== "CLINCH";
    const partial = !full && roll < chance;
    if (full) {
      armPose(defender, defense === "BLOCK" || defense === "PARRY" ? "block" : "slip");
      book[defender.side].def += defense === "PARRY" ? 0.34 : 0.26;
      if (defense === "SLIP") {
        defender.stats.slips += 1;
        const side = rng() < 0.58 ? "R" : "L";
        attacker.seenSlip[side] += 1;
      } else if (defense === "PARRY") defender.stats.parries += 1;
      attacker.comboLen = 0;
      attacker.nextPunch = "";
      const verb = defense === "SLIP" ? "slips" : defense === "PARRY" ? "parries" : defense === "ROLL" ? "rolls under" : defense === "PULL" ? "pulls away from" : "steps off";
      if (defense === "PARRY" || defense === "SLIP" || rng() < 0.4) {
        line(toneOf(defender), [defender.last, toneOf(defender)], ` ${verb} the ${PUNCH_NAME[punch]}.`);
      }
      const counterChance = clamp(
        0.18 + defender.timing / 220 + (defender.style === "COUNTER" ? 0.28 : 0) + (defender.mode === "COUNTER" ? 0.12 : 0) - (1 - form(defender)) * 0.2,
        0.08,
        0.75,
      );
      if (!isCounter && (defense === "PARRY" || defense === "SLIP" || defense === "ROLL") && rng() < counterChance) {
        defender.stats.counters += 1;
        throwPunch(defender, attacker, true);
      }
      return;
    }
    if (partial) {
      armPose(defender, "block");
      defender.stats.blocks += 1;
      book[defender.side].def += 0.12;
      const impact = impactOf(attacker, punch, band, 0.3);
      applyDamage(attacker, defender, punch, impact);
      credit(attacker, punch, 0.28, isCounter);
      if (rng() < 0.42) line(toneOf(defender), [defender.last, toneOf(defender)], ` blocks the ${PUNCH_NAME[punch]}.`);
      return;
    }
    const impact = impactOf(attacker, punch, band, 1);
    attacker.stats.landed += 1;
    if (punch === "JAB") {
      attacker.stats.jabLanded += 1;
      if (round <= 4) attacker.jabEarly += 1;
      if (round >= 8) attacker.jabLate += 1;
    } else if (punch === "BODY") attacker.stats.bodyLanded += 1;
    else attacker.stats.powerLanded += 1;
    applyDamage(attacker, defender, punch, impact);
    credit(attacker, punch, isCounter ? 1.25 : 1, isCounter);
    spark = { x: (attacker.x + defender.x) / 2, y: (attacker.y + defender.y) / 2, life: 4 };
    const notable = punch !== "JAB" || (attacker.jabShow += 1) % 3 === 1;
    if (notable) {
      const noun = PUNCH_NAME[punch];
      const article = "aeiou".includes(noun[0]) ? "an" : "a";
      const verb = isCounter ? `counters with ${article}` : `lands ${article}`;
      line(toneOf(attacker), [attacker.last, toneOf(attacker)], ` ${verb} ${noun}.`);
    }
    if (attacker.confidence < 90) attacker.confidence = clamp(attacker.confidence + 0.35, 20, 96);
    defender.confidence = clamp(defender.confidence - 0.2, 20, 96);
    if (PUNCH[punch].target === "HEAD" && rng() < knockdownChance(defender, impact)) {
      startCount(defender, attacker);
      return;
    }
    checkStop(defender, attacker);
    if (phase === "active") queueCombo(attacker, punch);
  }

  function exchange() {
    if (clinchLeft > 0) {
      clinchLeft -= 1;
      home.stamina = clamp(home.stamina + 0.18, 0, 100);
      away.stamina = clamp(away.stamina + 0.18, 0, 100);
      if (clinchLeft === 0) {
        const dx = home.x - away.x;
        const dy = home.y - away.y;
        const dist = Math.hypot(dx, dy) || 1;
        home.x = clamp(home.x + (dx / dist) * 0.05, 0.1, 0.9);
        home.y = clamp(home.y + (dy / dist) * 0.05, 0.1, 0.9);
        away.x = clamp(away.x - (dx / dist) * 0.05, 0.1, 0.9);
        away.y = clamp(away.y - (dy / dist) * 0.05, 0.1, 0.9);
        line("neutral", "Referee ", refName, " breaks the hold.");
      }
      return;
    }
    const homeUrge = urge(home);
    const awayUrge = urge(away);
    const first = homeUrge >= awayUrge ? home : away;
    const second = other(first);
    const secondUrge = first === home ? awayUrge : homeUrge;
    if (homeUrge < 0.52 && awayUrge < 0.52) return;
    throwPunch(first, second, false);
    if (phase !== "active" || clinchLeft > 0) return;
    if (secondUrge > 0.5 && rng() < 0.38) throwPunch(second, first, false);
  }

  function story() {
    const homeBook = book.home;
    const awayBook = book.away;
    const homeEdge = homeBook.clean + homeBook.ring + homeBook.agg;
    const awayEdge = awayBook.clean + awayBook.ring + awayBook.agg;
    const leader = homeEdge === awayEdge ? null : homeEdge > awayEdge ? home : away;
    const follower = leader ? other(leader) : null;
    const sideBook = leader ? book[leader.side] : null;
    if (!leader) return "A quiet round. Little between them.";
    if (sideBook.kd > book[follower.side].kd) return `${leader.last} scores the knockdown.`;
    if (book[follower.side].kd > sideBook.kd) return `${follower.last} scores the knockdown, but ${leader.last} takes the round.`;
    if (zoneOf(follower) !== "CENTER" && sideBook.ring > book[follower.side].ring + 0.4) {
      return `${leader.last} traps ${follower.last} on the ropes.`;
    }
    if (sideBook.body >= 3 && sideBook.body > book[follower.side].body) return `${leader.last} goes to the body.`;
    if (sideBook.counters >= 2) return `${leader.last} times the counters.`;
    if (sideBook.jabs >= 3 && sideBook.jabs > sideBook.power) return `${leader.last} controls the distance with the jab.`;
    if (follower.stamina < leader.stamina - 8) return `${follower.last} starts to slow.`;
    return `${leader.last} edges the exchanges.`;
  }

  function commitScores() {
    return JUDGES.map((judge, index) => {
      const margin = (book.home.clean - book.away.clean) * judge.clean
        + (book.home.agg - book.away.agg) * judge.agg
        + (book.home.def - book.away.def) * judge.def
        + (book.home.ring - book.away.ring) * judge.ring
        + (rng() - 0.5) * 0.6;
      let homeScore = 10;
      let awayScore = 10;
      if (book.home.kd !== book.away.kd) {
        if (book.home.kd > book.away.kd) awayScore -= Math.min(3, book.home.kd + 1);
        else homeScore -= Math.min(3, book.away.kd + 1);
      } else {
        const swing = Math.abs(margin) > 0.45 ? 1 : 0;
        if (margin > 0) awayScore -= swing;
        else if (margin < 0) homeScore -= swing;
      }
      homeScore = clamp(homeScore - home.deduct, 6, 10);
      awayScore = clamp(awayScore - away.deduct, 6, 10);
      const scored = { home: homeScore, away: awayScore };
      cards[index].rounds.push(scored);
      cards[index].home += homeScore;
      cards[index].away += awayScore;
      return scored;
    });
  }

  function cardLine(scored) {
    return scored.map((score) => `${score.home}-${score.away}`).join(", ");
  }

  function recover() {
    [home, away].forEach((fighter) => {
      const gain = 8 + fighter.recovery * 0.1;
      fighter.stamina = clamp(fighter.stamina + gain, 0, 100);
      fighter.bodyDmg *= 0.9;
      const carried = Math.max(fighter.scar, 0);
      fighter.head = carried + Math.max(0, fighter.head - carried) * 0.4;
      fighter.scar = carried;
      fighter.swell = Math.max(0, fighter.swell - 5);
      fighter.balance = clamp(fighter.balance + 18, 0, 100);
      fighter.recentClean = 0;
      fighter.comboLen = 0;
      fighter.nextPunch = "";
      fighter.open = 0;
      if (fighter.guardState === "BROKEN") fighter.guardState = "LOW";
      else if (fighter.guardState === "OPEN") fighter.guardState = "MEDIUM";
    });
  }

  function maybeRetire() {
    const tired = [home, away].find((fighter) => (fighter.stamina < 8 && fighter.head > 68) || (fighter.cut >= 3 && fighter.head > 72));
    if (!tired) return false;
    const chance = 0.12;
    if (rng() > chance) return false;
    finish("RTD", other(tired), tired, "retired between rounds");
    return true;
  }

  function reasons(winner, loser, method) {
    if (method === "DQ") return [`${loser.last} was disqualified for repeated fouls.`];
    if (!winner || !loser) return ["Neither fighter could separate himself on the cards."];
    const lines = [];
    const winnerRate = winner.stats.thrown ? winner.stats.landed / winner.stats.thrown : 0;
    const loserRate = loser.stats.thrown ? loser.stats.landed / loser.stats.thrown : 0;
    if (winnerRate > loserRate + 0.04) {
      lines.push(`${winner.last} landed the cleaner shots (${Math.round(winnerRate * 100)}% to ${Math.round(loserRate * 100)}%).`);
    }
    const winnerCenter = winner.ringTicks ? winner.centerTicks / winner.ringTicks : 0;
    const loserCenter = loser.ringTicks ? loser.centerTicks / loser.ringTicks : 0;
    if (winnerCenter > loserCenter + 0.08) lines.push(`${winner.last} kept the center of the ring.`);
    if (winner.stats.bodyLanded >= 6 && winner.stats.bodyLanded > loser.stats.bodyLanded + 2) {
      lines.push(`${winner.last} built the fight through the body.`);
    }
    if (winner.kdTotal > loser.kdTotal) {
      lines.push(`${winner.last} scored ${winner.kdTotal} knockdown${winner.kdTotal > 1 ? "s" : ""}.`);
    }
    if (loser.stamina + 12 < winner.stamina && loser.stamina < 48) {
      lines.push(`${loser.last} faded late, down to ${Math.round(loser.stamina)} stamina.`);
    }
    if (winner.jabLate >= winner.jabEarly + 2 && winner.jabLate >= 3) {
      lines.push(`${winner.last} added the jab after the early rounds.`);
    }
    if (!lines.length) lines.push(`${winner.last} took the closer rounds.`);
    return lines.slice(0, 4);
  }

  function finish(method, winner, loser, detail) {
    if (phase === "finale") return;
    pinnedTime = logTime();
    phase = "finale";
    count = null;
    clinchLeft = 0;
    result = {
      method,
      winner: winner?.last || "",
      loser: loser?.last || "",
      detail,
      round: Math.max(1, round),
    };
    divider("Result");
    if (method === "KO" || method === "TKO" || method === "DQ" || method === "RTD") {
      const elapsed = Math.min(FIGHT.roundDuration, Math.floor((tickInRound / FIGHT.ticks) * FIGHT.roundDuration));
      const minutes = Math.floor(elapsed / 60);
      const seconds = String(elapsed % 60).padStart(2, "0");
      line("goal", [winner.last, toneOf(winner)], ` wins by ${method}`, ` in round ${result.round} at ${minutes}:${seconds}.`);
      if (detail) line("neutral", detail[0].toUpperCase() + detail.slice(1) + ".");
    } else {
      cards.forEach((card) => {
        line("neutral", `${card.name.padEnd(10, " ")} ${card.home} - ${card.away}`);
      });
      if (winner) line("goal", [winner.last, toneOf(winner)], ` wins by ${LABEL[method]}.`);
      else line("neutral", `${LABEL[method]}.`);
    }
    reasons(winner, loser, method).forEach((text) => line("neutral", text));
    const thrown = home.stats.thrown + away.stats.thrown;
    if (thrown) {
      line("neutral", `${home.last} ${home.stats.landed}/${home.stats.thrown}`, "  ·  ", `${away.last} ${away.stats.landed}/${away.stats.thrown}`);
    }
    arm(winner ? `${winner.last} · ${LABEL[method]}` : LABEL[method], 999);
    voice = { text: winner ? `${winner.last} · ${LABEL[method]}` : LABEL[method], tone: winner ? "goal" : "neutral" };
    pinnedTime = "";
  }

  function decide() {
    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    cards.forEach((card) => {
      if (card.home > card.away) homeWins += 1;
      else if (card.away > card.home) awayWins += 1;
      else draws += 1;
    });
    let method = "SPLIT_DRAW";
    if (homeWins === 3 || awayWins === 3) method = "UNANIMOUS_DECISION";
    else if ((homeWins === 2 && draws === 1) || (awayWins === 2 && draws === 1)) method = "MAJORITY_DECISION";
    else if (homeWins === 2 || awayWins === 2) method = "SPLIT_DECISION";
    else if (homeWins === 0 && awayWins === 0) method = "DRAW";
    else if (draws === 2) method = "MAJORITY_DRAW";
    const winner = homeWins > awayWins ? home : awayWins > homeWins ? away : null;
    const loser = winner ? other(winner) : null;
    finish(method, winner, loser, "");
  }

  function endRound() {
    const scored = commitScores();
    let homeVotes = 0;
    let awayVotes = 0;
    scored.forEach((score) => {
      if (score.home > score.away) homeVotes += 1;
      else if (score.away > score.home) awayVotes += 1;
    });
    const roundWinner = homeVotes > awayVotes ? home : awayVotes > homeVotes ? away : null;
    const cardsText = cardLine(scored);
    if (roundWinner) line(toneOf(roundWinner), `Round ${round} to `, [roundWinner.last, toneOf(roundWinner)], ` · ${cardsText}`);
    else line("neutral", `Round ${round} even · ${cardsText}`);
    line("neutral", story());
    if (round >= FIGHT.rounds) {
      decide();
      return;
    }
    recover();
    if (maybeRetire()) return;
    phase = "rest";
    restLeft = FIGHT.restTicks;
    arm("Rest", 10);
  }

  function beginRound() {
    round += 1;
    tickInRound = 0;
    book = blankBook();
    home.deduct = 0;
    away.deduct = 0;
    home.kdRound = 0;
    away.kdRound = 0;
    home.mode = chooseMode(home);
    away.mode = chooseMode(away);
    home.zone = zoneOf(home);
    away.zone = zoneOf(away);
    phase = "bell";
    bellLeft = 8;
    divider(`Round ${round}`);
    arm(`Round ${round}`, 12);
    voice = { text: `Round ${round}.`, tone: "neutral" };
  }

  function stepCount() {
    const downed = count.fighter;
    const standing = count.attacker;
    const corner = [
      { x: 0.18, y: 0.18 },
      { x: 0.82, y: 0.18 },
      { x: 0.18, y: 0.82 },
      { x: 0.82, y: 0.82 },
    ].sort((a, b) => Math.hypot(b.x - downed.x, b.y - downed.y) - Math.hypot(a.x - downed.x, a.y - downed.y))[0];
    moveToward(standing, corner.x, corner.y, 0.03);
    moveToward(referee, downed.x + 0.06, downed.y, 0.03);
    count.tick += 1;
    if (count.tick % 4 !== 0) return;
    count.number += 1;
    voice = { text: `${standing.last} waits. Count ${count.number}.`, tone: "goal" };
    if (count.number >= count.riseAt && count.riseAt <= 10) {
      downed.down = false;
      downed.wobble = 14;
      downed.balance = clamp(30 + downed.kdRecovery * 0.3, 25, 70);
      downed.guardState = "OPEN";
      downed.stamina = clamp(downed.stamina - 4, 0, 100);
      line("neutral", [downed.last, toneOf(downed)], ` beats the count at ${count.number}.`);
      count = null;
      phase = "active";
      return;
    }
    if (count.number >= 10) finish("KO", standing, downed, "failed to beat the count");
  }

  function opening() {
    freshFighters();
    referee.x = 0.5;
    referee.y = 0.58;
    referee.px = referee.x;
    referee.py = referee.y;
    phase = "ready";
    round = 0;
    result = null;
    log = [];
    book = blankBook();
    cards.forEach((card) => {
      card.home = 0;
      card.away = 0;
      card.rounds = [];
    });
    divider(weight);
    line("neutral", [home.name, "home"], ` · ${home.styleLabel} · ${home.stanceLabel}`);
    line("neutral", [away.name, "away"], ` · ${away.styleLabel} · ${away.stanceLabel}`);
    line("neutral", `${FIGHT.rounds} × 3:00 · ${FIGHT.ruleset.replace("_", " ").toLowerCase()}`);
    voice = { text: `${home.last} versus ${away.last}.`, tone: "neutral" };
  }

  function capture() {
    [home, away, referee].forEach((entity) => {
      if (!entity) return;
      entity.px = entity.x;
      entity.py = entity.y;
    });
  }

  function spotOf(entity, alpha) {
    const px = entity.px ?? entity.x;
    const py = entity.py ?? entity.y;
    if (!(alpha < 1)) return { x: entity.x, y: entity.y };
    return { x: px + (entity.x - px) * alpha, y: py + (entity.y - py) * alpha };
  }

  function render(alpha = 1) {
    if (!cols || !rows || !home || !away) return;
    cells = Array.from({ length: cols * rows }, () => ({ lit: false, tone: "", glyph: "" }));
    const span = RING_M + GAP_M + SKY_M;
    const margin = 1;
    const left = margin;
    const top = margin;
    const right = Math.max(left + 2, cols - 1 - margin);
    const bottom = Math.max(top + 2, rows - 1 - margin);
    const pitchToCell = (x, y) => ({
      col: clamp(Math.round(left + clamp(x, 0, 1) * (right - left)), 0, cols - 1),
      row: clamp(Math.round(top + clamp(y, 0, 1) * (bottom - top)), 0, rows - 1),
    });
    const courtToCell = (x, y) => pitchToCell(clamp(x, 0, 1), clamp(y, 0, 1) * (RING_M / span));
    const toSide = (courtX, meters) => {
      const z = clamp(meters, 0, SKY_M);
      return pitchToCell(clamp(courtX, 0, 1), (RING_M + GAP_M + (SKY_M - z)) / span);
    };
    const paint = (col, row, tone) => {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      const cell = cells[row * cols + col];
      if (!cell || cell.glyph) return;
      const rank = tone === "is-blue" || tone === "is-red" || tone === "is-yellow" ? 2 : 1;
      const held = cell.tone === "is-blue" || cell.tone === "is-red" || cell.tone === "is-yellow" ? 2 : cell.tone ? 1 : 0;
      if (rank < held) return;
      cell.lit = true;
      cell.tone = tone;
    };
    const hLine = (y, inset, tone) => {
      const from = courtToCell(inset, y);
      const to = courtToCell(1 - inset, y);
      for (let col = from.col; col <= to.col; col += 1) paint(col, from.row, tone);
    };
    const vLine = (x, inset, tone) => {
      const from = courtToCell(x, inset);
      const to = courtToCell(x, 1 - inset);
      for (let row = from.row; row <= to.row; row += 1) paint(from.col, row, tone);
    };
    hLine(0.08, 0.08, "is-white");
    hLine(0.92, 0.08, "is-white");
    vLine(0.08, 0.08, "is-white");
    vLine(0.92, 0.08, "is-white");
    hLine(0.14, 0.14, "is-gray");
    hLine(0.86, 0.14, "is-gray");
    vLine(0.14, 0.14, "is-gray");
    vLine(0.86, 0.14, "is-gray");
    const center = courtToCell(0.5, 0.5);
    paint(center.col, center.row, "is-gray");
    const charCols = Math.max(1, Math.floor(cols / 2));
    const courtLimit = Math.max(0, Math.floor(courtToCell(0.5, 1).row / 4));
    const charAt = (x, y) => {
      const dot = courtToCell(x, y);
      return {
        col: clamp(Math.floor(dot.col / 2), 0, charCols - 1),
        row: clamp(Math.floor(dot.row / 4), 0, courtLimit),
      };
    };
    const stamp = (col, row, glyph, tone) => {
      if (col < 0 || row < 0 || col >= charCols || row > courtLimit) return;
      cells[row * 4 * cols + col * 2] = { lit: true, tone, glyph };
    };
    const drawFighter = (fighter, rival) => {
      const spot = spotOf(fighter, alpha);
      const origin = charAt(spot.x, spot.y);
      const otherSpot = charAt(spotOf(rival, alpha).x, spotOf(rival, alpha).y);
      const tone = fighter.down || fighter.wobble > 0
        ? "is-yellow"
        : fighter.side === "home" ? "is-blue" : "is-red";
      const name = fighter.last.slice(0, 8);
      let nameRow = origin.row <= otherSpot.row ? origin.row - 1 : origin.row + 1;
      if (nameRow < 0) nameRow = Math.min(courtLimit, origin.row + 1);
      if (nameRow > courtLimit) nameRow = Math.max(0, origin.row - 1);
      let nameCol = origin.col <= otherSpot.col ? origin.col - name.length : origin.col + 1;
      if (nameCol < 0) nameCol = 0;
      if (nameCol + name.length > charCols) nameCol = Math.max(0, charCols - name.length);
      for (let index = 0; index < name.length; index += 1) stamp(nameCol + index, nameRow, name[index], tone);
      stamp(origin.col, origin.row, fighter.down ? "+" : "●", tone);
    };
    drawFighter(home, away);
    drawFighter(away, home);
    const refSpot = charAt(spotOf(referee, alpha).x, spotOf(referee, alpha).y);
    stamp(refSpot.col, refSpot.row, "r", "is-gray");
    if (spark && spark.life > 0) {
      const flash = charAt(spark.x, spark.y);
      stamp(flash.col, flash.row, "*", "is-yellow");
    }
    const stroke = (x0, z0, x1, z1, tone) => {
      const from = toSide(x0, z0);
      const to = toSide(x1, z1);
      const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row), 1);
      for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        paint(
          Math.round(from.col + (to.col - from.col) * t),
          Math.round(from.row + (to.row - from.row) * t),
          tone,
        );
      }
    };
    const head = (cx, cz, tone) => {
      const rx = 0.02;
      const rz = 0.34;
      for (let index = 0; index < 7; index += 1) {
        const a0 = (index / 7) * Math.PI * 2;
        const a1 = ((index + 1) / 7) * Math.PI * 2;
        stroke(cx + Math.cos(a0) * rx, cz + Math.sin(a0) * rz, cx + Math.cos(a1) * rx, cz + Math.sin(a1) * rz, tone);
      }
    };
    stroke(0.08, 0, 0.92, 0, "is-white");
    stroke(0.08, 0, 0.08, 3.15, "is-white");
    stroke(0.92, 0, 0.92, 3.15, "is-white");
    stroke(0.08, 1.15, 0.92, 1.15, "is-gray");
    stroke(0.08, 2.05, 0.92, 2.05, "is-gray");
    stroke(0.08, 2.85, 0.92, 2.85, "is-gray");
    const drawBody = (fighter, rival) => {
      const spot = spotOf(fighter, alpha);
      const other = spotOf(rival, alpha);
      let x = spot.x;
      const otherX = other.x;
      if (Math.abs(x - otherX) < 0.14) {
        const mid = (x + otherX) / 2;
        x = mid + (x <= otherX ? -0.07 : 0.07);
      }
      const dir = otherX >= spot.x ? 1 : -1;
      const tone = fighter.down || fighter.wobble > 0
        ? "is-yellow"
        : fighter.side === "home" ? "is-blue" : "is-red";
      const pose = fighter.down ? "down" : clinchLeft > 0 ? "clinch" : fighter.poseLeft > 0 ? fighter.pose : "guard";
      if (pose === "down") {
        stroke(x - dir * 0.02, 0.28, x + dir * 0.1, 0.55, tone);
        head(x + dir * 0.12, 0.85, tone);
        return;
      }
      const lean = pose === "slip" ? -dir * 0.03 : pose === "guard" || pose === "block" ? 0 : dir * 0.012;
      const hip = 1.65;
      const shoulder = 2.75;
      const crown = 3.7;
      const bx = clamp(x + lean, 0.12, 0.88);
      stroke(bx - dir * 0.028, 0.04, bx - 0.006, hip, tone);
      stroke(bx + dir * 0.04, 0.04, bx + 0.008, hip, tone);
      stroke(bx, hip, bx + lean * 0.35, shoulder, tone);
      head(bx + lean * 0.25, crown, tone);
      if (pose === "straight") stroke(bx, shoulder - 0.1, bx + dir * 0.14, shoulder + 0.05, tone);
      else if (pose === "feint") stroke(bx, shoulder - 0.1, bx + dir * 0.07, shoulder + 0.1, tone);
      else if (pose === "hook") stroke(bx, shoulder - 0.15, bx + dir * 0.11, shoulder - 0.55, tone);
      else if (pose === "upper") stroke(bx + dir * 0.01, shoulder - 0.7, bx + dir * 0.08, shoulder + 0.15, tone);
      else if (pose === "body") stroke(bx, shoulder - 0.05, bx + dir * 0.12, hip + 0.2, tone);
      else if (pose === "block" || pose === "clinch") {
        stroke(bx + dir * 0.005, shoulder - 0.35, bx + dir * 0.045, shoulder + 0.2, tone);
        stroke(bx + dir * 0.012, shoulder - 0.55, bx + dir * 0.055, shoulder - 0.05, tone);
      } else {
        stroke(bx, shoulder - 0.2, bx + dir * 0.04, shoulder + 0.22, tone);
        stroke(bx - dir * 0.008, shoulder - 0.35, bx + dir * 0.025, shoulder + 0.02, tone);
      }
    };
    const rear = spotOf(home, alpha).y >= spotOf(away, alpha).y ? away : home;
    const near = rear === home ? away : home;
    drawBody(rear, near);
    drawBody(near, rear);
  }

  function decay() {
    [home, away].forEach((fighter) => {
      fighter.recentClean *= 0.86;
      if (fighter.shield > 0) fighter.shield -= 1;
      if (fighter.open > 0) fighter.open -= 1;
      if (fighter.justAttacked > 0) fighter.justAttacked -= 1;
      if (fighter.wobble > 0) fighter.wobble -= 1;
      if (fighter.poseLeft > 0) fighter.poseLeft -= 1;
      fighter.balance = clamp(fighter.balance + 0.15, 0, 100);
    });
    if (spark && spark.life > 0) spark.life -= 1;
    if (bannerLeft > 0) bannerLeft -= 1;
    if (bannerLeft <= 0 && phase !== "finale") banner = "";
  }

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
      if (!home || phase === "finale") {
        render();
        return;
      }
      capture();
      decay();
      if (phase === "ready") beginRound();
      else if (phase === "bell") {
        bellLeft -= 1;
        moveBoth();
        if (bellLeft <= 0) phase = "active";
      } else if (phase === "rest") {
        restLeft -= 1;
        if (restLeft <= 0) beginRound();
      } else if (phase === "count" && count) {
        stepCount();
      } else if (phase === "active") {
        if (tickInRound >= FIGHT.ticks) endRound();
        else {
          tickInRound += 1;
          moveBoth();
          if (phase === "active" && tickInRound % 18 === 0) {
            [home, away].forEach((fighter) => {
              if (rng() < fighter.adaptability / 160) fighter.mode = chooseMode(fighter);
            });
          }
          if (phase === "active") exchange();
          if (phase === "active" && tickInRound >= FIGHT.ticks) endRound();
        }
      }
      render();
    },
    present(alpha) {
      if (phase === "finale") return;
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
      return { length: RING_M, width: RING_M + GAP_M + SKY_M };
    },
    bands() {
      const span = RING_M + GAP_M + SKY_M;
      const margin = 1;
      const top = margin;
      const bottom = Math.max(top + 2, rows - 1 - margin);
      const rowAt = (y) => clamp(Math.round(top + clamp(y, 0, 1) * (bottom - top)), 0, Math.max(0, rows - 1));
      const courtDot = rowAt(RING_M / span);
      const sideDot = rowAt((RING_M + GAP_M) / span);
      const charRows = Math.max(1, Math.floor(rows / 4));
      const courtRows = Math.min(charRows, Math.floor(courtDot / 4) + 1);
      const sideRow = Math.max(courtRows, Math.min(charRows, Math.floor(sideDot / 4)));
      return { courtRows, sideRow };
    },
    hud() {
      const won = tally();
      const cardFor = (fighter) => {
        if (!fighter) return null;
        const alert = fighter.down
          ? "Down"
          : fighter.cut >= 2
            ? "Cut"
            : fighter.swell > 50
              ? "Swollen"
              : zoneOf(fighter) === "ROPES" || zoneOf(fighter) === "CORNER"
                ? "Ropes"
                : fighter.stamina < 35
                  ? "Tired"
                  : fighter.stanceLabel;
        return {
          name: fighter.name,
          role: `${fighter.styleLabel} · ${alert}`,
          stamina: Math.round(fighter.stamina),
        };
      };
      return {
        home: won.home,
        away: won.away,
        homeName: home?.last || "Blue",
        awayName: away?.last || "Red",
        time: clockText(),
        period: periodText(),
        note: banner,
        homePlayer: cardFor(home),
        awayPlayer: cardFor(away),
      };
    },
    title() {
      const won = tally();
      return `boxing  ${home?.last || "Blue"} ${won.home} - ${won.away} ${away?.last || "Red"}  ${clockText()}  ${periodText()}`;
    },
    score() {
      if (!result) return `${home?.last || "Blue"} vs ${away?.last || "Red"}`;
      const listed = cards.map((card) => (
        result.winner === away?.last ? `${card.away}-${card.home}` : `${card.home}-${card.away}`
      )).join(" · ");
      if (result.method === "KO" || result.method === "TKO" || result.method === "DQ" || result.method === "RTD") {
        const detail = result.detail ? ` · ${result.detail}` : "";
        return `${result.winner} ${result.method} ${result.round}${detail}`;
      }
      if (!result.winner) return `${LABEL[result.method]} · ${listed}`;
      return `${result.winner} ${LABEL[result.method]} · ${listed}`;
    },
    get done() {
      return false;
    },
    get holding() {
      return phase === "finale";
    },
  };
}
