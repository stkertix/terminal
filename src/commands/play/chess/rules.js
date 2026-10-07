export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const WP = 1;
const WN = 2;
const WB = 3;
const WR = 4;
const WQ = 5;
const WK = 6;
const BP = 9;
const BN = 10;
const BB = 11;
const BR = 12;
const BQ = 13;
const BK = 14;

const KNIGHT_D = [14, 18, 31, 33, -14, -18, -31, -33];
const KING_D = [1, -1, 16, -16, 15, 17, -15, -17];
const BISHOP_D = [15, 17, -15, -17];
const ROOK_D = [1, -1, 16, -16];
const GLYPH = ["", "P", "N", "B", "R", "Q", "K"];
const FEN_CHAR = ["", "P", "N", "B", "R", "Q", "K", "", "", "p", "n", "b", "r", "q", "k"];
const CODE = {
  P: WP, N: WN, B: WB, R: WR, Q: WQ, K: WK,
  p: BP, n: BN, b: BB, r: BR, q: BQ, k: BK,
};

const CASTLE_KEEP = new Uint8Array(128);
CASTLE_KEEP.fill(15);
CASTLE_KEEP[4] = 12;
CASTLE_KEEP[0] = 13;
CASTLE_KEEP[7] = 14;
CASTLE_KEEP[0x74] = 3;
CASTLE_KEEP[0x70] = 7;
CASTLE_KEEP[0x77] = 11;

const onBoard = (sq) => (sq & 0x88) === 0;

export function pieceKind(piece) {
  return piece > 8 ? piece - 8 : piece;
}

export function isWhitePiece(piece) {
  return piece > 0 && piece < 8;
}

export function glyph(piece) {
  if (!piece) return "";
  return GLYPH[pieceKind(piece)];
}

export function fileOf(sq) {
  return sq & 7;
}

export function rankOf(sq) {
  return sq >> 4;
}

export function sqName(sq) {
  return "abcdefgh"[sq & 7] + String((sq >> 4) + 1);
}

export function parseFen(fen = START_FEN) {
  const board = new Uint8Array(128);
  const [placement, side, castleText, epText, halfText, fullText] = fen.split(/\s+/);
  const ranks = placement.split("/");
  for (let row = 0; row < 8; row += 1) {
    let file = 0;
    for (const char of ranks[row]) {
      if (char >= "1" && char <= "8") {
        file += Number(char);
        continue;
      }
      board[(7 - row) * 16 + file] = CODE[char];
      file += 1;
    }
  }
  let castle = 0;
  if (castleText.includes("K")) castle |= 1;
  if (castleText.includes("Q")) castle |= 2;
  if (castleText.includes("k")) castle |= 4;
  if (castleText.includes("q")) castle |= 8;
  let ep = -1;
  if (epText && epText !== "-") {
    ep = (Number(epText[1]) - 1) * 16 + "abcdefgh".indexOf(epText[0]);
  }
  const pos = {
    board,
    side: side === "b" ? "b" : "w",
    castle,
    ep,
    half: Number(halfText) || 0,
    full: Number(fullText) || 1,
    kingW: -1,
    kingB: -1,
  };
  for (let sq = 0; sq < 120; sq += 1) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    if (board[sq] === WK) pos.kingW = sq;
    else if (board[sq] === BK) pos.kingB = sq;
  }
  return pos;
}

export function toFen(pos) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = pos.board[rank * 16 + file];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      row += FEN_CHAR[piece];
    }
    if (empty) row += empty;
    rows.push(row);
  }
  let castle = "";
  if (pos.castle & 1) castle += "K";
  if (pos.castle & 2) castle += "Q";
  if (pos.castle & 4) castle += "k";
  if (pos.castle & 8) castle += "q";
  if (!castle) castle = "-";
  const ep = pos.ep < 0 ? "-" : sqName(pos.ep);
  return `${rows.join("/")} ${pos.side} ${castle} ${ep} ${pos.half} ${pos.full}`;
}

export function posKey(pos) {
  let key = `${pos.side}${pos.castle}:${pos.ep}:`;
  for (let sq = 0; sq < 120; sq += 1) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    key += pos.board[sq].toString(16);
  }
  return key;
}

