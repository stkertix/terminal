const SHEET = {
  Neuer: { passing: 78, finishing: 18, tackling: 28, pace: 64, handling: 92 },
  Lahm: { passing: 82, finishing: 32, tackling: 80, pace: 76, handling: 22 },
  Ramos: { passing: 70, finishing: 48, tackling: 86, pace: 78, handling: 24 },
  Puyol: { passing: 64, finishing: 28, tackling: 88, pace: 70, handling: 20 },
  Alba: { passing: 78, finishing: 36, tackling: 74, pace: 86, handling: 18 },
  Xavi: { passing: 94, finishing: 52, tackling: 62, pace: 68, handling: 16 },
  Iniesta: { passing: 92, finishing: 64, tackling: 48, pace: 76, handling: 16 },
  Modric: { passing: 90, finishing: 68, tackling: 66, pace: 74, handling: 16 },
  Kaka: { passing: 82, finishing: 80, tackling: 36, pace: 86, handling: 14 },
  Messi: { passing: 90, finishing: 94, tackling: 28, pace: 84, handling: 12 },
  Suarez: { passing: 74, finishing: 90, tackling: 42, pace: 80, handling: 14 },
  Casillas: { passing: 70, finishing: 16, tackling: 24, pace: 66, handling: 90 },
  Alves: { passing: 78, finishing: 40, tackling: 76, pace: 84, handling: 20 },
  Silva: { passing: 72, finishing: 34, tackling: 84, pace: 72, handling: 22 },
  Pique: { passing: 74, finishing: 38, tackling: 82, pace: 70, handling: 22 },
  Marcelo: { passing: 80, finishing: 42, tackling: 72, pace: 84, handling: 18 },
  Kroos: { passing: 90, finishing: 70, tackling: 58, pace: 64, handling: 16 },
  Busquets: { passing: 88, finishing: 40, tackling: 78, pace: 62, handling: 18 },
  Gerrard: { passing: 82, finishing: 76, tackling: 74, pace: 74, handling: 16 },
  Zidane: { passing: 90, finishing: 78, tackling: 52, pace: 78, handling: 14 },
  Ronaldo: { passing: 76, finishing: 92, tackling: 34, pace: 90, handling: 12 },
  Henry: { passing: 78, finishing: 90, tackling: 36, pace: 88, handling: 14 },
  Pirlo: { passing: 92, finishing: 72, tackling: 48, pace: 60, handling: 16 },
  Ronaldinho: { passing: 86, finishing: 84, tackling: 32, pace: 86, handling: 14 },
  Beckham: { passing: 88, finishing: 74, tackling: 50, pace: 72, handling: 16 },
  Cannavaro: { passing: 62, finishing: 26, tackling: 90, pace: 78, handling: 22 },
  Cafu: { passing: 74, finishing: 38, tackling: 76, pace: 88, handling: 18 },
  Nedved: { passing: 78, finishing: 80, tackling: 64, pace: 82, handling: 14 },
  Seedorf: { passing: 82, finishing: 74, tackling: 68, pace: 74, handling: 16 },
  Maldini: { passing: 76, finishing: 30, tackling: 90, pace: 78, handling: 22 },
  Carlos: { passing: 78, finishing: 62, tackling: 70, pace: 88, handling: 18 },
  Figo: { passing: 84, finishing: 76, tackling: 40, pace: 84, handling: 14 },
};

const ROLE_BASE = {
  gk: { passing: 58, finishing: 14, tackling: 22, pace: 58, handling: 80 },
  def: { passing: 64, finishing: 30, tackling: 76, pace: 70, handling: 20 },
  mid: { passing: 76, finishing: 58, tackling: 60, pace: 72, handling: 16 },
  fwd: { passing: 70, finishing: 80, tackling: 34, pace: 80, handling: 14 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function attributes(name, role, scale = 1) {
  const base = SHEET[name] || ROLE_BASE[role] || ROLE_BASE.mid;
  const tune = (value) => clamp(Math.round(value * scale), 8, 99);
  return {
    passing: tune(base.passing),
    finishing: tune(base.finishing),
    tackling: tune(base.tackling),
    pace: tune(base.pace),
    handling: tune(base.handling),
  };
}

export function paceFactor(pace) {
  return 0.88 + (pace / 100) * 0.24;
}

export function passMissChance(passing, shaken) {
  const base = clamp(0.35 - (passing - 70) * 0.004, 0.12, 0.55);
  return shaken ? Math.min(0.72, base * 1.35) : base;
}

export function wideChance(finishing) {
  return clamp(0.4 - finishing * 0.004, 0.04, 0.45);
}

export function tackleFoulChance(tackling) {
  return clamp(0.55 - tackling * 0.0035, 0.1, 0.55);
}

export function tackleWinChance(tackling) {
  return clamp(0.82 - (70 - tackling) * 0.004, 0.5, 0.95);
}

export function parryChance(handling) {
  return clamp(0.78 - handling * 0.004, 0.15, 0.7);
}

export function shotWindow(tactic, state) {
  let open = 0.74;
  let close = 0.9;
  if (tactic === "High Press") {
    open = 0.66;
    close = 0.84;
  }
  if (tactic === "Low Block") {
    open = 0.84;
    close = 0.94;
  }
  if (state.leading) {
    open += 0.06;
    close += 0.04;
  }
  if (state.trailing) {
    open -= 0.06;
    close -= 0.04;
  }
  if (state.late) open -= 0.08;
  if (state.home) {
    open -= 0.02;
    close -= 0.01;
  }
  return {
    open: clamp(open, 0.55, 0.96),
    close: clamp(close, 0.7, 0.98),
  };
}

export function lineShift(tactic, state) {
  let shift = 0;
  if (tactic === "High Press") shift += 0.06;
  if (tactic === "Low Block") shift -= 0.08;
  if (state.leading) shift -= 0.05;
  if (state.trailing) shift += 0.04;
  return shift;
}

export function pressCount(tactic) {
  if (tactic === "High Press") return 4;
  if (tactic === "Low Block") return 2;
  return 3;
}

export function xgOf(x, y, facesRight) {
  const goalX = facesRight ? 1 : 0;
  const meters = Math.hypot((goalX - x) * 105, (0.5 - y) * 68);
  const centrality = 1 - Math.min(1, Math.abs(y - 0.5) / 0.42);
  const distance = Math.exp(-Math.max(0, meters - 8) / 12);
  return Math.min(0.78, Math.max(0.02, distance * (0.32 + 0.68 * centrality)));
}
