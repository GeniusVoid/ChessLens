"use strict";

// =========================================
//  STATE
// =========================================
const appState = {
  moves:        [],
  currentIndex: 0,
  startFen:     "",
  whiteName:    "White",
  blackName:    "Black",
  whiteAcc:     0,
  blackAcc:     0,
};

// =========================================
//  PIECE IMAGES — Lichess cburnett SVG set
//  Real professional chess piece graphics.
//  Open-source, MIT licensed, same pieces
//  used on lichess.org. Loads from CDN.
// =========================================
const PIECE_BASE = "https://lichess1.org/assets/piece/cburnett/";

// color+TYPE => filename (e.g. wK => wK.svg)
const PIECE_IMG = {
  wK:"wK.svg", wQ:"wQ.svg", wR:"wR.svg",
  wB:"wB.svg", wN:"wN.svg", wP:"wP.svg",
  bK:"bK.svg", bQ:"bQ.svg", bR:"bR.svg",
  bB:"bB.svg", bN:"bN.svg", bP:"bP.svg",
};

// =========================================
//  CLASSIFICATION META
// =========================================
const CL = {
  brilliant:  { label:"Brilliant", icon:"!", c:"c-brilliant", bg:"bg-brilliant" },
  great:      { label:"Great",     icon:"!",  c:"c-great",     bg:"bg-great"     },
  best:       { label:"Best",      icon:"v",  c:"c-best",      bg:"bg-best"      },
  inaccuracy: { label:"Inaccuracy",icon:"?!", c:"c-inaccuracy",bg:"bg-inaccuracy"},
  mistake:    { label:"Mistake",   icon:"?",  c:"c-mistake",   bg:"bg-mistake"   },
  blunder:    { label:"Blunder",   icon:"??", c:"c-blunder",   bg:"bg-blunder"   },
};

const CL_ICONS = {
  brilliant: "!!", great: "!", best: "✓",
  inaccuracy: "?!", mistake: "?", blunder: "??"
};

const CL_LABELS = {
  brilliant: "Brilliant", great: "Great", best: "Best",
  inaccuracy: "Inaccuracy", mistake: "Mistake", blunder: "Blunder"
};

// =========================================
//  CLASSIFY MOVES
// =========================================
function classify(cpBefore, cpAfter, color) {
  const loss = color === "w" ? (cpBefore - cpAfter) : (cpAfter - cpBefore);
  if (loss <= -50)  return "brilliant";
  if (loss <= 0)    return "great";
  if (loss <= 20)   return "best";
  if (loss <= 80)   return "inaccuracy";
  if (loss <= 200)  return "mistake";
  return "blunder";
}

// =========================================
//  ACCURACY
// =========================================
function cpToWin(cp) {
  cp = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function calcAcc(moves, color) {
  const pm = moves.filter(m => m.color === color);
  if (!pm.length) return 100;
  let sum = 0;
  pm.forEach(m => {
    const wpB = cpToWin(color === "w" ? m.cpBefore : -m.cpBefore);
    const wpA = cpToWin(color === "w" ? m.cpAfter  : -m.cpAfter);
    const loss = Math.max(0, wpB - wpA);
    sum += Math.max(0, 1 - (loss / 100) * 3);
  });
  return Math.min(100, Math.max(0, (sum / pm.length) * 100));
}

// =========================================
//  POSITION EVALUATOR (heuristic)
// =========================================
const PV = { p:100, n:320, b:330, r:500, q:900, k:0 };

const PT = {
  p:[ 0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0],
  n:[-50,-40,-30,-30,-30,-30,-40,-50,
     -40,-20,  0,  0,  0,  0,-20,-40,
     -30,  0, 10, 15, 15, 10,  0,-30,
     -30,  5, 15, 20, 20, 15,  5,-30,
     -30,  0, 15, 20, 20, 15,  0,-30,
     -30,  5, 10, 15, 15, 10,  5,-30,
     -40,-20,  0,  5,  5,  0,-20,-40,
     -50,-40,-30,-30,-30,-30,-40,-50],
  b:[-20,-10,-10,-10,-10,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5, 10, 10,  5,  0,-10,
     -10,  5,  5, 10, 10,  5,  5,-10,
     -10,  0, 10, 10, 10, 10,  0,-10,
     -10, 10, 10, 10, 10, 10, 10,-10,
     -10,  5,  0,  0,  0,  0,  5,-10,
     -20,-10,-10,-10,-10,-10,-10,-20],
  r:[ 0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0],
  q:[-20,-10,-10, -5, -5,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5,  5,  5,  5,  0,-10,
      -5,  0,  5,  5,  5,  5,  0, -5,
       0,  0,  5,  5,  5,  5,  0, -5,
     -10,  5,  5,  5,  5,  5,  0,-10,
     -10,  0,  5,  0,  0,  0,  0,-10,
     -20,-10,-10, -5, -5,-10,-10,-20],
  k:[-30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -20,-30,-30,-40,-40,-30,-30,-20,
     -10,-20,-20,-20,-20,-20,-20,-10,
      20, 20,  0,  0,  0,  0, 20, 20,
      20, 30, 10,  0,  0, 10, 30, 20],
};

function evalPos(fen) {
  const chess = new Chess(fen);
  if (chess.in_checkmate()) return chess.turn() === "w" ? -9999 : 9999;
  if (chess.in_draw() || chess.in_stalemate()) return 0;
  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const isW = p.color === "w";
      const ti = isW ? (7 - r) * 8 + f : r * 8 + f;
      const ps = (PV[p.type] || 0) + (PT[p.type] ? PT[p.type][ti] : 0);
      score += isW ? ps : -ps;
    }
  }
  score += chess.turn() === "w" ? chess.moves().length * 2 : -chess.moves().length * 2;
  return score;
}