export function attacked(board, sq, byWhite) {
  if (byWhite) {
    if (onBoard(sq - 15) && board[sq - 15] === WP) return true;
    if (onBoard(sq - 17) && board[sq - 17] === WP) return true;
  } else {
    if (onBoard(sq + 15) && board[sq + 15] === BP) return true;
    if (onBoard(sq + 17) && board[sq + 17] === BP) return true;
  }
  const knight = byWhite ? WN : BN;
  for (let i = 0; i < KNIGHT_D.length; i += 1) {
    const target = sq + KNIGHT_D[i];
    if (onBoard(target) && board[target] === knight) return true;
  }
  const king = byWhite ? WK : BK;
  for (let i = 0; i < KING_D.length; i += 1) {
    const target = sq + KING_D[i];
    if (onBoard(target) && board[target] === king) return true;
  }
  const bishop = byWhite ? WB : BB;
  const queen = byWhite ? WQ : BQ;
  for (let i = 0; i < BISHOP_D.length; i += 1) {
    const delta = BISHOP_D[i];
    let target = sq + delta;
    while (onBoard(target)) {
      const piece = board[target];
      if (piece) {
        if (piece === bishop || piece === queen) return true;
        break;
      }
      target += delta;
    }
  }
  const rook = byWhite ? WR : BR;
  for (let i = 0; i < ROOK_D.length; i += 1) {
    const delta = ROOK_D[i];
    let target = sq + delta;
    while (onBoard(target)) {
      const piece = board[target];
      if (piece) {
        if (piece === rook || piece === queen) return true;
        break;
      }
      target += delta;
    }
  }
  return false;
}

function push(moves, from, to, piece, captured, promo, flag) {
  moves.push({ from, to, piece, captured, promo, flag });
}

function pushPawn(moves, from, to, piece, captured, promote) {
  if (!promote) {
    push(moves, from, to, piece, captured, 0, 0);
    return;
  }
  const white = piece < 8;
  push(moves, from, to, piece, captured, white ? WQ : BQ, 0);
  push(moves, from, to, piece, captured, white ? WN : BN, 0);
  push(moves, from, to, piece, captured, white ? WR : BR, 0);
  push(moves, from, to, piece, captured, white ? WB : BB, 0);
}

