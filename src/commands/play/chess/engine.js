import { attacked, inCheck, legalMoves, make, pieceKind, unmake } from "./rules.js";

const VAL = [0, 100, 320, 330, 500, 900, 0];

const PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  8, 12, 8, -8, -8, 8, 12, 8,
  6, 4, -4, 4, 4, -4, 4, 6,
  4, 4, 8, 18, 18, 8, 4, 4,
  8, 8, 12, 22, 22, 12, 8, 8,
  16, 16, 20, 28, 28, 20, 16, 16,
  40, 40, 40, 40, 40, 40, 40, 40,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT = [
  -48, -36, -28, -28, -28, -28, -36, -48,
  -36, -16, 0, 4, 4, 0, -16, -36,
  -24, 4, 12, 16, 16, 12, 4, -24,
  -24, 2, 14, 20, 20, 14, 2, -24,
  -24, 6, 14, 20, 20, 14, 6, -24,
  -24, 4, 10, 14, 14, 10, 4, -24,
  -36, -14, 0, 4, 4, 0, -14, -36,
  -48, -36, -24, -24, -24, -24, -36, -48,
];

const BISHOP = [
  -18, -8, -8, -8, -8, -8, -8, -18,
  -8, 4, 0, 0, 0, 0, 4, -8,
  -8, 8, 8, 8, 8, 8, 8, -8,
  -8, 0, 8, 12, 12, 8, 0, -8,
  -8, 4, 6, 12, 12, 6, 4, -8,
  -8, 8, 8, 8, 8, 8, 8, -8,
  -8, 4, 0, 0, 0, 0, 4, -8,
  -18, -8, -8, -8, -8, -8, -8, -18,
];

const ROOK = [
  0, 0, 4, 8, 8, 4, 0, 0,
  -4, 0, 0, 0, 0, 0, 0, -4,
  -4, 0, 0, 0, 0, 0, 0, -4,
  -4, 0, 0, 0, 0, 0, 0, -4,
  -4, 0, 0, 0, 0, 0, 0, -4,
  -4, 0, 0, 0, 0, 0, 0, -4,
  4, 8, 8, 8, 8, 8, 8, 4,
  0, 0, 4, 8, 8, 4, 0, 0,
];

const QUEEN = [
  -16, -8, -8, -4, -4, -8, -8, -16,
  -8, 0, 0, 0, 0, 0, 0, -8,
  -8, 0, 4, 4, 4, 4, 0, -8,
  -4, 0, 4, 4, 4, 4, 0, -4,
  0, 0, 4, 4, 4, 4, 0, -4,
  -8, 4, 4, 4, 4, 4, 0, -8,
  -8, 0, 4, 0, 0, 0, 0, -8,
  -16, -8, -8, -4, -4, -8, -8, -16,
];

const KING_MG = [
  -30, -20, 18, -12, -4, -12, 24, -22,
  -22, -18, -12, -16, -16, -12, -18, -22,
  -32, -28, -28, -28, -28, -28, -28, -32,
  -36, -32, -32, -36, -36, -32, -32, -36,
  -40, -36, -36, -40, -40, -36, -36, -40,
  -44, -40, -40, -44, -44, -40, -40, -44,
  -48, -44, -44, -48, -48, -44, -44, -48,
  -52, -48, -48, -52, -52, -48, -48, -52,
];

const KING_EG = [
  -48, -28, -20, -16, -16, -20, -28, -48,
  -28, -8, 4, 8, 8, 4, -8, -28,
  -20, 4, 16, 22, 22, 16, 4, -20,
  -16, 8, 22, 28, 28, 22, 8, -16,
  -16, 8, 22, 28, 28, 22, 8, -16,
  -20, 4, 16, 22, 22, 16, 4, -20,
  -28, -8, 4, 8, 8, 4, -8, -28,
  -48, -28, -20, -16, -16, -20, -28, -48,
];

const PASS = [0, 8, 14, 24, 40, 62, 92, 0];
const PST = [null, PAWN, KNIGHT, BISHOP, ROOK, QUEEN];