// =========================================
//  SAMPLE PGN
// =========================================
const SAMPLE = `[Event "Casual Game"]
[White "Magnus"]
[Black "Hikaru"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6
8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8
14. Ng3 g6 15. a4 c5 16. d5 c4 17. b4 cxb3 18. Bxb3 bxa4 19. Bxa4 Bc8
20. Bd2 Nb6 21. Bb3 Bg7 22. c4 Nfd7 23. Ra3 f5 24. exf5 gxf5 25. Nxf5 Rxf5
26. Bxf5 Nxd5 27. cxd5 Bxa1 28. Qxa1 Qf6 29. Qa2 Kh8 30. Ne5 Nxe5
31. Rxe5 Bxf5 32. Rxf5 Qxf5 33. Qxd5 Qf2+ 34. Kh2 Rf8 35. Bh6 Qxf7
36. Qxf7 Rxf7 37. Bg5 e4 38. d6 e3 39. fxe3 Re7 40. d7 Rxd7 41. Bf6+ 1-0`;

function loadSample() {
  document.getElementById("pgn-input").value = SAMPLE;
}

// =========================================
//  SCREENS
// =========================================
function showScreen(name) {
  ["input","loading","review"].forEach(s => {
    document.getElementById("s-" + s).style.display = s === name ? "block" : "none";
  });
}

function resetApp() {
  showScreen("input");
  appState.moves = [];
  appState.currentIndex = 0;
  hideError();
}

// =========================================
//  ERROR
// =========================================
function showError(msg) {
  const el = document.getElementById("err-box");
  el.textContent = msg;
  el.style.display = "block";
}
function hideError() {
  document.getElementById("err-box").style.display = "none";
}

// =========================================
//  PROGRESS
// =========================================
function setProgress(pct, lbl) {
  document.getElementById("prog-fill").style.width = pct + "%";
  document.getElementById("prog-lbl").textContent = lbl;
}

// =========================================
//  PGN SANITIZE + PARSE
// =========================================
function sanitizePGN(pgn) {
  const lines = pgn.trim().split("\n");
  const headers = [], moveParts = [];
  let inMoves = false;
  for (let line of lines) {
    line = line.trim();
    if (!inMoves && line.startsWith("[")) { headers.push(line); }
    else if (line) { inMoves = true; moveParts.push(line); }
  }
  const moves = moveParts.join(" ")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\$\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return headers.join("\n") + "\n\n" + moves;
}

function parsePGN(pgn) {
  const chess = new Chess();
  const ok = chess.load_pgn(sanitizePGN(pgn), { sloppy: true });
  if (!ok) return null;
  const history = chess.history({ verbose: true });
  const headers = chess.header();
  const game = new Chess();
  const positions = [{ fen: game.fen(), san: null, color: null }];
  for (const m of history) {
    game.move(m.san);
    positions.push({ fen: game.fen(), san: m.san, color: m.color });
  }
  return { positions, headers };
}