function generate(pos) {
  const moves = [];
  const white = pos.side === "w";
  const board = pos.board;
  const pawnDir = white ? 16 : -16;
  const promoRank = white ? 6 : 1;
  const startRank = white ? 1 : 6;
  const enemy = (piece) => piece && (white ? piece > 8 : piece < 8);
  for (let sq = 0; sq < 120; sq += 1) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const piece = board[sq];
    if (!piece || (white ? piece > 8 : piece < 8)) continue;
    const kind = piece > 8 ? piece - 8 : piece;
    if (kind === 1) {
      const rank = sq >> 4;
      const one = sq + pawnDir;
      if (onBoard(one) && !board[one]) {
        pushPawn(moves, sq, one, piece, 0, rank === promoRank);
        if (rank === startRank) {
          const two = sq + pawnDir * 2;
          if (onBoard(two) && !board[two]) pushPawn(moves, sq, two, piece, 0, false);
        }
      }
      const caps = [pawnDir - 1, pawnDir + 1];
      for (let i = 0; i < caps.length; i += 1) {
        const target = sq + caps[i];
        if (!onBoard(target)) continue;
        if (target === pos.ep) push(moves, sq, target, piece, board[target - pawnDir], 0, 1);
        else if (enemy(board[target])) pushPawn(moves, sq, target, piece, board[target], rank === promoRank);
      }
    } else if (kind === 2) {
      for (let i = 0; i < KNIGHT_D.length; i += 1) {
        const target = sq + KNIGHT_D[i];
        if (!onBoard(target)) continue;
        const occ = board[target];
        if (!occ || enemy(occ)) push(moves, sq, target, piece, occ, 0, 0);
      }
    } else if (kind === 6) {
      for (let i = 0; i < KING_D.length; i += 1) {
        const target = sq + KING_D[i];
        if (!onBoard(target)) continue;
        const occ = board[target];
        if (!occ || enemy(occ)) push(moves, sq, target, piece, occ, 0, 0);
      }
      if (white && sq === 4) {
        if ((pos.castle & 1) && !board[5] && !board[6] && board[7] === WR
          && !attacked(board, 4, false) && !attacked(board, 5, false) && !attacked(board, 6, false)) {
          push(moves, 4, 6, piece, 0, 0, 2);
        }
        if ((pos.castle & 2) && !board[1] && !board[2] && !board[3] && board[0] === WR
          && !attacked(board, 4, false) && !attacked(board, 3, false) && !attacked(board, 2, false)) {
          push(moves, 4, 2, piece, 0, 0, 2);
        }
      } else if (!white && sq === 0x74) {
        if ((pos.castle & 4) && !board[0x75] && !board[0x76] && board[0x77] === BR
          && !attacked(board, 0x74, true) && !attacked(board, 0x75, true) && !attacked(board, 0x76, true)) {
          push(moves, 0x74, 0x76, piece, 0, 0, 2);
        }
        if ((pos.castle & 8) && !board[0x73] && !board[0x72] && !board[0x71] && board[0x70] === BR
          && !attacked(board, 0x74, true) && !attacked(board, 0x73, true) && !attacked(board, 0x72, true)) {
          push(moves, 0x74, 0x72, piece, 0, 0, 2);
        }
      }
    } else {
      const dirs = kind === 3 ? BISHOP_D : kind === 4 ? ROOK_D : BISHOP_D.concat(ROOK_D);
      for (let i = 0; i < dirs.length; i += 1) {
        const delta = dirs[i];
        let target = sq + delta;
        while (onBoard(target)) {
          const occ = board[target];
          if (!occ) push(moves, sq, target, piece, 0, 0, 0);
          else {
            if (enemy(occ)) push(moves, sq, target, piece, occ, 0, 0);
            break;
          }
          target += delta;
        }
      }
    }
  }
  return moves;
}

export function make(pos, move) {
  const undo = {
    captured: move.captured,
    castle: pos.castle,
    ep: pos.ep,
    half: pos.half,
    full: pos.full,
    kingW: pos.kingW,
    kingB: pos.kingB,
  };
  const white = pos.side === "w";
  pos.board[move.to] = move.promo || move.piece;
  pos.board[move.from] = 0;
  if (move.flag === 1) pos.board[move.to + (white ? -16 : 16)] = 0;
  if (move.flag === 2) {
    const kingside = move.to > move.from;
    const rookFrom = kingside ? move.from + 3 : move.from - 4;
    const rookTo = kingside ? move.from + 1 : move.from - 1;
    pos.board[rookTo] = pos.board[rookFrom];
    pos.board[rookFrom] = 0;
  }
  if (pieceKind(move.piece) === 6) {
    if (white) pos.kingW = move.to;
    else pos.kingB = move.to;
  }
  pos.castle &= CASTLE_KEEP[move.from] & CASTLE_KEEP[move.to];
  pos.ep = -1;
  if (pieceKind(move.piece) === 1 && Math.abs(move.to - move.from) === 32) {
    pos.ep = move.from + (white ? 16 : -16);
  }
  if (pieceKind(move.piece) === 1 || move.captured) pos.half = 0;
  else pos.half += 1;
  if (!white) pos.full += 1;
  pos.side = white ? "b" : "w";
  return undo;
}

export function unmake(pos, move, undo) {
  pos.side = pos.side === "w" ? "b" : "w";
  const white = pos.side === "w";
  pos.board[move.from] = move.piece;
  pos.board[move.to] = move.flag === 1 ? 0 : move.captured;
  if (move.flag === 1) pos.board[move.to + (white ? -16 : 16)] = move.captured;
  if (move.flag === 2) {
    const kingside = move.to > move.from;
    const rookFrom = kingside ? move.from + 3 : move.from - 4;
    const rookTo = kingside ? move.from + 1 : move.from - 1;
    pos.board[rookFrom] = pos.board[rookTo];
    pos.board[rookTo] = 0;
  }
  pos.castle = undo.castle;
  pos.ep = undo.ep;
  pos.half = undo.half;
  pos.full = undo.full;
  pos.kingW = undo.kingW;
  pos.kingB = undo.kingB;
}