function mirrorIndex(sq, white) {
  const file = sq & 7;
  const rank = sq >> 4;
  return (white ? rank : 7 - rank) * 8 + file;
}

export function evaluate(pos) {
  const board = pos.board;
  const pawns = [new Uint8Array(8), new Uint8Array(8)];
  const rooks = [];
  let score = 0;
  let phase = 0;
  let mg = 0;
  let eg = 0;
  const bishops = [0, 0];
  const queens = [0, 0];
  for (let sq = 0; sq < 120; sq += 1) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const piece = board[sq];
    if (!piece) continue;
    const white = piece < 8;
    const kind = pieceKind(piece);
    const sign = white ? 1 : -1;
    const file = sq & 7;
    const idx = mirrorIndex(sq, white);
    if (kind === 1) pawns[white ? 0 : 1][file] |= 1 << (sq >> 4);
    else if (kind === 2) phase += 1;
    else if (kind === 3) {
      phase += 1;
      bishops[white ? 0 : 1] += 1;
    } else if (kind === 4) {
      phase += 2;
      rooks.push(sq);
    } else if (kind === 5) {
      phase += 4;
      queens[white ? 0 : 1] += 1;
    }
    if (kind === 6) {
      mg += sign * KING_MG[idx];
      eg += sign * KING_EG[idx];
    } else score += sign * (VAL[kind] + PST[kind][idx]);
  }
  if (bishops[0] >= 2) score += 28;
  if (bishops[1] >= 2) score -= 28;
  for (let color = 0; color < 2; color += 1) {
    const sign = color === 0 ? 1 : -1;
    const mine = pawns[color];
    const enemy = pawns[color ^ 1];
    for (let file = 0; file < 8; file += 1) {
      const bits = mine[file];
      if (!bits) continue;
      let count = 0;
      for (let rank = 0; rank < 8; rank += 1) {
        if ((bits & (1 << rank)) === 0) continue;
        count += 1;
        const ahead = color === 0 ? (0xff << (rank + 1)) : (1 << rank) - 1;
        let passed = true;
        for (let f = file - 1; f <= file + 1; f += 1) {
          if (f < 0 || f > 7) continue;
          if (enemy[f] & ahead) {
            passed = false;
            break;
          }
        }
        if (passed) score += sign * PASS[color === 0 ? rank : 7 - rank];
      }
      if (count > 1) score += sign * -14 * (count - 1);
      const left = file > 0 ? mine[file - 1] : 0;
      const right = file < 7 ? mine[file + 1] : 0;
      if (!left && !right) score += sign * -16;
    }
  }
  for (let i = 0; i < rooks.length; i += 1) {
    const sq = rooks[i];
    const white = board[sq] < 8;
    const file = sq & 7;
    const sign = white ? 1 : -1;
    const mine = pawns[white ? 0 : 1][file];
    const enemy = pawns[white ? 1 : 0][file];
    if (!mine && !enemy) score += sign * 16;
    else if (!mine) score += sign * 8;
  }
  for (let color = 0; color < 2; color += 1) {
    const white = color === 0;
    const king = white ? pos.kingW : pos.kingB;
    if (king < 0) continue;
    const sign = white ? 1 : -1;
    const file = king & 7;
    const dir = white ? 16 : -16;
    const pawn = white ? 1 : 9;
    let shield = 0;
    for (let df = -1; df <= 1; df += 1) {
      if (file + df < 0 || file + df > 7) continue;
      const front = king + dir + df;
      if ((front & 0x88) === 0 && board[front] === pawn) shield += 12;
    }
    score += sign * shield;
    const mine = pawns[color][file];
    const enemy = pawns[color ^ 1][file];
    if (!mine) score += sign * (enemy ? -12 : -22);
    if (queens[color ^ 1] && file > 2 && file < 5 && ((white && (king >> 4) < 2) || (!white && (king >> 4) > 5))) {
      score += sign * -18;
    }
  }
  const taper = Math.min(phase, 24) / 24;
  return Math.round(score + mg * taper + eg * (1 - taper));
}

export function sideEval(pos) {
  const white = evaluate(pos);
  return pos.side === "w" ? white : -white;
}