// =========================================
//  MAIN ANALYSIS
// =========================================
async function startAnalysis() {
  hideError();
  const pgn = document.getElementById("pgn-input").value.trim();
  if (!pgn) { showError("Please paste a PGN first."); return; }

  const parsed = parsePGN(pgn);
  if (!parsed) {
    showError("Invalid PGN. Make sure it is copied correctly from Lichess or Chess.com.");
    return;
  }

  const { positions, headers } = parsed;
  if (positions.length < 3) { showError("Game too short to analyze."); return; }

  appState.whiteName = headers["White"] || "White";
  appState.blackName = headers["Black"] || "Black";

  showScreen("loading");
  setProgress(0, "Starting...");

  const cpArr = [];
  for (let i = 0; i < positions.length; i++) {
    cpArr.push(evalPos(positions[i].fen));
    if (i % 5 === 0) {
      setProgress(Math.round(i / positions.length * 92), "Evaluating position " + i + " of " + (positions.length - 1) + "...");
      await sleep(0);
    }
  }

  setProgress(96, "Classifying moves...");
  await sleep(10);

  appState.moves = [];
  appState.startFen = positions[0].fen;

  for (let i = 1; i < positions.length; i++) {
    appState.moves.push({
      san:      positions[i].san,
      fen:      positions[i].fen,
      color:    positions[i].color,
      cl:       classify(cpArr[i-1], cpArr[i], positions[i].color),
      cpBefore: cpArr[i-1],
      cpAfter:  cpArr[i],
    });
  }

  appState.whiteAcc = calcAcc(appState.moves, "w");
  appState.blackAcc = calcAcc(appState.moves, "b");

  setProgress(100, "Done!");
  await sleep(300);

  renderAccCards();
  renderMoveList();
  goTo(0);

  showScreen("review");
  document.getElementById("s-review").scrollIntoView({ behavior: "smooth" });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// =========================================
//  ACCURACY CARDS
// =========================================
function accColor(acc) {
  if (acc >= 90) return "#81b64c";
  if (acc >= 75) return "#5c8bb0";
  if (acc >= 60) return "#f4d03f";
  if (acc >= 45) return "#e08c13";
  return "#ca3431";
}

function buildAccCard(name, moves, acc, side) {
  const a = Math.round(acc);
  const col = accColor(a);
  const counts = { brilliant:0, great:0, best:0, inaccuracy:0, mistake:0, blunder:0 };
  moves.forEach(m => counts[m.cl]++);

  const pills = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const icon = CL_ICONS[k];
      const cls  = CL[k].c;
      return '<span class="pill ' + cls + '">' + icon + ' ' + v + '</span>';
    }).join("");

  const avClass = side === "w" ? "acc-av w" : "acc-av b";
  const avIcon  = side === "w" ? "wP" : "bP";
  const av = '<div class="' + avClass + '"><img src="' + PIECE_BASE + PIECE_IMG[avIcon] + '" style="width:24px;height:24px"></div>';

  return '<div class="acc-card">' + av +
    '<div class="acc-info">' +
      '<div class="acc-pname">' + name + '</div>' +
      '<div class="acc-pct" style="color:' + col + '">' + a + '<span style="font-size:1rem;opacity:0.55">%</span></div>' +
      '<div class="acc-bar-track"><div class="acc-bar-fill" style="width:' + a + '%;background:' + col + '"></div></div>' +
      '<div class="acc-pills">' + pills + '</div>' +
    '</div></div>';
}

function renderAccCards() {
  const wMoves = appState.moves.filter(m => m.color === "w");
  const bMoves = appState.moves.filter(m => m.color === "b");
  document.getElementById("acc-row").innerHTML =
    buildAccCard(appState.whiteName, wMoves, appState.whiteAcc, "w") +
    buildAccCard(appState.blackName, bMoves, appState.blackAcc, "b");
  document.getElementById("white-lbl").textContent = appState.whiteName;
  document.getElementById("black-lbl").textContent = appState.blackName;

  // Update player avatar icons in board panel
  document.getElementById("white-av").src = PIECE_BASE + PIECE_IMG["wP"];
  document.getElementById("black-av").src = PIECE_BASE + PIECE_IMG["bP"];
}