export function legalMoves(pos) {
  const pseudo = generate(pos);
  const legal = [];
  const white = pos.side === "w";
  for (let i = 0; i < pseudo.length; i += 1) {
    const move = pseudo[i];
    const undo = make(pos, move);
    const king = white ? pos.kingW : pos.kingB;
    const safe = !attacked(pos.board, king, pos.side === "w");
    unmake(pos, move, undo);
    if (safe) legal.push(move);
  }
  return legal;
}

export function inCheck(pos) {
  const king = pos.side === "w" ? pos.kingW : pos.kingB;
  return attacked(pos.board, king, pos.side === "b");
}

export function toUci(move) {
  let text = sqName(move.from) + sqName(move.to);
  if (move.promo) text += "nbrqk"[pieceKind(move.promo) - 2];
  return text;
}

function suffix(pos, move) {
  const undo = make(pos, move);
  const king = pos.side === "w" ? pos.kingW : pos.kingB;
  const checked = attacked(pos.board, king, pos.side === "b");
  const mate = checked && legalMoves(pos).length === 0;
  unmake(pos, move, undo);
  if (mate) return "#";
  if (checked) return "+";
  return "";
}

export function toSan(pos, move, moves = legalMoves(pos)) {
  if (move.flag === 2) return (move.to > move.from ? "O-O" : "O-O-O") + suffix(pos, move);
  const kind = pieceKind(move.piece);
  let text = "";
  if (kind !== 1) {
    text += "NBRQK"[kind - 2];
    const file = move.from & 7;
    const rank = move.from >> 4;
    const same = moves.filter((other) => other.to === move.to && other.from !== move.from && pieceKind(other.piece) === kind);
    if (same.length) {
      const fileClash = same.some((other) => (other.from & 7) === file);
      const rankClash = same.some((other) => (other.from >> 4) === rank);
      if (!fileClash) text += "abcdefgh"[file];
      else if (!rankClash) text += String(rank + 1);
      else text += "abcdefgh"[file] + String(rank + 1);
    }
  } else if (move.captured) text += "abcdefgh"[move.from & 7];
  if (move.captured) text += "x";
  text += sqName(move.to);
  if (move.promo) text += `=${"NBRQK"[pieceKind(move.promo) - 2]}`;
  return text + suffix(pos, move);
}

export function insufficient(pos) {
  let whiteMinor = 0;
  let blackMinor = 0;
  let whiteBishop = -1;
  let blackBishop = -1;
  for (let sq = 0; sq < 120; sq += 1) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const piece = pos.board[sq];
    if (!piece || pieceKind(piece) === 6) continue;
    const kind = pieceKind(piece);
    if (kind === 1 || kind === 4 || kind === 5) return false;
    const white = piece < 8;
    if (kind === 2) {
      if (white) whiteMinor += 1;
      else blackMinor += 1;
    } else {
      const color = ((sq & 7) + (sq >> 4)) & 1;
      if (white) {
        whiteMinor += 1;
        whiteBishop = color;
      } else {
        blackMinor += 1;
        blackBishop = color;
      }
    }
  }
  if (whiteMinor + blackMinor <= 1) return true;
  return whiteMinor === 1 && blackMinor === 1 && whiteBishop >= 0 && whiteBishop === blackBishop;
}

export function matingMaterial(pos, white) {
  let knights = 0;
  let bishops = 0;
  for (let sq = 0; sq < 120; sq += 1) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const piece = pos.board[sq];
    if (!piece || isWhitePiece(piece) !== white || pieceKind(piece) === 6) continue;
    const kind = pieceKind(piece);
    if (kind === 1 || kind === 4 || kind === 5) return true;
    if (kind === 2) knights += 1;
    else bishops += 1;
  }
  if (bishops >= 2 || (bishops && knights) || knights >= 3) return true;
  return false;
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (let i = 0; i < moves.length; i += 1) {
    const undo = make(pos, moves[i]);
    nodes += perft(pos, depth - 1);
    unmake(pos, moves[i], undo);
  }
  return nodes;
}
