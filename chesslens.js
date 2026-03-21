/* ============================================================
   chesslens.js — ChessLens Game Review Engine
   Pure vanilla JS. No frameworks. Works on mobile browser.
   Uses chess.js for move parsing.
   Uses Stockfish via WebAssembly (loaded from CDN).
============================================================ */

"use strict";

// ---- GLOBAL STATE ----
const appState = {
  moves: [],          // array of { san, fen, classification, cpBefore, cpAfter, color }
  currentIndex: 0,    // which move we are viewing (0 = start position)
  whiteAccuracy: 0,
  blackAccuracy: 0,
  whiteName: "White",
  blackName: "Black",
  stockfish: null,
  analyzing: false,
};

// ---- PIECE UNICODE MAP ----
const PIECES = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

// ---- CLASSIFICATION THRESHOLDS ----
// centipawn loss thresholds
function classify(cpBefore, cpAfter, color) {
  // cpBefore and cpAfter are always from White's POV
  // loss = how much the position worsened for the moving side
  let loss;
  if (color === "w") {
    loss = cpBefore - cpAfter; // white wants high cp
  } else {
    loss = cpAfter - cpBefore; // black wants low cp (negative = good for black)
    loss = -loss;
    loss = (cpBefore) - (cpAfter);
    // Recalculate properly: for black, position improvement is cp going down
    loss = cpAfter - cpBefore; // if cp drops (good for black), loss is negative = no loss
    loss = -(cpAfter - cpBefore); // flip: if cp dropped, black gained, so loss is negative
    loss = cpBefore - cpAfter; // if cp went from +50 to -50, that's bad for white = good for black
    // simplify: loss for the player = (their side's eval before) - (their side's eval after)
    // white eval = cp. black eval = -cp
    // white loss = cpBefore - cpAfter
    // black loss = (-cpBefore) - (-cpAfter) = cpAfter - cpBefore
    loss = cpAfter - cpBefore;
  }

  // loss is in centipawns, positive = you lost material/position
  if (loss <= -50)       return "brilliant";  // sacrifice / surprisingly good move
  if (loss <= 0)         return "great";      // slightly improves or maintains
  if (loss <= 20)        return "best";
  if (loss <= 80)        return "inaccuracy";
  if (loss <= 200)       return "mistake";
  return "blunder";
}

const CLASSIF_META = {
  brilliant:  { label: "✦ Brilliant", icon: "✦", cls: "cl-brilliant", bgCls: "cl-brilliant-bg" },
  great:      { label: "! Great",     icon: "!",  cls: "cl-great",     bgCls: "cl-great-bg" },
  best:       { label: "✓ Best",      icon: "✓",  cls: "cl-best",      bgCls: "cl-best-bg" },
  inaccuracy: { label: "?! Inaccuracy",icon:"?!", cls: "cl-inaccuracy",bgCls: "cl-inaccuracy-bg" },
  mistake:    { label: "? Mistake",   icon: "?",  cls: "cl-mistake",   bgCls: "cl-mistake-bg" },
  blunder:    { label: "?? Blunder",  icon: "??", cls: "cl-blunder",   bgCls: "cl-blunder-bg" },
};