// =========================================
//  MOVE LIST
// =========================================
function renderMoveList() {
  let html = "";
  for (let i = 0; i < appState.moves.length; i += 2) {
    const mn = Math.floor(i / 2) + 1;
    const wm = appState.moves[i];
    const bm = appState.moves[i + 1];
    const wi = CL_ICONS[wm.cl];
    const wc = CL[wm.cl].c;

    let blackBtn = "<span></span>";
    if (bm) {
      const bi = CL_ICONS[bm.cl];
      const bc = CL[bm.cl].c;
      blackBtn = '<button class="mv-btn" id="mb-' + (i+2) + '" onclick="goTo(' + (i+2) + ')">' +
        '<span class="mv-icon ' + bc + '">' + bi + '</span>' + bm.san + '</button>';
    }

    html += '<div class="mv-row">' +
      '<span class="mv-num">' + mn + '.</span>' +
      '<button class="mv-btn" id="mb-' + (i+1) + '" onclick="goTo(' + (i+1) + ')">' +
        '<span class="mv-icon ' + wc + '">' + wi + '</span>' + wm.san +
      '</button>' + blackBtn + '</div>';
  }
  document.getElementById("moves-list").innerHTML = html;
}

// =========================================
//  BOARD RENDERING — SVG PIECE IMAGES
// =========================================
function getLastMoveSqs(index) {
  if (index <= 0) return [];
  const chess = new Chess();
  const sans = appState.moves.map(m => m.san);
  for (let i = 0; i < index - 1; i++) chess.move(sans[i]);
  const mv = chess.move(sans[index - 1]);
  return mv ? [mv.from, mv.to] : [];
}

function renderBoard(fen, index) {
  const chess   = new Chess(fen);
  const grid    = chess.board();       // [0][0] = a8 top-left
  const lastSqs = getLastMoveSqs(index);

  let html = "";

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const isLight  = (r + f) % 2 === 0;
      const file     = String.fromCharCode(97 + f);
      const rank     = 8 - r;
      const sqName   = file + rank;
      const isLast   = lastSqs.includes(sqName);

      const sqClass = isLast
        ? (isLight ? "sq last-light" : "sq last-dark")
        : (isLight ? "sq light"      : "sq dark");

      // Piece image
      const piece = grid[r][f];
      let pieceHtml = "";
      if (piece) {
        const key = piece.color + piece.type.toUpperCase();
        const src = PIECE_BASE + PIECE_IMG[key];
        pieceHtml = '<img class="piece-img" src="' + src + '" alt="' + key + '">';
      }

      // Coordinate labels
      const rankLbl = f === 0
        ? '<span class="sq-coord rank-lbl">' + rank + '</span>' : "";
      const fileLbl = r === 7
        ? '<span class="sq-coord file-lbl">' + file + '</span>' : "";

      html += '<div class="' + sqClass + '">' + rankLbl + fileLbl + pieceHtml + '</div>';
    }
  }

  document.getElementById("board").innerHTML = html;
}

// =========================================
//  CLASSIFICATION CHIP
// =========================================
function renderChip(index) {
  const el = document.getElementById("cl-chip");
  if (index === 0 || index > appState.moves.length) {
    el.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);font-weight:600">Starting position</span>';
    return;
  }
  const mv   = appState.moves[index - 1];
  const icon = CL_ICONS[mv.cl];
  const lbl  = CL_LABELS[mv.cl];
  const cc   = CL[mv.cl].c;
  const bg   = CL[mv.cl].bg;
  el.innerHTML =
    '<span class="chip ' + cc + ' ' + bg + '">' + icon + ' ' + lbl + '</span>' +
    '<span class="chip-mv">' + mv.san + '</span>';
}

// =========================================
//  NAVIGATION
// =========================================
function goTo(index) {
  index = Math.max(0, Math.min(index, appState.moves.length));
  appState.currentIndex = index;
  const fen = index === 0 ? appState.startFen : appState.moves[index - 1].fen;
  renderBoard(fen, index);
  renderChip(index);
  updateCtr();
  updateActiveBtn();
  scrollBtnIntoView(index);
}

function next() { goTo(appState.currentIndex + 1); }
function prev() { goTo(appState.currentIndex - 1); }

function updateCtr() {
  document.getElementById("mv-ctr").textContent =
    appState.currentIndex + " / " + appState.moves.length;
}

function updateActiveBtn() {
  document.querySelectorAll(".mv-btn").forEach(b => b.classList.remove("active"));
  if (appState.currentIndex > 0) {
    const btn = document.getElementById("mb-" + appState.currentIndex);
    if (btn) btn.classList.add("active");
  }
}

function scrollBtnIntoView(index) {
  if (index > 0) {
    const btn = document.getElementById("mb-" + index);
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// =========================================
//  KEYBOARD NAVIGATION
// =========================================
document.addEventListener("keydown", e => {
  if (document.getElementById("s-review").style.display === "none") return;
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft")  prev();
});
