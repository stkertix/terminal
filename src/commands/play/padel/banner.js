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
  M: ["#   #", "## ##", "# # #", "#   #", "#   #", "#   #", "#   #"],
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
  if (call.word === "GOAL" || call.word === "GAME") {
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
