const STRAIGHT = 12;
const RADIUS = 4;
const LAP = 2 * STRAIGHT + 2 * Math.PI * RADIUS;
const LAPS = 4;
const LANES = 4;
const LANE_GAP = 2;
const WALL = 0.9;
const OUTER = 1.5 * LANE_GAP + WALL;
const SPAN_X = (STRAIGHT / 2 + RADIUS + OUTER) * 2 * 1.06;
const SPAN_Y = (RADIUS + OUTER) * 2 * 1.06;
const WHEEL_R = 0.0126;
const GRAVITY = 9.81;
const DT = 0.08;

const SECTIONS = [
  { type: "STRAIGHT", from: 0, to: 0.24, label: "the start straight" },
  { type: "CORNER", from: 0.24, to: 0.5, radius: 3.4, banking: 0.2, label: "the banked corner" },
  { type: "JUMP", from: 0.5, to: 0.56, label: "the jump" },
  { type: "LANDING", from: 0.56, to: 0.6, label: "the landing" },
  { type: "LANE_CHANGE", from: 0.6, to: 0.74, label: "the lane change" },
  { type: "CORNER", from: 0.74, to: 1, radius: 3.05, banking: 0.06, label: "the tight corner" },
];

const JUMP = SECTIONS.find((section) => section.type === "JUMP");
const LANDING = SECTIONS.find((section) => section.type === "LANDING");