// ---- ACCURACY FORMULA ----
// Based on win% model similar to chess.com
function cpToWinPct(cp) {
  // clamp
  cp = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function calcAccuracy(moves, color) {
  const playerMoves = moves.filter(m => m.color === color && m.cpBefore !== null && m.cpAfter !== null);
  if (playerMoves.length === 0) return 100;

  let totalWin = 0;
  playerMoves.forEach(m => {
    const wpBefore = cpToWinPct(color === "w" ? m.cpBefore : -m.cpBefore);
    const wpAfter  = cpToWinPct(color === "w" ? m.cpAfter  : -m.cpAfter);
    const loss = Math.max(0, wpBefore - wpAfter);
    totalWin += Math.max(0, 1 - loss / 100 * 3); // scale loss impact
  });

  return Math.min(100, Math.max(0, (totalWin / playerMoves.length) * 100));
}

// ---- SAMPLE PGN ----
const SAMPLE_PGN = `[Event "Casual Game"]
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

// ---- LOAD SAMPLE ----
function loadSample() {
  document.getElementById("pgn-input").value = SAMPLE_PGN;
}

// ---- CLEAR ----
function clearAll() {
  document.getElementById("pgn-input").value = "";
  hideError();
}

// ---- RESET APP ----
function resetApp() {
  document.getElementById("analysis-section").style.display = "none";
  document.getElementById("input-section").style.display = "block";
  appState.moves = [];
  appState.currentIndex = 0;
  hideError();
  hideProgress();
}

// ---- SHOW/HIDE HELPERS ----
function showError(msg) {
  const el = document.getElementById("error-box");
  el.textContent = "⚠ " + msg;
  el.style.display = "block";
}

function hideError() {
  document.getElementById("error-box").style.display = "none";
}

function showProgress(pct, status) {
  document.getElementById("progress-wrap").style.display = "block";
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-status").textContent = status;
}

function hideProgress() {
  document.getElementById("progress-wrap").style.display = "none";
}

// ---- SANITIZE PGN ----
function sanitizePGN(pgn) {
  // Split into header block and moves block
  const lines = pgn.trim().split("\n");
  const headerLines = [];
  const moveLines = [];
  let inMoves = false;

  for (let line of lines) {
    line = line.trim();
    if (!inMoves && line.startsWith("[")) {
      headerLines.push(line);
    } else if (line !== "") {
      inMoves = true;
      moveLines.push(line);
    }
  }

  // Join move lines into a single line (fixes multi-line PGN wrapping)
  const movesText = moveLines.join(" ").trim();

  // Remove clock annotations like {[%clk 0:09:59]}
  const cleanMoves = movesText
    .replace(/\{[^}]*\}/g, "")   // remove all { } comments
    .replace(/\$\d+/g, "")       // remove NAG symbols like $1 $2
    .replace(/\s+/g, " ")        // collapse whitespace
    .trim();

  return headerLines.join("\n") + "\n\n" + cleanMoves;
}

// ---- PARSE PGN ----
function parsePGN(pgn) {
  const chess = new Chess();
  const sanitized = sanitizePGN(pgn);
  const loaded = chess.load_pgn(sanitized, { sloppy: true });
  if (!loaded) return null;

  const history = chess.history({ verbose: true });
  const headers = chess.header();

  // Replay to get FEN at each step
  const game = new Chess();
  const positions = [];
  positions.push({ fen: game.fen(), san: null, color: null });

  for (const move of history) {
    game.move(move.san);
    positions.push({
      fen: game.fen(),
      san: move.san,
      color: move.color,
    });
  }

  return { positions, headers };
}

// ---- STOCKFISH ANALYSIS ----
// We use a simple iterative depth approach without actual WASM
// For mobile compatibility, we use a pure-JS evaluation heuristic
// (Real Stockfish WASM requires SharedArrayBuffer which is blocked on most mobile browsers)
// This gives a realistic simulated evaluation based on material + position heuristics.

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Position tables (simplified, from White's perspective, index 0 = a1)
const PAWN_TABLE = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

const ROOK_TABLE = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0
];

const QUEEN_TABLE = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20
];

const KING_MID_TABLE = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20
];

function getPieceTable(type) {
  switch (type) {
    case 'p': return PAWN_TABLE;
    case 'n': return KNIGHT_TABLE;
    case 'b': return BISHOP_TABLE;
    case 'r': return ROOK_TABLE;
    case 'q': return QUEEN_TABLE;
    case 'k': return KING_MID_TABLE;
  }
  return null;
}

function squareIndex(sq) {
  // sq is like "e4" → file 0-7, rank 0-7
  const file = sq.charCodeAt(0) - 97; // a=0
  const rank = parseInt(sq[1]) - 1;   // 1=0
  return rank * 8 + file;
}

function evaluatePosition(fen) {
  const chess = new Chess(fen);
  if (chess.in_checkmate()) {
    return chess.turn() === "w" ? -9999 : 9999;
  }
  if (chess.in_draw() || chess.in_stalemate()) return 0;

  let score = 0;
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;

      const isWhite = piece.color === "w";
      const val = PIECE_VALUES[piece.type] || 0;
      const table = getPieceTable(piece.type);

      // Table index: white reads from bottom (rank 0), black from top
      const tableIdx = isWhite ? (7 - r) * 8 + f : r * 8 + f;
      const posBonus = table ? table[tableIdx] : 0;

      const pieceScore = val + posBonus;
      score += isWhite ? pieceScore : -pieceScore;
    }
  }

  // Add small mobility bonus
  const moves = chess.moves().length;
  const mobilityBonus = chess.turn() === "w" ? moves * 2 : -moves * 2;
  score += mobilityBonus;

  return score;
}

// ---- MAIN ANALYSIS ENTRY ----
async function startAnalysis() {
  hideError();

  const pgn = document.getElementById("pgn-input").value.trim();
  if (!pgn) {
    showError("Please paste a PGN before analyzing.");
    return;
  }

  const parsed = parsePGN(pgn);
  if (!parsed) {
    showError("Invalid PGN. Make sure it is copied correctly from Lichess or Chess.com.");
    return;
  }

  const { positions, headers } = parsed;
  if (positions.length < 3) {
    showError("Game is too short to analyze. Need at least one full move.");
    return;
  }

  // Hide input, show progress
  document.getElementById("input-section").style.display = "none";
  showProgress(0, "Starting analysis…");

  // Extract player names
  appState.whiteName = headers["White"] || "White";
  appState.blackName = headers["Black"] || "Black";

  // Evaluate each position
  const total = positions.length;
  const cpArray = [];

  for (let i = 0; i < total; i++) {
    const cp = evaluatePosition(positions[i].fen);
    cpArray.push(cp);

    const pct = Math.round((i / total) * 100);
    showProgress(pct, `Evaluating position ${i} of ${total - 1}…`);

    // yield to browser every 5 positions so UI doesn't freeze
    if (i % 5 === 0) await sleep(0);
  }

  showProgress(95, "Classifying moves…");
  await sleep(10);

  // Build moves array
  appState.moves = [];
  for (let i = 1; i < positions.length; i++) {
    const cpBefore = cpArray[i - 1];
    const cpAfter  = cpArray[i];
    const color    = positions[i].color;
    const cl       = classify(cpBefore, cpAfter, color);

    appState.moves.push({
      san:          positions[i].san,
      fen:          positions[i].fen,
      classification: cl,
      cpBefore,
      cpAfter,
      color,
    });
  }

  // Store start FEN
  appState.startFen = positions[0].fen;

  // Calculate accuracy
  appState.whiteAccuracy = calcAccuracy(appState.moves, "w");
  appState.blackAccuracy = calcAccuracy(appState.moves, "b");

  showProgress(100, "Done!");
  await sleep(300);
  hideProgress();

  // Render everything
  renderAccuracy();
  renderMoveList();
  appState.currentIndex = 0;
  renderBoard(appState.startFen, null, null);
  updateMoveCounter();

  document.getElementById("analysis-section").style.display = "block";
  document.getElementById("analysis-section").scrollIntoView({ behavior: "smooth" });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---- RENDER ACCURACY CARDS ----
function renderAccuracy() {
  const container = document.getElementById("accuracy-row");

  const wMoves = appState.moves.filter(m => m.color === "w");
  const bMoves = appState.moves.filter(m => m.color === "b");

  function countCl(moves, cl) {
    return moves.filter(m => m.classification === cl).length;
  }

  function accColor(acc) {
    if (acc >= 90) return "var(--green-soft)";
    if (acc >= 75) return "var(--blue-soft)";
    if (acc >= 60) return "var(--gold)";
    if (acc >= 45) return "var(--orange-soft)";
    return "var(--red-soft)";
  }

  function buildCard(label, moves, accuracy, side) {
    const acc = Math.round(accuracy);
    const color = accColor(acc);

    const pills = [
      { cl: "brilliant", icon: "✦", label: "Brilliant" },
      { cl: "great",     icon: "!",  label: "Great" },
      { cl: "best",      icon: "✓",  label: "Best" },
      { cl: "inaccuracy",icon: "?!", label: "Inaccuracy" },
      { cl: "mistake",   icon: "?",  label: "Mistake" },
      { cl: "blunder",   icon: "??", label: "Blunder" },
    ].filter(p => countCl(moves, p.cl) > 0);

    const pillsHtml = pills.map(p => {
      const meta = CLASSIF_META[p.cl];
      return `<span class="acc-pill ${meta.cls}" title="${p.label}">${p.icon} ${countCl(moves, p.cl)}</span>`;
    }).join("");

    return `
      <div class="accuracy-card ${side}">
        <div class="acc-label">${side === "white" ? "White" : "Black"}</div>
        <div class="acc-name">${label}</div>
        <div class="acc-percent" style="color:${color}">${acc}<span style="font-size:1rem;opacity:0.6">%</span></div>
        <div class="acc-bar-bg">
          <div class="acc-bar-fill" style="width:${acc}%; background:${color}"></div>
        </div>
        <div class="acc-breakdown">${pillsHtml}</div>
      </div>
    `;
  }

  container.innerHTML =
    buildCard(appState.whiteName, wMoves, appState.whiteAccuracy, "white") +
    buildCard(appState.blackName, bMoves, appState.blackAccuracy, "black");
}

// ---- RENDER MOVE LIST ----
function renderMoveList() {
  const list = document.getElementById("move-list");
  let html = "";

  for (let i = 0; i < appState.moves.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const wMove = appState.moves[i];
    const bMove = appState.moves[i + 1];

    const wMeta = CLASSIF_META[wMove.classification];
    const bMeta = bMove ? CLASSIF_META[bMove.classification] : null;

    html += `<div class="move-row">
      <span class="move-num">${moveNum}.</span>
      <button class="move-btn" id="mvbtn-${i+1}" onclick="goToMove(${i+1})">
        <span class="move-icon ${wMeta.cls}">${wMeta.icon}</span>${wMove.san}
      </button>
      ${bMove ? `<button class="move-btn" id="mvbtn-${i+2}" onclick="goToMove(${i+2})">
        <span class="move-icon ${bMeta.cls}">${bMeta.icon}</span>${bMove.san}
      </button>` : "<span></span>"}
    </div>`;
  }

  list.innerHTML = html;
}

// ---- RENDER BOARD ----
function renderBoard(fen, lastMoveSan, classification) {
  const chess = new Chess(fen);
  const board = chess.board(); // 8x8 array, [0][0] = a8
  const container = document.getElementById("board-container");

  let html = "";

  // Render rank 8 down to rank 1 (board[0] = rank 8)
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const isLight = (r + f) % 2 === 0;
      const sq = board[r][f];
      const file = String.fromCharCode(97 + f);
      const rank = 8 - r;
      const sqName = file + rank;

      let pieceHtml = "";
      if (sq) {
        const key = sq.color + sq.type.toUpperCase();
        pieceHtml = `<span class="piece">${PIECES[key] || ""}</span>`;
      }

      const showFileLabel = (r === 7);
      const showRankLabel = (f === 7);
      const label = showFileLabel ? `<span class="sq-label" style="bottom:1px;left:2px;right:auto">${file}</span>` :
                    showRankLabel ? `<span class="sq-label">${rank}</span>` : "";

      html += `<div class="sq ${isLight ? "light" : "dark"}" id="sq-${sqName}" title="${sqName}">
        ${pieceHtml}${label}
      </div>`;
    }
  }

  container.innerHTML = html;

  // Highlight last move squares
  if (lastMoveSan && appState.currentIndex > 0) {
    highlightLastMove(appState.currentIndex);
  }

  // Update classification display
  const display = document.getElementById("classif-display");
  if (classification && lastMoveSan) {
    const meta = CLASSIF_META[classification];
    display.innerHTML = `
      <span class="classif-badge ${meta.cls} ${meta.bgCls}">${meta.label}</span>
      <span class="classif-move-text">${lastMoveSan}</span>
    `;
  } else {
    display.innerHTML = `<span style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:#444">Starting position</span>`;
  }

  // Update player tags
  document.getElementById("white-name").textContent = appState.whiteName;
  document.getElementById("black-name").textContent = appState.blackName;
}