function moveOrder(move) {
  let score = 0;
  if (move.captured) {
    const victim = VAL[pieceKind(move.captured)];
    const attacker = VAL[pieceKind(move.piece)];
    score += 1000 + victim * 10 - attacker;
  }
  if (move.promo) score += 800 + VAL[pieceKind(move.promo)];
  if (move.flag === 2) score += 40;
  return score;
}

function orderMoves(moves) {
  moves.sort((a, b) => moveOrder(b) - moveOrder(a));
}

function quiesce(pos, ply, alpha, beta, nodes, qDepth) {
  nodes.n += 1;
  if (nodes.n >= nodes.cap) return sideEval(pos);
  const king = pos.side === "w" ? pos.kingW : pos.kingB;
  const checked = attacked(pos.board, king, pos.side === "b");
  if (!checked) {
    const stand = sideEval(pos);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
  }
  if (qDepth > 4) return alpha;
  const moves = legalMoves(pos).filter((move) => checked || move.captured || move.promo);
  if (!moves.length) {
    if (checked) return -20000 + ply;
    return alpha;
  }
  orderMoves(moves);
  for (let i = 0; i < moves.length; i += 1) {
    if (nodes.n >= nodes.cap) break;
    const undo = make(pos, moves[i]);
    const score = -quiesce(pos, ply + 1, -beta, -alpha, nodes, qDepth + 1);
    unmake(pos, moves[i], undo);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(pos, depth, ply, alpha, beta, nodes) {
  if (nodes.n >= nodes.cap) return sideEval(pos);
  if (depth <= 0) return quiesce(pos, ply, alpha, beta, nodes, 0);
  nodes.n += 1;
  const moves = legalMoves(pos);
  if (!moves.length) {
    const king = pos.side === "w" ? pos.kingW : pos.kingB;
    return attacked(pos.board, king, pos.side === "b") ? -20000 + ply : 0;
  }
  orderMoves(moves);
  for (let i = 0; i < moves.length; i += 1) {
    const undo = make(pos, moves[i]);
    const score = -negamax(pos, depth - 1, ply + 1, -beta, -alpha, nodes);
    unmake(pos, moves[i], undo);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function attackedByPawn(board, sq, byWhite) {
  if (byWhite) {
    return ((sq - 15) & 0x88) === 0 && board[sq - 15] === 1
      || ((sq - 17) & 0x88) === 0 && board[sq - 17] === 1;
  }
  return ((sq + 15) & 0x88) === 0 && board[sq + 15] === 9
    || ((sq + 17) & 0x88) === 0 && board[sq + 17] === 9;
}

function exposed(pos, square) {
  const piece = pos.board[square];
  if (!piece || pieceKind(piece) === 6) return 0;
  const white = piece < 8;
  if (!attacked(pos.board, square, !white)) return 0;
  const value = VAL[pieceKind(piece)];
  if (!attacked(pos.board, square, white)) return value;
  if (attackedByPawn(pos.board, square, !white) && pieceKind(piece) !== 1) return Math.max(80, value - 120);
  return 0;
}

export function analyze(pos, depth, candidateLimit, nodeCap) {
  const moves = legalMoves(pos);
  if (!moves.length) return [];
  const scored = moves.map((move) => {
    const undo = make(pos, move);
    let score = -sideEval(pos);
    const check = inCheck(pos);
    score -= exposed(pos, move.to);
    unmake(pos, move, undo);
    const order = score + (check ? 60 : 0) + (move.captured ? 35 : 0) + (move.promo ? 80 : 0);
    return { move, score, searched: false, order };
  });
  scored.sort((a, b) => b.order - a.order);
  const nodes = { n: 0, cap: nodeCap };
  const full = Math.min(scored.length, candidateLimit);
  for (let i = 0; i < full; i += 1) {
    if (nodes.n >= nodes.cap) break;
    const undo = make(pos, scored[i].move);
    scored[i].score = -negamax(pos, Math.max(0, depth - 1), 1, -30000, 30000, nodes);
    scored[i].searched = true;
    unmake(pos, scored[i].move, undo);
  }
  scored.forEach((row) => {
    if (!row.searched) row.score -= 25;
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