const ROSTER = [
  {
    name: "Dash", archetype: "Speed", tone: "is-blue", ink: "blue", lane: 3,
    rpm: 35800, torque: 0.0049, gear: 3.15, mass: 0.136, drag: 0.0066,
    grip: 0.8, roller: 0.64, brake: 0.36, damper: 0.4, cg: 0.58,
  },
  {
    name: "Blaze", archetype: "Corner", tone: "is-red", ink: "red", lane: 0,
    rpm: 25200, torque: 0.0062, gear: 4.25, mass: 0.17, drag: 0.0101,
    grip: 1.02, roller: 0.93, brake: 0.84, damper: 0.74, cg: 0.3,
  },
  {
    name: "Aero", archetype: "Balance", tone: "is-yellow", ink: "yellow", lane: 2,
    rpm: 29800, torque: 0.0054, gear: 3.6, mass: 0.15, drag: 0.0082,
    grip: 0.86, roller: 0.76, brake: 0.6, damper: 0.64, cg: 0.46,
  },
  {
    name: "Bolt", archetype: "Technical", tone: "is-green", ink: "green", lane: 1,
    rpm: 27200, torque: 0.00512, gear: 3.95, mass: 0.178, drag: 0.0097,
    grip: 0.93, roller: 0.97, brake: 0.9, damper: 0.95, cg: 0.28,
  },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vary(rand, value, spread) {
  return value * (1 + (rand() - 0.5) * 2 * spread);
}

function sectionAt(distance) {
  const unit = ((distance % LAP) + LAP) % LAP / LAP;
  return SECTIONS.find((section) => unit >= section.from && unit < section.to) || SECTIONS[0];
}

function unitOf(distance) {
  return ((distance % LAP) + LAP) % LAP / LAP;
}

function nextLane(lane) {
  return (lane + 1) % LANES;
}

function shiftT(unit) {
  if (unit < JUMP.from || unit > LANDING.to) return null;
  const t = clamp((unit - JUMP.from) / (LANDING.to - JUMP.from), 0, 1);
  return t * t * (3 - 2 * t);
}

function displayLane(distance, lane) {
  const t = shiftT(unitOf(distance));
  if (t == null) return lane;
  return lane + (nextLane(lane) - lane) * t;
}

function poseAt(distance, lane) {
  const offset = (lane - 1.5) * LANE_GAP;
  const radius = RADIUS + offset;
  const along = ((distance % LAP) + LAP) % LAP;
  let x = 0;
  let y = 0;
  let heading = 0;
  if (along < STRAIGHT) {
    x = -STRAIGHT / 2 + along;
    y = -radius;
    heading = 0;
  } else if (along < STRAIGHT + Math.PI * RADIUS) {
    const theta = (along - STRAIGHT) / RADIUS;
    x = STRAIGHT / 2 + Math.sin(theta) * radius;
    y = -Math.cos(theta) * radius;
    heading = theta;
  } else if (along < 2 * STRAIGHT + Math.PI * RADIUS) {
    const travel = along - STRAIGHT - Math.PI * RADIUS;
    x = STRAIGHT / 2 - travel;
    y = radius;
    heading = Math.PI;
  } else {
    const theta = (along - 2 * STRAIGHT - Math.PI * RADIUS) / RADIUS;
    x = -STRAIGHT / 2 - Math.sin(theta) * radius;
    y = Math.cos(theta) * radius;
    heading = Math.PI + theta;
  }
  return { x, y, heading };
}

function toUnit(x, y) {
  return {
    x: clamp(0.5 + x / SPAN_X, 0.02, 0.98),
    y: clamp(0.5 - y / SPAN_Y, 0.02, 0.98),
  };
}

export function createMini4wd(seed = Math.floor(Math.random() * 0x7fffffff)) {
  const rand = mulberry32(seed);
  let cols = 48;
  let rows = 40;
  let cells = [];
  let clock = 0;
  let phase = "grid";
  let pause = 14;
  let finale = null;
  let confetti = [];
  let banner = "Start";
  let bannerLeft = 14;
  let leaderName = "";
  let voice = { text: "", tone: "neutral", until: 0 };
  const log = [];

  const cars = ROSTER.map((spec) => {
    const rpm = vary(rand, spec.rpm, 0.035);
    const grip = vary(rand, spec.grip, 0.05);
    const gear = spec.gear;
    return {
      ...spec,
      rpm,
      grip,
      brake: vary(rand, spec.brake, 0.05),
      damper: vary(rand, spec.damper, 0.04),
      soc: vary(rand, 1, 0.01),
      vTop: (rpm / 60) * 2 * Math.PI * WHEEL_R / gear,
      drive: (spec.torque * gear) / WHEEL_R,
      dragK: spec.drag,
      roll: 0.085 * spec.mass * GRAVITY,
      s: 0.45,
      speed: 0,
      lane: spec.lane,
      inChange: false,
      heading: 0,
      stability: 70 + spec.roller * 28,
      status: "RUNNING",
      sectionType: "STRAIGHT",
      air: false,
      airLeft: 0,
      airTime: 0,
      hop: 0,
      cooldown: 0,
      cut: 0,
      crashes: 0,
      walls: 0,
      laps: 0,
      lapMark: 0,
      best: 0,
      finish: 0,
      blocked: false,
      said: {},
      x: 0.5,
      y: 0.5,
      px: 0.5,
      py: 0.5,
    };
  });

  const clockText = () => {
    const total = Math.max(0, Math.floor(clock));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const recordParts = (parts) => {
    log.push({ time: clockText(), parts });
  };

  const say = (text, tone = "neutral", ticks = 26) => {
    voice = { text, tone, until: ticks };
  };

  const armBanner = (label, ticks = 16) => {
    banner = label;
    bannerLeft = ticks;
  };

  const narrate = () => {
    if (voice.until > 0) voice.until -= 1;
    if (voice.until <= 0) voice = { text: "", tone: "neutral", until: 0 };
  };

  const emit = (car, key, parts, line, tone, cooldown = 1.4) => {
    if (car && clock - (car.said[key] || -99) < cooldown) return;
    if (car) car.said[key] = clock;
    recordParts(parts);
    if (line) say(line, tone || car?.ink || "neutral", 28);
  };

  const ranked = () => [...cars].sort((a, b) => {
    const place = (car) => {
      if (car.status === "FINISHED") return 0;
      if (car.status === "DNF") return 2;
      return 1;
    };
    const delta = place(a) - place(b);
    if (delta) return delta;
    if (a.status === "FINISHED" && b.status === "FINISHED") return a.finish - b.finish;
    return b.s - a.s;
  });

  const cornerLimit = (car, section) => {
    const radius = section.radius || RADIUS;
    const raw = (car.grip * radius * GRAVITY * (1 + (section.banking || 0))) / (0.72 + car.cg);
    return Math.sqrt(Math.max(0.4, raw)) * (0.84 + 0.16 * car.roller);
  };

  const syncLane = (car) => {
    const type = sectionAt(car.s).type;
    const inside = type === "JUMP" || type === "LANDING";
    if (car.inChange && !inside) {
      const from = car.lane + 1;
      car.lane = nextLane(car.lane);
      car.inChange = false;
      return { from, to: car.lane + 1 };
    }
    car.inChange = inside;
    return null;
  };

  const place = (car) => {
    const swap = syncLane(car);
    const pose = poseAt(car.s, displayLane(car.s, car.lane));
    const unit = toUnit(pose.x, pose.y + car.hop);
    car.x = unit.x;
    car.y = unit.y;
    car.heading = pose.heading;
    return swap;
  };

  const park = (car) => {
    const swap = place(car);
    if (!swap) return;
    emit(
      car,
      "lane",
      [
        { text: car.name, tone: car.ink },
        { text: ` jumps from track ${swap.from} to track ${swap.to}`, tone: "kick" },
      ],
      `${car.name} jumps from track ${swap.from} to track ${swap.to}.`,
      "kick",
      0,
    );
    armBanner("Jump", 14);
  };

  const finishCar = (car) => {
    car.s = LAP * LAPS;
    car.speed = 0;
    car.status = "FINISHED";
    car.finish = clock;
    car.hop = 0;
    car.air = false;
    emit(
      car,
      "finish",
      [
        { text: car.name, tone: car.ink },
        { text: " finishes", tone: "goal" },
        { text: `  ${clock.toFixed(2)}s`, tone: "neutral" },
      ],
      `${car.name} crosses the line.`,
      car.ink,
      0,
    );
  };

  const crashCar = (car, reason) => {
    car.crashes += 1;
    car.speed *= 0.42;
    car.air = false;
    car.hop = 0;
    if (car.crashes >= 2 || car.stability <= 0) {
      car.status = "DNF";
      car.stability = 0;
      emit(
        car,
        "derail",
        [
          { text: car.name, tone: car.ink },
          { text: " leaves the track", tone: "foul" },
        ],
        `${car.name} is off the track.`,
        "foul",
        0,
      );
      armBanner("Off", 18);
      return;
    }
    car.status = "CRASHED";
    car.cooldown = 0.85;
    car.stability = 42;
    emit(
      car,
      "crash",
      [
        { text: car.name, tone: car.ink },
        { text: ` spins on ${reason}`, tone: "foul" },
      ],
      `${car.name} spins on ${reason}.`,
      "foul",
      0,
    );
    armBanner("Crash", 18);
  };

  const updateCar = (car) => {
    if (car.status === "FINISHED" || car.status === "DNF") {
      car.hop = 0;
      park(car);
      return;
    }
    const section = sectionAt(car.s);
    const entered = section.type !== car.sectionType;
    if (car.cooldown > 0) {
      car.cooldown -= DT;
      car.speed *= 0.96;
      car.s += Math.max(0, car.speed) * DT;
      if (car.cooldown <= 0 && car.status === "CRASHED") car.status = "RUNNING";
      car.sectionType = section.type;
      park(car);
      return;
    }

    car.soc = Math.max(0.86, car.soc - 0.0011 * DT * (0.4 + car.speed / 8));
    const top = car.vTop * car.soc;
    const ratio = clamp(car.speed / Math.max(0.2, top), 0, 1.15);
    const torque = Math.max(0, 1 - ratio ** 1.35);
    let drive = car.drive * torque * car.soc;
    if (car.cut > 0) {
      car.cut -= DT;
      drive *= 0.12;
    }
    const drag = car.dragK * car.speed * car.speed;
    let accel = (drive - drag - car.roll) / car.mass;

    const soon = sectionAt(car.s + 1.7);
    if (soon.type === "CORNER" && section.type !== "CORNER") {
      const limit = cornerLimit(car, soon);
      if (car.speed > limit * 1.02) accel -= 2.5 + car.brake * 11;
    }

    if (section.type === "CORNER") {
      const limit = cornerLimit(car, section);
      if (car.speed > limit) {
        const excess = car.speed - limit;
        accel -= excess * (6 + (1 - car.roller) * 10);
        car.stability -= excess * (1.15 - car.roller) * 7 * DT;
        if (rand() < excess * 0.016) {
          car.speed *= 0.78;
          car.cut = 0.24;
          car.stability -= 12 + rand() * 5;
          car.walls += 1;
          emit(
            car,
            "wall",
            [
              { text: car.name, tone: car.ink },
              { text: " clips the wall", tone: "foul" },
            ],
            `${car.name} clips the wall in ${section.label}.`,
            "foul",
            1.6,
          );
          armBanner("Wall", 14);
        }
      } else {
        car.stability += 10 * DT;
      }
    } else if (section.type === "STRAIGHT") {
      car.stability += 16 * DT;
    } else if (section.type === "LANE_CHANGE") {
      car.stability += 8 * DT;
    }

    if (entered && section.type === "JUMP" && !car.air) {
      car.air = true;
      car.airTime = 0.16 + car.speed * 0.038;
      car.airLeft = car.airTime;
      emit(
        car,
        "jump",
        [
          { text: car.name, tone: car.ink },
          { text: " takes the jump", tone: "kick" },
        ],
        "",
        "kick",
        1.2,
      );
      armBanner("Jump", 14);
    }

    if (car.air) {
      accel = -0.35;
      car.airLeft -= DT;
      const risen = 1 - car.airLeft / Math.max(0.05, car.airTime);
      car.hop = Math.sin(clamp(risen, 0, 1) * Math.PI) * 1.15;
      if (car.airLeft <= 0) {
        car.air = false;
        car.hop = 0;
        const shock = car.speed * (1.08 - car.damper) * (0.94 + rand() * 0.12);
        if (shock < 3.6) {
          car.stability += 4;
          emit(
            car,
            "land",
            [
              { text: car.name, tone: car.ink },
              { text: " lands clean", tone: "goal" },
            ],
            "",
            "goal",
            1.2,
          );
        } else if (shock < 7.4) {
          car.speed *= 0.86;
          car.stability -= 8;
          emit(
            car,
            "land",
            [
              { text: car.name, tone: car.ink },
              { text: " lands hard", tone: "foul" },
            ],
            `${car.name} lands hard after the jump.`,
            "foul",
            1.2,
          );
          armBanner("Hard", 14);
        } else {
          car.speed *= 0.72;
          car.stability -= 18;
          crashCar(car, "the landing");
        }
      }
    } else {
      car.hop = 0;
    }

    car.speed = Math.max(0, car.speed + accel * DT);
    let scale = 1;
    if (section.type === "CORNER") scale = 1 - (displayLane(car.s, car.lane) - 1.5) * 0.045;
    const before = car.s;
    car.s += car.speed * DT * scale;
    const lapBefore = Math.floor(before / LAP);
    const lapAfter = Math.floor(car.s / LAP);
    if (lapAfter > lapBefore) {
      const lapTime = clock - car.lapMark;
      car.best = car.best ? Math.min(car.best, lapTime) : lapTime;
      car.lapMark = clock;
      car.laps = lapAfter;
      if (lapAfter >= LAPS) finishCar(car);
      else {
        emit(
          car,
          `lap-${lapAfter}`,
          [
            { text: car.name, tone: car.ink },
            { text: ` lap ${lapAfter}`, tone: "neutral" },
            { text: `  ${lapTime.toFixed(2)}s`, tone: "goal" },
          ],
          "",
          car.ink,
          0,
        );
      }
    }

    car.stability = clamp(car.stability, 0, 100);
    if (car.cooldown <= 0 && car.status !== "FINISHED" && car.status !== "DNF" && car.status !== "CRASHED") {
      if (car.stability <= 8) crashCar(car, section.label);
      else if (car.stability < 32) car.status = "UNSTABLE";
      else if (car.stability < 58) car.status = "SLOW";
      else car.status = "RUNNING";
    }
    car.sectionType = section.type;
    park(car);
  };

  const resolveContacts = () => {
    const live = cars.filter((car) => car.status !== "DNF" && car.status !== "FINISHED");
    live.forEach((car) => {
      car.blocked = false;
    });
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i];
        const b = live[j];
        const gap = Math.abs(a.s - b.s);
        if (a.lane === b.lane && gap < 0.55 && gap > 0) {
          const lead = a.s >= b.s ? a : b;
          const rear = lead === a ? b : a;
          rear.blocked = true;
          if (rear.speed > lead.speed) rear.speed = lead.speed * 0.985;
          if (gap < 0.32) {
            rear.stability -= 6 * DT;
            lead.speed *= 0.995;
            emit(
              rear,
              "bump",
              [
                { text: rear.name, tone: rear.ink },
                { text: " runs into ", tone: "foul" },
                { text: lead.name, tone: lead.ink },
              ],
              `${rear.name} runs into ${lead.name}.`,
              "foul",
              1.8,
            );
          }
        }
      }
    }
  };

  const noteLead = () => {
    const leader = ranked()[0];
    if (!leader || leader.status === "DNF") return;
    const second = ranked()[1];
    if (second && leader.status !== "FINISHED" && leader.s - second.s < 0.7) return;
    if (leader.name === leaderName) return;
    const previous = leaderName;
    leaderName = leader.name;
    if (!previous || phase !== "race") return;
    emit(
      leader,
      "lead",
      [
        { text: leader.name, tone: leader.ink },
        { text: " takes the lead", tone: "goal" },
      ],
      `${leader.name} takes the lead.`,
      "goal",
      0,
    );
    armBanner("Lead", 16);
  };

  const capture = () => {
    cars.forEach((car) => {
      car.px = car.x;
      car.py = car.y;
    });
  };

  const spotOf = (car, alpha) => {
    const dx = car.x - car.px;
    const dy = car.y - car.py;
    if (!(alpha < 1) || dx * dx + dy * dy > 0.04) return { x: car.x, y: car.y };
    return { x: car.px + dx * alpha, y: car.py + dy * alpha };
  };

  const bounds = () => {
    const marginX = 3;
    const marginY = 3;
    const availW = Math.max(4, cols - marginX * 2);
    const availH = Math.max(4, rows - marginY * 2);
    const ratio = cols / Math.max(1, rows);
    let innerW = availW;
    let innerH = innerW / ratio;
    if (innerH > availH) {
      innerH = availH;
      innerW = innerH * ratio;
    }
    const left = Math.round((cols - innerW) / 2);
    const top = Math.round((rows - innerH) / 2);
    const right = Math.min(cols - 1, left + Math.round(innerW));
    const bottom = Math.min(rows - 1, top + Math.round(innerH));
    return { left, right: Math.max(left + 2, right), top, bottom: Math.max(top + 2, bottom) };
  };

  const pitchToCell = (x, y) => {
    const box = bounds();
    return {
      col: clamp(Math.round(box.left + clamp(x, 0, 1) * (box.right - box.left)), 0, cols - 1),
      row: clamp(Math.round(box.top + clamp(y, 0, 1) * (box.bottom - box.top)), 0, rows - 1),
    };
  };

  const drawTrack = () => {
    const bridgeDots = new Set();
    const paint = (col, row, tone, bridge = false) => {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      const cell = cells[row * cols + col];
      if (!cell || cell.glyph) return;
      cell.lit = true;
      cell.tone = tone;
      if (bridge) bridgeDots.add(`${col},${row}`);
    };
    const stroke = (x0, y0, x1, y1, tone, bridge = false) => {
      const from = pitchToCell(x0, y0);
      const to = pitchToCell(x1, y1);
      const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row), 1);
      for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        paint(
          Math.round(from.col + (to.col - from.col) * t),
          Math.round(from.row + (to.row - from.row) * t),
          tone,
          bridge,
        );
      }
    };
    const inkOf = (unit) => {
      const type = sectionAt(unit * LAP).type;
      if (type !== "CORNER") return "is-white";
      return unit < 0.62 ? "is-blue" : "is-red";
    };
    const drawSpan = (from, to, laneAt, toneAt, bridge = false) => {
      const steps = Math.max(8, Math.round((to - from) * 200));
      let previous = null;
      for (let step = 0; step <= steps; step += 1) {
        const unit = from + (to - from) * (step / steps);
        const lane = laneAt(unit);
        if (lane == null) {
          previous = null;
          continue;
        }
        const pose = poseAt(unit * LAP, lane);
        const point = toUnit(pose.x, pose.y);
        if (previous) stroke(previous.x, previous.y, point.x, point.y, toneAt(unit), bridge);
        previous = point;
      }
    };
    const walls = [-0.5, 0.5, 1.5, 2.5, LANES - 1 + 0.5];
    walls.forEach((wall) => {
      drawSpan(0, JUMP.from, () => wall, inkOf);
      drawSpan(LANDING.to, 1, () => wall, inkOf);
    });
    const bridgeSteps = 64;
    for (let step = 0; step <= bridgeSteps; step += 1) {
      const unit = JUMP.from + (LANDING.to - JUMP.from) * (step / bridgeSteps);
      const t = shiftT(unit);
      if (t == null) continue;
      const start = 2.5 + (-0.5 - 2.5) * t;
      const end = 3.5 + (0.5 - 3.5) * t;
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const lanes = Math.max(1, Math.ceil((hi - lo) / 0.06));
      for (let index = 0; index <= lanes; index += 1) {
        const pose = poseAt(unit * LAP, lo + (hi - lo) * (index / lanes));
        const point = toUnit(pose.x, pose.y);
        const dot = pitchToCell(point.x, point.y);
        paint(dot.col, dot.row, "is-yellow", true);
      }
    }
    bridgeDots.forEach((key) => {
      const [col, row] = key.split(",").map(Number);
      const originCol = col - (col % 2);
      const originRow = row - (row % 4);
      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const id = `${originCol + dx},${originRow + dy}`;
          if (bridgeDots.has(id)) continue;
          const cell = cells[(originRow + dy) * cols + originCol + dx];
          if (cell && !cell.glyph) cell.lit = false;
        }
      }
    });
    const charOf = (x, y) => {
      const dot = pitchToCell(x, y);
      return { col: Math.floor(dot.col / 2), row: Math.floor(dot.row / 4) };
    };
    for (let lane = 0; lane < LANES; lane += 1) {
      const label = poseAt(STRAIGHT * 0.55, lane);
      const spot = charOf(toUnit(label.x, label.y).x, toUnit(label.x, label.y).y);
      const charCols = Math.max(1, Math.floor(cols / 2));
      const charRows = Math.max(1, Math.floor(rows / 4));
      if (spot.col < 0 || spot.row < 0 || spot.col >= charCols || spot.row >= charRows) continue;
      cells[spot.row * 4 * cols + spot.col * 2] = { lit: true, tone: "is-white", glyph: String(lane + 1) };
    }
    const inner = toUnit(poseAt(0.015 * LAP, -0.5).x, poseAt(0.015 * LAP, -0.5).y);
    const outer = toUnit(poseAt(0.015 * LAP, LANES - 1 + 0.5).x, poseAt(0.015 * LAP, LANES - 1 + 0.5).y);
    stroke(inner.x, inner.y, outer.x, outer.y, "is-white");
  };

  const drawCar = (car, alpha) => {
    const heading = ((car.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const facing = Math.round(heading / (Math.PI / 2)) % 4;
    const tone = car.status === "DNF" ? "is-gray" : car.tone;
    const lane = displayLane(car.s, car.lane);
    const crossing = sectionAt(car.s).type;
    if (car.lane !== LANES - 1 && (crossing === "JUMP" || crossing === "LANDING")) return [];
    const center = pitchToCell(toUnit(poseAt(car.s, lane).x, poseAt(car.s, lane).y).x, toUnit(poseAt(car.s, lane).x, poseAt(car.s, lane).y).y);
    const above = pitchToCell(toUnit(poseAt(car.s, lane - 0.5).x, poseAt(car.s, lane - 0.5).y).x, toUnit(poseAt(car.s, lane - 0.5).x, poseAt(car.s, lane - 0.5).y).y);
    const below = pitchToCell(toUnit(poseAt(car.s, lane + 0.5).x, poseAt(car.s, lane + 0.5).y).x, toUnit(poseAt(car.s, lane + 0.5).x, poseAt(car.s, lane + 0.5).y).y);
    const midRow = Math.round((above.row + below.row) / 2);
    const midCol = Math.round((above.col + below.col) / 2);
    const wide = Math.abs(below.row - above.row) >= 5 || Math.abs(below.col - above.col) >= 5;
    const marks = new Set();
    const dot = (col, row, ink) => {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      cells[row * cols + col] = { lit: true, tone: ink, glyph: "" };
      marks.add(`${Math.floor(col / 2)},${Math.floor(row / 4)}`);
    };
    const along = facing === 0 || facing === 2;
    const dir = facing === 0 || facing === 3 ? 1 : -1;
    for (let i = -3; i <= 2; i += 1) {
      const ink = i < -1 ? "is-white" : tone;
      if (along) {
        dot(center.col + i, midRow, ink);
        if (wide) dot(center.col + i, midRow + (midRow >= center.row ? 1 : -1), ink);
      } else {
        dot(midCol, center.row + dir * i, ink);
        if (wide) dot(midCol + 1, center.row + dir * i, ink);
      }
    }
    return [...marks].map((key) => key.split(",").map(Number));
  };

  const render = (alpha = 1) => {
    cells = Array.from({ length: cols * rows }, () => ({ lit: false, tone: "", glyph: "" }));
    drawTrack();
    const charCols = Math.max(1, Math.floor(cols / 2));
    const charRows = Math.max(1, Math.floor(rows / 4));
    const charAt = (x, y) => {
      const dot = pitchToCell(x, y);
      return {
        col: clamp(Math.floor(dot.col / 2), 0, charCols - 1),
        row: clamp(Math.floor(dot.row / 4), 0, charRows - 1),
      };
    };
    const taken = new Set();
    const stamp = (col, row, glyph, tone) => {
      if (col < 0 || row < 0 || col >= charCols || row >= charRows) return false;
      const key = `${col},${row}`;
      if (taken.has(key)) return false;
      cells[row * 4 * cols + col * 2] = { lit: true, tone, glyph };
      taken.add(key);
      return true;
    };
    const cellsFor = (nameCol, nameRow, name) => {
      const spots = [];
      for (let index = 0; index < name.length; index += 1) spots.push([nameCol + index, nameRow]);
      return spots;
    };
    const freeAt = (nameCol, nameRow, name) => cellsFor(nameCol, nameRow, name).every(([letterCol, letterRow]) => {
      if (letterRow < 0 || letterRow >= charRows || letterCol < 0 || letterCol >= charCols) return false;
      return !taken.has(`${letterCol},${letterRow}`);
    });
    const order = [...cars].reverse();
    const drawn = order.map((car) => ({ car, marks: drawCar(car, alpha) }));
    drawn.forEach(({ marks }) => marks.forEach(([col, row]) => taken.add(`${col},${row}`)));
    drawn.forEach(({ car, marks }) => {
      const spot = spotOf(car, alpha);
      const name = car.name;
      const rowsUsed = marks.map(([, row]) => row);
      const colsUsed = marks.map(([col]) => col);
      const midRow = rowsUsed.length ? rowsUsed[Math.floor(rowsUsed.length / 2)] : charAt(spot.x, spot.y).row;
      const minCol = colsUsed.length ? Math.min(...colsUsed) : charAt(spot.x, spot.y).col;
      const maxCol = colsUsed.length ? Math.max(...colsUsed) : minCol;
      const beside = spot.x < 0.5 ? [minCol - name.length, maxCol + 1] : [maxCol + 1, minCol - name.length];
      const options = [];
      beside.forEach((col) => {
        options.push([col, midRow]);
        for (let step = 1; step < charRows; step += 1) options.push([col, midRow - step], [col, midRow + step]);
      });
      const found = options.find(([col, row]) => freeAt(col, row, name));
      const [nameCol, placeRow] = found || [clamp(maxCol + 1, 0, Math.max(0, charCols - name.length)), midRow];
      const tone = car.status === "DNF" ? "is-gray" : car.tone;
      cellsFor(nameCol, placeRow, name).forEach(([letterCol, letterRow], index) => {
        stamp(letterCol, letterRow, name[index], tone);
      });
    });
    confetti.forEach((bit) => {
      const spot = charAt(bit.x, bit.y);
      const index = spot.row * 4 * cols + spot.col * 2;
      if (cells[index]?.glyph) return;
      stamp(spot.col, spot.row, bit.glyph, bit.tone);
    });
  };

  const beginFinale = () => {
    if (finale) return;
    phase = "end";
    const winner = ranked().find((car) => car.status === "FINISHED");
    finale = { name: winner?.name || "", tick: 0 };
    confetti = [];
    armBanner("Enter · new match    Esc · exit", 100000);
    const line = ranked()
      .map((car) => `${car.name} ${car.status === "DNF" ? "DNF" : `${car.finish.toFixed(2)}s`}`)
      .join(", ");
    say(
      winner ? `${winner.name} wins the race. ${line}.` : `No car finishes. ${line}.`,
      winner?.ink || "neutral",
      100000,
    );
    recordParts([{ text: "Finish", tone: "neutral" }]);
  };

  const parade = () => {
    finale.tick += 1;
    const winner = cars.find((car) => car.name === finale.name);
    if (winner) {
      winner.s += 7.2 * DT;
      winner.hop = 0;
      place(winner);
    }
    confetti.forEach((bit) => {
      bit.x = clamp(bit.x + bit.vx, 0.02, 0.98);
      bit.y += bit.vy;
    });
    confetti = confetti.filter((bit) => bit.y < 1.05);
    if (confetti.length >= 48) return;
    const tones = ["is-yellow", "is-white", winner?.tone || "is-green"];
    const glyphs = ["*", "+", "·", "x"];
    for (let n = 0; n < 2; n += 1) {
      confetti.push({
        x: 0.08 + rand() * 0.84,
        y: -0.04 - rand() * 0.08,
        vy: 0.012 + rand() * 0.016,
        vx: (rand() - 0.5) * 0.01,
        glyph: glyphs[Math.floor(rand() * glyphs.length)],
        tone: tones[Math.floor(rand() * tones.length)],
      });
    }
  };

  const roleFor = (car) => {
    const track = car.inChange
      ? `Track ${car.lane + 1}→${nextLane(car.lane) + 1}`
      : `Track ${car.lane + 1}`;
    if (car.status === "DNF") return `Off · ${track}`;
    if (car.status === "FINISHED") return `Finished · ${track}`;
    if (car.status === "CRASHED") return `Crashed · ${track}`;
    if (car.status === "UNSTABLE") return `Unstable · ${track}`;
    if (car.status === "SLOW") return `Slow · ${track}`;
    return `${car.archetype} · ${track}`;
  };

  const cardFor = (car) => {
    if (!car) return null;
    return {
      name: car.name,
      role: roleFor(car),
      battery: Math.round(clamp(car.soc, 0, 1) * 100),
      speed: car.speed,
      tone: car.status === "DNF" ? "is-gray" : car.tone,
    };
  };

  cars.forEach(place);

  return {
    reset(nextCols, nextRows) {
      cols = Math.max(8, nextCols);
      rows = Math.max(8, nextRows);
      if (phase === "grid" && pause === 14 && !log.length) {
        recordParts([{ text: "Start", tone: "neutral" }]);
        say("Four cars line up. The result is still open.", "neutral", 20);
      }
      render();
    },
    step() {
      narrate();
      if (finale) {
        parade();
        render();
        return;
      }
      capture();
      if (bannerLeft > 0) bannerLeft -= 1;
      if (bannerLeft <= 0 && phase === "race") banner = "";
      if (phase === "grid") {
        pause -= 1;
        if (pause <= 0) {
          phase = "race";
          leaderName = ranked()[0].name;
          armBanner("Go", 12);
          say("They launch down the straight.", "kick", 22);
        }
        render();
        return;
      }
      clock += DT;
      cars.forEach(updateCar);
      resolveContacts();
      noteLead();
      if (cars.every((car) => car.status === "FINISHED" || car.status === "DNF")) beginFinale();
      render();
    },
    present(alpha) {
      if (finale) return;
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
      return { length: SPAN_X, width: SPAN_Y };
    },
    hud() {
      const order = ranked();
      const leader = order[0];
      const chaser = order[1];
      const lap = leader ? Math.min(LAPS, Math.floor(leader.s / LAP) + 1) : 1;
      const gap = leader && chaser && leader.status !== "DNF" && chaser.status !== "DNF"
        ? `+${Math.max(0, leader.s - chaser.s).toFixed(1)}m`
        : "";
      return {
        leader: leader?.name || "",
        leaderTone: leader?.tone || "is-blue",
        chaser: chaser?.name || "",
        chaserTone: chaser?.tone || "is-red",
        gap: finale && leader?.finish ? `${leader.finish.toFixed(2)}s` : gap,
        time: clockText(),
        period: finale ? "Finish" : `Lap ${lap}/${LAPS}`,
        note: banner,
        field: order.map((car, index) => ({
          ...cardFor(car),
          name: `${index + 1} ${car.name}`,
        })),
      };
    },
    score() {
      return ranked()
        .map((car) => `${car.name} ${car.status === "DNF" ? "DNF" : `${(car.finish || clock).toFixed(2)}s`}`)
        .join("  ");
    },
    get done() {
      return false;
    },
    get holding() {
      return Boolean(finale);
    },
  };
}