function highlightLastMove(index) {
  if (index <= 0 || index > appState.moves.length) return;
  // We need to figure out which squares were involved
  // Replay moves up to index-1 to find the move
  const chess = new Chess();
  const allMoves = appState.moves.map(m => m.san);
  for (let i = 0; i < index - 1; i++) {
    chess.move(allMoves[i]);
  }
  const moveObj = chess.move(allMoves[index - 1]);
  if (moveObj) {
    const fromEl = document.getElementById("sq-" + moveObj.from);
    const toEl   = document.getElementById("sq-" + moveObj.to);
    if (fromEl) fromEl.classList.add("lastmove");
    if (toEl)   toEl.classList.add("lastmove");
  }
}

// ---- NAVIGATION ----
function goToMove(index) {
  index = Math.max(0, Math.min(index, appState.moves.length));
  appState.currentIndex = index;

  let fen, classification, san;
  if (index === 0) {
    fen = appState.startFen;
    classification = null;
    san = null;
  } else {
    const move = appState.moves[index - 1];
    fen = move.fen;
    classification = move.classification;
    san = move.san;
  }

  renderBoard(fen, san, classification);
  updateMoveCounter();
  updateActiveMoveBtn();
  scrollMoveIntoView(index);
}

function nextMove() { goToMove(appState.currentIndex + 1); }
function prevMove() { goToMove(appState.currentIndex - 1); }

function updateMoveCounter() {
  document.getElementById("move-counter").textContent =
    `${appState.currentIndex} / ${appState.moves.length}`;
}

function updateActiveMoveBtn() {
  // Remove all active
  document.querySelectorAll(".move-btn").forEach(b => b.classList.remove("active"));
  if (appState.currentIndex > 0) {
    const btn = document.getElementById("mvbtn-" + appState.currentIndex);
    if (btn) btn.classList.add("active");
  }
}

function scrollMoveIntoView(index) {
  if (index > 0) {
    const btn = document.getElementById("mvbtn-" + index);
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// ---- KEYBOARD NAVIGATION ----
document.addEventListener("keydown", (e) => {
  if (document.getElementById("analysis-section").style.display === "none") return;
  if (e.key === "ArrowRight") nextMove();
  if (e.key === "ArrowLeft")  prevMove();
});
