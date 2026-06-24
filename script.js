/* =====================================================================
   The Quiet Hour — script.js
   A calm, logic-driven point-and-click escape room.

   No frameworks, no build step, no external assets. Classic <script> so it
   runs straight from file://.  All art is vector (SVG) generated in code.

   ---------------------------------------------------------------------
   CODE MAP (sections, in order):
     1.  Small DOM helpers
     2.  Static game data: items, books, puzzle solutions, walls
     3.  Game state + localStorage save / load / reset
     4.  Audio (optional, generated — no files)
     5.  SVG art: shared pieces + one builder per wall
     6.  Inventory item icons (SVG)
     7.  Rendering: scene, hotspots, inventory, top bar
     8.  Interaction: navigation, hotspot clicks, item select / use / combine
     9.  Modal system
     10. Puzzle UIs: keypad, colour sequence, symbol wheels, book reorder
     11. Per-object handlers (the actual room logic + clues)
     12. Hint system (progressive + context aware)
     13. Timer, win flow, menu, how-to
     14. Boot / event wiring

   PUZZLE OVERVIEW (the full solve path — also in README):
     • Brass key (in pen cup) -> unlock desk drawer  [tutorial]
         drawer gives: Magnifying Glass, dead Flashlight, the "seasons" note
     • Clock reads 7 o'clock                          -> number 7
     • Reorder the books by season                    -> number 2 (+ colour order)
     • Enter that colour order into the framed picture -> number 9
     • Trowel -> dig the plant -> Battery
         Battery + dead Flashlight = working Flashlight (item combine)
     • Magnifier reads the puzzle box engraving -> open box -> Cabinet Key
     • Cabinet Key opens cabinet; Flashlight lights it -> number 5 + order diagram
     • Door code = clock, cabinet, books, picture = 7 5 2 9 -> escape
   ===================================================================== */

(function () {
  "use strict";

  /* ===================================================================
     1. DOM helpers
     =================================================================== */
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const SAVE_KEY = "quiet-hour-save-v1";

  /* ===================================================================
     2. Static game data
     =================================================================== */

  // --- Inventory items. `consumable` items vanish once used. -----------
  const ITEMS = {
    brasskey: {
      name: "Brass Key",
      desc: "A small, well-worn brass key. The kind that fits a desk drawer rather than a door.",
    },
    magnifier: {
      name: "Magnifying Glass",
      desc: "A reading glass with a wooden handle. Good for tiny print — or tiny engravings.",
    },
    flashlight_dead: {
      name: "Flashlight (dead)",
      desc: "A pocket flashlight. The switch clicks but nothing happens — it needs a battery.",
      combineHint: true,
    },
    battery: {
      name: "Battery",
      desc: "A chunky cell, still with a bit of life in it. Something was hungry for power.",
      combineHint: true,
    },
    flashlight: {
      name: "Flashlight",
      desc: "A working flashlight, throwing a warm steady beam. Useful for dark corners.",
    },
    trowel: {
      name: "Hand Trowel",
      desc: "A little gardening trowel with a smooth handle. Made for turning soil.",
    },
    cabinetkey: {
      name: "Cabinet Key",
      desc: "A heavier key with a teal ribbon. It looks like it belongs to the cabinet.",
    },
  };

  // Item combinations: sorted-pair key -> { result, msg }
  const COMBINES = {
    "battery+flashlight_dead": {
      result: "flashlight",
      consume: ["battery", "flashlight_dead"],
      msg: "You slot the battery in. The flashlight wakes with a warm, steady beam.",
    },
  };

  // --- The four season books (the bookshelf puzzle) --------------------
  // Each book has a season, an order in the year, a spine colour and an icon.
  // `id` (spring/summer/autumn/winter) doubles as the glyph key.
  const BOOKS = {
    spring: { season: "Spring", order: 1, color: "#6FA86A", name: "green" },
    summer: { season: "Summer", order: 2, color: "#D9A93B", name: "gold" },
    autumn: { season: "Autumn", order: 3, color: "#C56B33", name: "orange" },
    winter: { season: "Winter", order: 4, color: "#3F6CA8", name: "blue" },
  };
  // The order the books START in on the shelf (deliberately scrambled).
  const BOOK_START_ORDER = ["autumn", "spring", "winter", "summer"];
  // Correct order = by season (spring, summer, autumn, winter).
  const BOOK_SOLUTION = ["spring", "summer", "autumn", "winter"];

  // --- The puzzle box symbol wheels -----------------------------------
  const WHEEL_SYMBOLS = ["circle", "triangle", "square", "diamond"];
  const BOX_SOLUTION = ["diamond", "circle", "triangle", "square"]; // ◆ ● ▲ ■

  // --- The framed picture colour-sequence lock ------------------------
  // Answer = the season order colours: green, gold, orange, blue.
  const ART_PALETTE = [
    { id: "green", color: "#6FA86A" },
    { id: "gold", color: "#D9A93B" },
    { id: "orange", color: "#C56B33" },
    { id: "blue", color: "#3F6CA8" },
    { id: "red", color: "#B5503F" }, // distractor
    { id: "purple", color: "#6E5AA0" }, // distractor
  ];
  const ART_SOLUTION = ["green", "gold", "orange", "blue"];

  // --- Discovered numbers and the final door code ---------------------
  const NUMBERS = { clock: 7, bookshelf: 2, art: 9, cabinet: 5 };
  // Door order is taught by the cabinet diagram: clock, cabinet, books, picture.
  const DOOR_CODE = "" + NUMBERS.clock + NUMBERS.cabinet + NUMBERS.bookshelf + NUMBERS.art; // "7529"

  // --- Walls (navigation order: turning right goes front->right->back->left)
  const WALLS = [
    { id: "front", name: "Front Wall · the Door", compass: "N" },
    { id: "right", name: "Right Wall · the Desk", compass: "E" },
    { id: "back", name: "Back Wall · the Bookshelf", compass: "S" },
    { id: "left", name: "Left Wall · the Cabinet", compass: "W" },
  ];

  /* ===================================================================
     3. Game state + persistence
     =================================================================== */
  function freshState() {
    return {
      version: 1,
      wall: 0, // index into WALLS
      inventory: [], // item ids in pickup order
      selected: null, // item armed for use
      solved: {
        drawer: false,
        clock: false,
        bookshelf: false,
        art: false,
        plant: false,
        box: false,
        cabinet: false,
        door: false,
      },
      flags: {
        brasskeyTaken: false,
        trowelTaken: false,
        cabinetUnlocked: false, // key turned
        cabinetLit: false, // flashlight used inside
        lampOn: false,
        introSeen: false,
      },
      findings: { clock: null, bookshelf: null, art: null, cabinet: null },
      bookOrder: BOOK_START_ORDER.slice(),
      hintLevel: {}, // puzzleId -> int
      elapsedMs: 0,
      won: false,
      settings: { sound: false },
    };
  }

  let state = freshState();

  function save() {
    try {
      const copy = JSON.parse(JSON.stringify(state));
      copy.selected = null; // never persist a half-armed item
      localStorage.setItem(SAVE_KEY, JSON.stringify(copy));
    } catch (e) {
      /* storage might be unavailable (private mode) — game still works in memory */
    }
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch (e) {
      return null;
    }
  }
  function hasSave() {
    const s = loadSave();
    return !!(s && !s.won);
  }
  function wipeSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  /* ===================================================================
     4. Optional generated audio (no asset files)
     =================================================================== */
  let audioCtx = null;
  function tone(freq, dur, type) {
    if (!state.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.value = 0.04;
      o.connect(g);
      g.connect(audioCtx.destination);
      const t = audioCtx.currentTime;
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur);
    } catch (e) {}
  }
  const sfx = {
    click: () => tone(440, 0.05, "sine"),
    good: () => { tone(660, 0.09, "sine"); setTimeout(() => tone(880, 0.12, "sine"), 90); },
    bad: () => tone(180, 0.18, "sawtooth"),
    pickup: () => { tone(520, 0.07, "triangle"); setTimeout(() => tone(720, 0.08, "triangle"), 70); },
  };

  /* ===================================================================
     5. SVG room art
     =================================================================== */
  const VW = 1000, VH = 640;

  const COMMON_DEFS = `
    <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dbe7e0"/><stop offset="1" stop-color="#c2d3cb"/>
    </linearGradient>
    <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c8a878"/><stop offset="1" stop-color="#b08c55"/>
    </linearGradient>
    <linearGradient id="woodG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9a268"/><stop offset="1" stop-color="#9c7544"/>
    </linearGradient>
    <linearGradient id="woodDarkG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a77f4c"/><stop offset="1" stop-color="#7c5a32"/>
    </linearGradient>
    <linearGradient id="duskG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f5cda0"/><stop offset="0.5" stop-color="#d9bcc4"/>
      <stop offset="1" stop-color="#9aabc0"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.42" r="0.75">
      <stop offset="0.6" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#26342e" stop-opacity="0.22"/>
    </radialGradient>
    <linearGradient id="lampGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff4cf" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#fff4cf" stop-opacity="0"/>
    </linearGradient>`;

  // Background shared by every wall: wall, floor, baseboard, soft vignette.
  function bg(floorY) {
    floorY = floorY || 492;
    return `
      <rect x="0" y="0" width="${VW}" height="${VH}" fill="url(#wallG)"/>
      <rect x="0" y="${floorY}" width="${VW}" height="${VH - floorY}" fill="url(#floorG)"/>
      <rect x="0" y="${floorY - 10}" width="${VW}" height="14" fill="#eef2ec"/>
      <rect x="0" y="${floorY - 10}" width="${VW}" height="4" fill="#f7faf6"/>
      ${plankSeams(floorY)}
    `;
  }
  function plankSeams(floorY) {
    let s = "";
    for (let i = 1; i < 5; i++) {
      const y = floorY + i * ((VH - floorY) / 5);
      s += `<line x1="0" y1="${y}" x2="${VW}" y2="${y}" stroke="#a07f4d" stroke-width="1.5" opacity="0.5"/>`;
    }
    for (let i = 1; i < 8; i++) {
      const x = (i * VW) / 8 + ((i % 2) * 30);
      s += `<line x1="${x}" y1="${floorY}" x2="${x}" y2="${VH}" stroke="#a07f4d" stroke-width="1.2" opacity="0.35"/>`;
    }
    return s;
  }
  const vignette = `<rect x="0" y="0" width="${VW}" height="${VH}" fill="url(#vignette)" pointer-events="none"/>`;

  // A reusable wooden picture frame.
  function frame(x, y, w, h, inner, frameColor) {
    frameColor = frameColor || "#8a6a44";
    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${frameColor}"/>
        <rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="3" fill="#f6f1e4"/>
        ${inner}
      </g>`;
  }

  // -- FRONT WALL: the door, clock, sampler, console + vase ------------
  function drawFront() {
    const doorOpen = state.solved.door;
    return `
      ${bg(492)}
      <!-- wall sconce glow -->
      <ellipse cx="500" cy="40" rx="220" ry="60" fill="#ffffff" opacity="0.12"/>

      <!-- rug -->
      <ellipse cx="500" cy="560" rx="250" ry="48" fill="#b78a86" opacity="0.55"/>
      <ellipse cx="500" cy="560" rx="200" ry="36" fill="#cda3a0" opacity="0.6"/>

      <!-- DOOR -->
      <g>
        <rect x="406" y="150" width="190" height="346" rx="8" fill="url(#woodDarkG)" stroke="#5e442a" stroke-width="3"/>
        ${doorOpen ? `
          <rect x="416" y="160" width="170" height="326" rx="6" fill="#23312b"/>
          <rect x="416" y="160" width="60" height="326" fill="url(#duskG)" opacity="0.9"/>
          <text x="510" y="330" font-size="15" fill="#cfe0d8" font-family="sans-serif" text-anchor="middle">open</text>
        ` : `
          <rect x="424" y="170" width="154" height="150" rx="5" fill="#8a6440" opacity="0.5" stroke="#6e4f30" stroke-width="2"/>
          <rect x="424" y="332" width="154" height="150" rx="5" fill="#8a6440" opacity="0.5" stroke="#6e4f30" stroke-width="2"/>
          <circle cx="560" cy="330" r="7" fill="#e8d39a" stroke="#9c7d3c" stroke-width="2"/>
        `}
      </g>

      <!-- keypad lock panel beside the door -->
      <g>
        <rect x="604" y="300" width="60" height="92" rx="8" fill="#33403a" stroke="#222b27" stroke-width="2"/>
        <rect x="612" y="308" width="44" height="18" rx="3" fill="${state.solved.door ? "#6fbf8d" : "#9fb0a8"}"/>
        ${[0, 1, 2].map((r) => [0, 1, 2].map((c) =>
          `<circle cx="${622 + c * 16}" cy="${340 + r * 16}" r="4.5" fill="#cdd6d1"/>`).join("")).join("")}
      </g>

      <!-- CLOCK (upper right) reads 7:00 -->
      ${clockSvg(760, 150, 58, 7, 0)}

      <!-- SAMPLER frame (left) -->
      ${frame(150, 228, 165, 142,
        `<text x="232" y="280" font-size="15" fill="#6a5a3a" font-family="Georgia, serif" text-anchor="middle" font-style="italic">When you leave,</text>
         <text x="232" y="305" font-size="15" fill="#6a5a3a" font-family="Georgia, serif" text-anchor="middle" font-style="italic">mind only</text>
         <text x="232" y="332" font-size="19" fill="#9c5a2e" font-family="Georgia, serif" text-anchor="middle">the hour.</text>
         <path d="M186 348 h92" stroke="#c9b88e" stroke-width="2"/>`,
        "#9a7a4e")}

      <!-- CONSOLE table + decorative vase (right corner) -->
      <g>
        <rect x="690" y="468" width="200" height="14" rx="4" fill="url(#woodG)"/>
        <rect x="700" y="482" width="10" height="36" fill="#8a6a44"/>
        <rect x="870" y="482" width="10" height="36" fill="#8a6a44"/>
        <path d="M762 468 q-10 -70 22 -92 q32 22 22 92 z" fill="#b9897f"/>
        <path d="M762 468 q-10 -70 22 -92 q4 30 -6 92 z" fill="#a9756b" opacity="0.7"/>
        <path d="M784 382 q-4 -22 -16 -34 M784 382 q4 -26 18 -30" stroke="#6f8f72" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>

      ${vignette}
    `;
  }

  // Analog clock drawn at (cx,cy) radius r showing h:m.
  function clockSvg(cx, cy, r, h, m) {
    const ang = (deg) => (deg - 90) * (Math.PI / 180);
    const hourAng = (h % 12) * 30 + m * 0.5;
    const minAng = m * 6;
    const hx = cx + Math.cos(ang(hourAng)) * r * 0.5;
    const hy = cy + Math.sin(ang(hourAng)) * r * 0.5;
    const mx = cx + Math.cos(ang(minAng)) * r * 0.74;
    const my = cy + Math.sin(ang(minAng)) * r * 0.74;
    let ticks = "";
    for (let i = 0; i < 12; i++) {
      const a = ang(i * 30);
      const x1 = cx + Math.cos(a) * (r - 8), y1 = cy + Math.sin(a) * (r - 8);
      const x2 = cx + Math.cos(a) * (r - 3), y2 = cy + Math.sin(a) * (r - 3);
      ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7c8a82" stroke-width="${i % 3 === 0 ? 3 : 1.5}"/>`;
    }
    return `
      <g>
        <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="#e7decb" stroke="#b8a06a" stroke-width="3"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f6f1e2"/>
        ${ticks}
        <line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" stroke="#48564f" stroke-width="5" stroke-linecap="round"/>
        <line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" stroke="#5d6b63" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="4.5" fill="#9c5a2e"/>
      </g>`;
  }

  // -- RIGHT WALL: desk, drawer, pen cup, lamp, puzzle box, notebook ----
  function drawDesk() {
    const drawerOpen = state.solved.drawer;
    const lampOn = state.flags.lampOn;
    return `
      ${bg(470)}
      <!-- WINDOW with dusk view -->
      <g>
        <rect x="120" y="112" width="240" height="206" rx="8" fill="#9a7a4e"/>
        <rect x="132" y="124" width="216" height="182" rx="4" fill="url(#duskG)"/>
        <line x1="240" y1="124" x2="240" y2="306" stroke="#9a7a4e" stroke-width="6"/>
        <line x1="132" y1="215" x2="348" y2="215" stroke="#9a7a4e" stroke-width="6"/>
        <circle cx="300" cy="170" r="16" fill="#fff0d0" opacity="0.85"/>
        <path d="M150 270 q40 -30 80 -8 q40 -26 96 4 v40 h-176 z" fill="#7e94a6" opacity="0.5"/>
      </g>

      ${lampOn ? `<ellipse cx="332" cy="410" rx="150" ry="120" fill="url(#lampGlow)" opacity="0.7"/>` : ""}

      <!-- DESK -->
      <g>
        <rect x="120" y="396" width="700" height="26" rx="5" fill="url(#woodG)"/>
        <rect x="120" y="396" width="700" height="7" fill="#d8b27a"/>
        <!-- left legs -->
        <rect x="150" y="422" width="16" height="150" fill="url(#woodDarkG)"/>
        <rect x="430" y="422" width="14" height="150" fill="url(#woodDarkG)"/>
        <!-- drawer cabinet (right) -->
        <rect x="560" y="422" width="244" height="150" rx="4" fill="url(#woodG)"/>
        <rect x="572" y="436" width="220" height="${drawerOpen ? 64 : 58}" rx="4" fill="${drawerOpen ? "#3a2f23" : "url(#woodDarkG)"}" stroke="#6e4f30" stroke-width="2"/>
        ${drawerOpen
          ? `<rect x="572" y="436" width="220" height="64" rx="4" fill="#2c2419"/>
             <text x="682" y="474" font-size="13" fill="#cdbf9f" font-family="sans-serif" text-anchor="middle">(empty drawer)</text>`
          : `<rect x="640" y="458" width="84" height="9" rx="4" fill="#e8d39a"/>
             <circle cx="682" cy="462" r="3" fill="#3a2a18"/>`}
        <rect x="572" y="504" width="220" height="58" rx="4" fill="url(#woodDarkG)" stroke="#6e4f30" stroke-width="2"/>
        <rect x="640" y="528" width="84" height="9" rx="4" fill="#cdb27a"/>
      </g>

      <!-- PEN CUP with the brass key -->
      <g>
        <rect x="190" y="350" width="46" height="46" rx="6" fill="#6a9b8a"/>
        <rect x="190" y="350" width="46" height="10" rx="5" fill="#5a8676"/>
        <line x1="202" y1="352" x2="198" y2="320" stroke="#3a4a45" stroke-width="3"/>
        <line x1="214" y1="352" x2="216" y2="316" stroke="#9c5a2e" stroke-width="3"/>
        <line x1="224" y1="352" x2="230" y2="324" stroke="#48564f" stroke-width="3"/>
        ${!state.flags.brasskeyTaken
          ? `<g transform="translate(226,352) rotate(18)">
               <circle cx="0" cy="0" r="6" fill="none" stroke="#cf9a45" stroke-width="3"/>
               <line x1="3" y1="4" x2="3" y2="26" stroke="#cf9a45" stroke-width="3"/>
               <line x1="3" y1="20" x2="9" y2="20" stroke="#cf9a45" stroke-width="3"/>
             </g>`
          : ""}
      </g>

      <!-- DESK LAMP -->
      <g>
        <ellipse cx="332" cy="398" rx="34" ry="9" fill="#5d6b63"/>
        <rect x="328" y="300" width="8" height="98" rx="3" fill="#7c8a82"/>
        <line x1="332" y1="306" x2="372" y2="262" stroke="#7c8a82" stroke-width="8" stroke-linecap="round"/>
        <circle cx="332" cy="306" r="5.5" fill="#5d6b63"/>
        <path d="M358 246 l40 10 l-12 28 l-30 -10 z" fill="${lampOn ? "#e9c873" : "#9aa79f"}" stroke="#5d6b63" stroke-width="2" stroke-linejoin="round"/>
        ${lampOn ? `<ellipse cx="376" cy="286" rx="11" ry="5" fill="#fff3cb"/>` : ""}
      </g>

      <!-- PUZZLE BOX -->
      <g>
        ${state.solved.box
          ? `<rect x="430" y="350" width="120" height="46" rx="6" fill="url(#woodDarkG)" stroke="#5e442a" stroke-width="2"/>
             <rect x="430" y="338" width="120" height="16" rx="4" fill="#7c5a32" transform="rotate(-8 430 346)"/>
             <text x="490" y="380" font-size="12" fill="#e8dcc2" font-family="sans-serif" text-anchor="middle">opened</text>`
          : `<rect x="430" y="356" width="120" height="42" rx="6" fill="url(#woodG)" stroke="#6e4f30" stroke-width="2"/>
             <rect x="430" y="348" width="120" height="14" rx="4" fill="#b08a52" stroke="#6e4f30" stroke-width="1.5"/>
             <g stroke="#6e4f30" stroke-width="1" opacity="0.8">
               <circle cx="456" cy="355" r="3" fill="none"/>
               <path d="M480 351 l6 8 M483 351 l-3 8" />
               <rect x="500" y="351" width="7" height="7" fill="none"/>
               <path d="M527 351 l5 4 l-5 4 l-5 -4 z" fill="none"/>
             </g>`}
      </g>

      <!-- NOTEBOOK (clue: the picture wants the seasons' colours) -->
      <g>
        <rect x="588" y="372" width="116" height="24" rx="3" fill="#f3ecd8" stroke="#c9b88e" stroke-width="1.5" transform="rotate(-3 588 372)"/>
        <line x1="596" y1="382" x2="690" y2="382" stroke="#b9a575" stroke-width="1" transform="rotate(-3 588 372)"/>
        <line x1="596" y1="388" x2="676" y2="388" stroke="#b9a575" stroke-width="1" transform="rotate(-3 588 372)"/>
      </g>

      ${vignette}
    `;
  }

  // -- BACK WALL: bookshelf with the four season books, globe, photo ----
  function drawShelf() {
    const order = state.bookOrder;
    let books = "";
    const bx = 300, bw = 54, gap = 4;
    order.forEach((id, i) => {
      const b = BOOKS[id];
      const x = bx + i * (bw + gap);
      books += `
        <g>
          <rect x="${x}" y="128" width="${bw}" height="92" rx="3" fill="${b.color}" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"/>
          <rect x="${x}" y="128" width="${bw}" height="92" rx="3" fill="url(#vignette)" opacity="0.15"/>
          <rect x="${x + 6}" y="140" width="${bw - 12}" height="16" rx="2" fill="rgba(255,255,255,0.5)"/>
          ${seasonEmblem(x + bw / 2, 190, id)}
        </g>`;
    });
    const solvedPanel = state.solved.bookshelf
      ? `<g>
           <rect x="566" y="150" width="60" height="62" rx="6" fill="#2c3833"/>
           <text x="596" y="196" font-size="36" fill="#f4efe2" font-family="Georgia,serif" text-anchor="middle">2</text>
         </g>`
      : "";

    // a couple of decorative shelves of plain books
    function shelfBooks(y) {
      const cols = ["#8c9a8e", "#b08a52", "#7e94a6", "#a86a5a", "#9a8a6a", "#6f8f72", "#b9a575", "#8a7c9a"];
      let s = "";
      for (let i = 0; i < 9; i++) {
        const x = 268 + i * 26;
        s += `<rect x="${x}" y="${y - (i % 3) * 4}" width="20" height="${74 + (i % 3) * 4}" rx="2" fill="${cols[i % cols.length]}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>`;
      }
      return s;
    }

    return `
      ${bg(500)}
      <!-- BOOKSHELF carcass -->
      <g>
        <rect x="232" y="116" width="536" height="392" rx="6" fill="url(#woodDarkG)"/>
        <rect x="248" y="128" width="504" height="368" rx="3" fill="#caa877"/>
        <!-- shelf boards -->
        <rect x="248" y="222" width="504" height="12" fill="url(#woodDarkG)"/>
        <rect x="248" y="312" width="504" height="12" fill="url(#woodDarkG)"/>
        <rect x="248" y="402" width="504" height="12" fill="url(#woodDarkG)"/>
        <rect x="248" y="484" width="504" height="12" fill="url(#woodDarkG)"/>
      </g>

      <!-- top shelf: the four season books + reveal panel + globe -->
      ${books}
      ${solvedPanel}
      <!-- GLOBE -->
      <g>
        <circle cx="688" cy="186" r="30" fill="#7e94a6" stroke="#5d6b63" stroke-width="2"/>
        <path d="M666 174 q22 10 44 0 M664 196 q24 8 48 0" stroke="#cfe0d8" stroke-width="1.5" fill="none" opacity="0.7"/>
        <path d="M688 156 q-16 30 0 60 M688 156 q16 30 0 60" stroke="#cfe0d8" stroke-width="1.5" fill="none" opacity="0.7"/>
        <rect x="684" y="216" width="8" height="12" fill="#8a6a44"/>
        <ellipse cx="688" cy="230" rx="16" ry="5" fill="#8a6a44"/>
      </g>

      <!-- middle shelf: plain books + framed photo -->
      ${shelfBooks(232)}
      ${frame(596, 238, 96, 70,
        `<path d="M604 296 q22 -34 44 -10 q14 -18 36 6 v8 h-80 z" fill="#8ba0a8"/>
         <circle cx="624" cy="262" r="7" fill="#f0e3b0"/>`, "#7c5a32")}

      <!-- lower shelves: decorative books -->
      ${shelfBooks(322)}
      ${shelfBooks(404)}

      ${vignette}
    `;
  }

  // -- LEFT WALL: cabinet, framed picture, plant + trowel ---------------
  function drawCabinet() {
    const unlocked = state.flags.cabinetUnlocked;
    const artSolved = state.solved.art;
    return `
      ${bg(500)}
      <!-- wall hook + scarf (decor) -->
      <g>
        <rect x="470" y="120" width="40" height="8" rx="3" fill="#8a6a44"/>
        <path d="M482 128 q-14 40 6 70 q20 -30 6 -70 z" fill="#b98a86" opacity="0.8"/>
      </g>

      <!-- CABINET -->
      <g>
        <rect x="110" y="300" width="312" height="200" rx="8" fill="url(#woodG)" stroke="#6e4f30" stroke-width="3"/>
        ${unlocked
          ? `<rect x="124" y="314" width="284" height="172" rx="5" fill="#241d14"/>
             <!-- doors swung open -->
             <rect x="96" y="312" width="30" height="176" rx="4" fill="url(#woodDarkG)" stroke="#5e442a" stroke-width="2"/>
             <rect x="406" y="312" width="30" height="176" rx="4" fill="url(#woodDarkG)" stroke="#5e442a" stroke-width="2"/>
             ${state.flags.cabinetLit
               ? `<ellipse cx="266" cy="400" rx="120" ry="80" fill="url(#lampGlow)" opacity="0.55"/>
                  <rect x="200" y="348" width="132" height="100" rx="6" fill="#f3ecd8" stroke="#c9b88e" stroke-width="2"/>
                  <text x="266" y="396" font-size="36" fill="#3a4a45" font-family="Georgia,serif" text-anchor="middle">5</text>
                  <text x="266" y="424" font-size="10" fill="#7c6a4a" font-family="sans-serif" text-anchor="middle">clock · cabinet · books · picture</text>`
               : `<text x="266" y="404" font-size="14" fill="#6a7a72" font-family="sans-serif" text-anchor="middle">(too dark to see)</text>`}`
          : `<rect x="124" y="314" width="138" height="172" rx="5" fill="url(#woodDarkG)" stroke="#5e442a" stroke-width="2"/>
             <rect x="270" y="314" width="138" height="172" rx="5" fill="url(#woodDarkG)" stroke="#5e442a" stroke-width="2"/>
             <circle cx="256" cy="400" r="6" fill="#e8d39a"/>
             <circle cx="276" cy="400" r="6" fill="#e8d39a"/>
             <rect x="262" y="392" width="8" height="22" rx="3" fill="#33403a"/>
             <circle cx="266" cy="396" r="3.5" fill="#1f2823"/>`}
        <rect x="104" y="494" width="324" height="12" rx="4" fill="url(#woodDarkG)"/>
      </g>

      <!-- FRAMED PICTURE (colour-sequence lock) -->
      <g>
        <rect x="516" y="146" width="252" height="200" rx="8" fill="#7c5a32"/>
        <rect x="528" y="158" width="228" height="176" rx="4" fill="#eef0ea"/>
        ${artSolved
          ? `<rect x="528" y="158" width="228" height="176" rx="4" fill="#2c3833"/>
             <text x="642" y="258" font-size="58" fill="#f4efe2" font-family="Georgia,serif" text-anchor="middle">9</text>`
          : `<!-- abstract panes of colour -->
             <rect x="544" y="174" width="92" height="68" rx="4" fill="#9fb6ad"/>
             <rect x="648" y="174" width="92" height="68" rx="4" fill="#d6c08a"/>
             <rect x="544" y="252" width="92" height="68" rx="4" fill="#c79a86"/>
             <rect x="648" y="252" width="92" height="68" rx="4" fill="#8ea0bb"/>
             <circle cx="642" cy="246" r="20" fill="#f3ecd8" opacity="0.85"/>`}
      </g>

      <!-- PLANT on a stand + TROWEL -->
      <g>
        <!-- stand -->
        <rect x="838" y="430" width="14" height="70" fill="url(#woodDarkG)"/>
        <rect x="806" y="424" width="78" height="12" rx="3" fill="url(#woodG)"/>
        <!-- pot -->
        <path d="M812 360 h66 l-8 64 h-50 z" fill="#b9897f"/>
        <rect x="808" y="352" width="74" height="12" rx="3" fill="#a9756b"/>
        <ellipse cx="845" cy="358" rx="33" ry="6" fill="#6b4f3a"/>
        <!-- foliage -->
        <g fill="#6f8f72">
          <path d="M845 356 q-30 -20 -34 -64 q26 14 36 50 z"/>
          <path d="M845 356 q30 -20 34 -64 q-26 14 -36 50 z"/>
          <path d="M845 356 q-8 -40 2 -78 q12 36 0 76 z"/>
        </g>
        <g fill="#85a587">
          <path d="M845 356 q-18 -16 -18 -48 q16 12 20 40 z"/>
          <path d="M845 356 q18 -16 18 -48 q-16 12 -20 40 z"/>
        </g>
        <!-- TROWEL leaning -->
        ${!state.flags.trowelTaken
          ? `<g transform="translate(770,408) rotate(12)">
               <rect x="0" y="0" width="9" height="40" rx="4" fill="#8a5a33"/>
               <path d="M-4 40 h17 l-3 34 q-6 6 -11 0 z" fill="#b9c2bf" stroke="#8a938f" stroke-width="1.5"/>
             </g>`
          : ""}
      </g>

      ${vignette}
    `;
  }

  const WALL_DRAW = { front: drawFront, right: drawDesk, back: drawShelf, left: drawCabinet };

  function sceneSvg(wallId) {
    return `<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <defs>${COMMON_DEFS}</defs>${WALL_DRAW[wallId]()}</svg>`;
  }

  /* ===================================================================
     6. Inventory item icons (SVG)
     =================================================================== */
  const ITEM_ICONS = {
    brasskey: `<svg viewBox="0 0 40 40" fill="none"><circle cx="13" cy="14" r="7" stroke="#c9933f" stroke-width="3"/><circle cx="13" cy="14" r="2.4" fill="#c9933f"/><path d="M18 18 L33 31" stroke="#cf9a45" stroke-width="3" stroke-linecap="round"/><path d="M28 27 l4 0 M30 24 l3 3" stroke="#cf9a45" stroke-width="3" stroke-linecap="round"/></svg>`,
    magnifier: `<svg viewBox="0 0 40 40" fill="none"><circle cx="17" cy="16" r="10" stroke="#5d6b63" stroke-width="3" fill="#dcecef"/><circle cx="14" cy="13" r="3" fill="#ffffff" opacity="0.8"/><path d="M24 23 L34 33" stroke="#7b5a3a" stroke-width="4" stroke-linecap="round"/></svg>`,
    flashlight_dead: `<svg viewBox="0 0 40 40"><rect x="7" y="16" width="17" height="11" rx="3" fill="#8b9aa0"/><path d="M24 15 l9 -4 v20 l-9 -4 z" fill="#6f7d83"/><rect x="4" y="18" width="4" height="7" rx="1" fill="#5d6b63"/></svg>`,
    flashlight: `<svg viewBox="0 0 40 40"><rect x="5" y="16" width="17" height="11" rx="3" fill="#c98a5e"/><path d="M22 15 l8 -4 v20 l-8 -4 z" fill="#a96e44"/><path d="M30 13 l9 -3 v22 l-9 -3 z" fill="#ffe9a8"/></svg>`,
    battery: `<svg viewBox="0 0 40 40"><rect x="11" y="10" width="18" height="24" rx="3" fill="#6a9b8a"/><rect x="16" y="6" width="8" height="5" rx="1" fill="#4f7466"/><path d="M20 16 l-4 7 h4 l-2 6 6 -8 h-4 z" fill="#fff"/></svg>`,
    trowel: `<svg viewBox="0 0 40 40"><rect x="17" y="5" width="6" height="13" rx="3" fill="#8a5a33"/><path d="M13 18 h14 l-3 13 q-4 5 -8 0 z" fill="#b9c2bf" stroke="#8a938f" stroke-width="1.5"/></svg>`,
    cabinetkey: `<svg viewBox="0 0 40 40" fill="none"><circle cx="13" cy="13" r="7" stroke="#6a9b8a" stroke-width="3"/><circle cx="13" cy="13" r="2.4" fill="#6a9b8a"/><path d="M18 17 L32 31" stroke="#6a9b8a" stroke-width="3" stroke-linecap="round"/><path d="M27 27 l5 0 M29 24 l3 3" stroke="#6a9b8a" stroke-width="3" stroke-linecap="round"/><path d="M9 5 l4 3 4 -3" stroke="#c2614f" stroke-width="2" fill="none"/></svg>`,
  };
  function itemIconSvg(id) {
    return ITEM_ICONS[id] || `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="10" fill="#9aa4a0"/></svg>`;
  }

  // Symbol shapes for the puzzle box wheels.
  function symbolSvg(name, color) {
    color = color || "#f4efe2";
    switch (name) {
      case "circle": return `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="${color}"/></svg>`;
      case "triangle": return `<svg viewBox="0 0 40 40"><path d="M20 6 L34 32 L6 32 Z" fill="${color}"/></svg>`;
      case "square": return `<svg viewBox="0 0 40 40"><rect x="8" y="8" width="24" height="24" rx="2" fill="${color}"/></svg>`;
      case "diamond": return `<svg viewBox="0 0 40 40"><path d="M20 5 L33 20 L20 35 L7 20 Z" fill="${color}"/></svg>`;
      default: return "";
    }
  }
  const SYMBOL_GLYPH = { circle: "●", triangle: "▲", square: "■", diamond: "◆" };

  // Season glyphs drawn entirely in code (no emoji / font dependency).
  function seasonGlyphInner(cx, cy, season, color) {
    const stroke = `stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;
    if (season === "spring") {
      return `<g fill="${color}"><path d="M${cx} ${cy + 9} L${cx} ${cy - 7}" fill="none" ${stroke}/>
        <path d="M${cx} ${cy - 1} q-10 -1 -11 -11 q10 0 11 9 z"/>
        <path d="M${cx} ${cy - 4} q10 -1 11 -11 q-10 0 -11 9 z"/></g>`;
    }
    if (season === "summer") {
      let rays = "";
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        rays += `<line x1="${cx + Math.cos(a) * 8}" y1="${cy + Math.sin(a) * 8}" x2="${cx + Math.cos(a) * 12.5}" y2="${cy + Math.sin(a) * 12.5}" ${stroke}/>`;
      }
      return `<g><circle cx="${cx}" cy="${cy}" r="5.5" fill="${color}"/>${rays}</g>`;
    }
    if (season === "autumn") {
      return `<g><path d="M${cx} ${cy - 9} q11 7 0 18 q-11 -11 0 -18 z" fill="${color}"/>
        <path d="M${cx} ${cy - 6} L${cx} ${cy + 7}" stroke="#f6f1e2" stroke-width="1.4"/></g>`;
    }
    if (season === "winter") {
      let spokes = "";
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3, dx = Math.cos(a) * 10, dy = Math.sin(a) * 10;
        spokes += `<line x1="${cx - dx}" y1="${cy - dy}" x2="${cx + dx}" y2="${cy + dy}" ${stroke}/>`;
      }
      return `<g>${spokes}</g>`;
    }
    return "";
  }
  // A glyph on a little light disc (good contrast on any spine colour).
  function seasonEmblem(cx, cy, season) {
    return `<circle cx="${cx}" cy="${cy}" r="14" fill="rgba(255,255,255,0.62)"/>${seasonGlyphInner(cx, cy, season, "#33403a")}`;
  }
  function seasonGlyphSVG(season) {
    return `<svg viewBox="0 0 40 40" width="34" height="34">${seasonEmblem(20, 20, season)}</svg>`;
  }

  /* ===================================================================
     7. Rendering
     =================================================================== */

  // Hotspot rectangles + behaviour, grouped by wall. Coordinates are in the
  // 1000x640 viewBox; they are converted to % so they scale with the art.
  // Each hotspot: {rect:[x,y,w,h], label, onClick, acceptItem?, useItem?}
  function hotspotsFor(wallId) {
    switch (wallId) {
      case "front":
        return [
          { rect: [406, 150, 258, 346], label: "The door", onClick: openDoorLock,
            acceptItem: () => false },
          { rect: [695, 86, 130, 130], label: "Wall clock", onClick: inspectClock },
          { rect: [150, 226, 165, 146], label: "Framed sampler", onClick: inspectSampler },
          { rect: [744, 374, 84, 100], label: "Vase on the console", onClick: inspectVase },
        ];
      case "right":
        return [
          { rect: [560, 422, 244, 86], label: "Desk drawer", onClick: clickDrawer,
            acceptItem: (id) => id === "brasskey" && !state.solved.drawer, useItem: useKeyOnDrawer },
          { rect: [182, 326, 78, 78], label: "Pen cup", onClick: clickPenCup },
          { rect: [296, 256, 104, 146], label: "Desk lamp", onClick: clickLamp },
          { rect: [420, 332, 136, 78], label: "Puzzle box", onClick: clickBox,
            acceptItem: (id) => id === "magnifier" && !state.solved.box, useItem: () => clickBox() },
          { rect: [584, 360, 124, 44], label: "Notebook", onClick: inspectNotebook },
          { rect: [124, 112, 230, 140], label: "Window", onClick: inspectWindow },
        ];
      case "back":
        return [
          { rect: [296, 122, 240, 104], label: "Row of coloured books", onClick: openBookshelf },
          { rect: [656, 152, 66, 86], label: "Globe", onClick: inspectGlobe },
          { rect: [594, 236, 100, 76], label: "Framed photo", onClick: inspectPhoto },
        ];
      case "left":
        return [
          { rect: [96, 300, 340, 206], label: "Cabinet", onClick: clickCabinet,
            acceptItem: cabinetAccepts, useItem: useOnCabinet },
          { rect: [516, 146, 252, 200], label: "Framed picture", onClick: openArtLock },
          { rect: [796, 250, 100, 196], label: "Potted plant", onClick: clickPlant,
            acceptItem: (id) => id === "trowel" && !state.solved.plant, useItem: digPlant },
          { rect: [762, 404, 60, 140], label: "Hand trowel", onClick: takeTrowel },
        ];
      default:
        return [];
    }
  }

  function render() {
    const wall = WALLS[state.wall];
    $("scene").innerHTML = sceneSvg(wall.id);
    $("wall-name").textContent = wall.name;
    $("compass").textContent = compassStrip(wall.compass);
    renderHotspots(wall.id);
    renderInventory();
    updateUsingMode();
  }

  function compassStrip(active) {
    return ["N", "E", "S", "W"].map((c) => (c === active ? "◆" + c : "·" + c)).join(" ");
  }

  function renderHotspots(wallId) {
    const host = $("hotspots");
    host.innerHTML = "";
    hotspotsFor(wallId).forEach((h) => {
      const b = make("button", "hotspot");
      const [x, y, w, hh] = h.rect;
      b.style.left = (x / VW) * 100 + "%";
      b.style.top = (y / VH) * 100 + "%";
      b.style.width = (w / VW) * 100 + "%";
      b.style.height = (hh / VH) * 100 + "%";
      b.setAttribute("aria-label", h.label);
      b.title = h.label;
      b.innerHTML = '<span class="dot"></span>';
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        handleHotspot(h);
      });
      host.appendChild(b);
    });
  }

  function renderInventory() {
    const ul = $("inventory");
    ul.innerHTML = "";
    if (state.inventory.length === 0) {
      ul.appendChild(make("li", "inv-empty", "Empty — look around the room."));
    }
    state.inventory.forEach((id) => {
      const li = make("li", "inv-item" + (state.selected === id ? " selected" : ""));
      li.setAttribute("tabindex", "0");
      li.setAttribute("role", "button");
      li.setAttribute("aria-label", ITEMS[id].name + (state.selected === id ? " (selected)" : ""));
      li.title = ITEMS[id].name;
      li.innerHTML = itemIconSvg(id) + '<button class="inspect-btn" aria-label="Inspect ' + ITEMS[id].name + '">🔍</button>';
      li.addEventListener("click", (e) => {
        if (e.target.closest(".inspect-btn")) { inspectItem(id); return; }
        selectItem(id);
      });
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectItem(id); }
      });
      ul.appendChild(li);
    });
    const holding = $("holding");
    if (state.selected) {
      holding.innerHTML = "Using: <strong>" + ITEMS[state.selected].name + "</strong><br><span class='muted'>click where to use it</span>";
    } else {
      holding.innerHTML = "";
    }
  }

  function updateUsingMode() {
    $("stage").classList.toggle("using", !!state.selected);
  }

  /* ===================================================================
     8. Interaction: navigation + items
     =================================================================== */
  function navigate(dir) {
    state.wall = (state.wall + dir + WALLS.length) % WALLS.length;
    sfx.click();
    render();
    save();
  }

  function handleHotspot(h) {
    if (state.selected) {
      // Player is trying to USE the held item on this hotspot.
      const itemId = state.selected;
      if (h.acceptItem && h.acceptItem(itemId)) {
        h.useItem(itemId);
        // After a successful use, put the item away (consumed or not) so it
        // isn't left "armed" and accidentally re-used on the next click.
        state.selected = null;
        renderInventory();
        updateUsingMode();
      } else {
        status("That doesn't do anything here.", "bad");
        sfx.bad();
      }
      return;
    }
    h.onClick();
  }

  function selectItem(id) {
    // Combining: if something is already held and the pair is valid, combine.
    if (state.selected && state.selected !== id) {
      const combo = findCombine(state.selected, id);
      if (combo) { doCombine(combo); return; }
    }
    if (state.selected === id) {
      state.selected = null; // toggle off
    } else {
      state.selected = id;
      sfx.click();
    }
    renderInventory();
    updateUsingMode();
  }
  function deselect() {
    if (!state.selected) return;
    state.selected = null;
    renderInventory();
    updateUsingMode();
  }

  function hasItem(id) { return state.inventory.indexOf(id) !== -1; }
  function addItem(id) {
    if (!hasItem(id)) state.inventory.push(id);
    sfx.pickup();
  }
  function removeItem(id) {
    const i = state.inventory.indexOf(id);
    if (i !== -1) state.inventory.splice(i, 1);
    if (state.selected === id) state.selected = null;
  }

  function findCombine(a, b) {
    const key = [a, b].sort().join("+");
    return COMBINES[key] ? Object.assign({ key }, COMBINES[key]) : null;
  }
  function doCombine(combo) {
    combo.consume.forEach(removeItem);
    addItem(combo.result);
    state.selected = null;
    renderInventory();
    updateUsingMode();
    status(combo.msg, "good");
    sfx.good();
    save();
    // celebrate the new item with an inspect view
    inspectItem(combo.result);
  }

  function inspectItem(id) {
    const it = ITEMS[id];
    let extra = "";
    if (it.combineHint) {
      extra = `<p class="muted">It looks like it could be combined with something else you're carrying. Select one item, then click the other.</p>`;
    }
    openModal({
      title: it.name,
      html: `<div class="modal-figure"><div style="width:90px;height:90px">${itemIconSvg(id)}</div></div>
             <p>${it.desc}</p>${extra}`,
    });
  }

  /* ===================================================================
     9. Modal system
     =================================================================== */
  let modalOnEnter = null;
  let lastFocus = null;

  function openModal(opts) {
    lastFocus = document.activeElement;
    $("modal-title").textContent = opts.title || "";
    $("modal-body").innerHTML = "";
    if (typeof opts.html === "string") $("modal-body").innerHTML = opts.html;
    else if (opts.node) $("modal-body").appendChild(opts.node);
    $("modal").classList.toggle("modal-wide", !!opts.wide);
    modalOnEnter = opts.onEnter || null;
    const root = $("modal-root");
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    // focus first sensible control
    setTimeout(() => {
      const f = $("modal-body").querySelector("button, input, [tabindex]");
      (f || $("modal-close")).focus();
      if (opts.onOpen) opts.onOpen();
    }, 0);
  }
  function closeModal() {
    const root = $("modal-root");
    if (root.hidden) return;
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    modalOnEnter = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function modalOpen() { return !$("modal-root").hidden; }

  /* ===================================================================
     10. Puzzle UIs
     =================================================================== */

  // --- (a) Door keypad --------------------------------------------------
  function openDoorLock() {
    if (state.solved.door) { status("The door is already open. Step on out.", "good"); return; }
    let entry = "";
    const node = make("div");
    const recall = doorRecallLine();
    node.innerHTML = `
      <p>A four-digit keypad. Four small numbers wait to be entered in the right order.</p>
      ${recall}
      <div class="lock-display" id="kp-display">— — — —</div>
      <div class="keypad" id="kp-pad"></div>
      <div class="lock-actions">
        <button class="btn" id="kp-clear">Clear</button>
        <button class="btn btn-primary" id="kp-enter" data-primary>Enter</button>
      </div>`;
    const pad = node.querySelector("#kp-pad");
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""].forEach((d) => {
      if (d === "") { pad.appendChild(make("span")); return; }
      const b = make("button", null, d);
      b.addEventListener("click", () => {
        if (entry.length < 4) { entry += d; updateKp(); sfx.click(); }
      });
      pad.appendChild(b);
    });
    function updateKp() {
      const slots = [];
      for (let i = 0; i < 4; i++) slots.push(entry[i] || "—");
      node.querySelector("#kp-display").textContent = slots.join(" ");
    }
    function submit() {
      if (entry.length < 4) { status("Enter all four digits.", "bad"); return; }
      if (entry === DOOR_CODE) {
        state.solved.door = true;
        save();
        closeModal();
        win();
      } else {
        status("The keypad buzzes and resets. Not the right code.", "bad");
        sfx.bad();
        entry = ""; updateKp();
        const d = node.querySelector("#kp-display");
        d.style.transition = "transform 0.05s";
        let n = 0; const iv = setInterval(() => { d.style.transform = `translateX(${n % 2 ? 6 : -6}px)`; if (++n > 5) { clearInterval(iv); d.style.transform = ""; } }, 50);
      }
    }
    node.querySelector("#kp-clear").addEventListener("click", () => { entry = ""; updateKp(); });
    node.querySelector("#kp-enter").addEventListener("click", submit);
    openModal({ title: "The Door", node, onEnter: submit });
  }
  // Gentle recall of numbers the player has actually discovered (order still hidden).
  function doorRecallLine() {
    const f = state.findings;
    const known = [];
    if (f.clock != null) known.push(`clock <strong>${f.clock}</strong>`);
    if (f.cabinet != null) known.push(`cabinet <strong>${f.cabinet}</strong>`);
    if (f.bookshelf != null) known.push(`books <strong>${f.bookshelf}</strong>`);
    if (f.art != null) known.push(`picture <strong>${f.art}</strong>`);
    if (!known.length) return `<p class="muted">You haven't found any numbers yet. Explore the room first.</p>`;
    let line = `<p class="muted">You've found: ${known.join(" · ")}.`;
    if (state.solved.cabinet) line += ` The cabinet showed the order: clock, cabinet, books, picture.`;
    else line += ` You still need the <em>order</em> to enter them.`;
    return line + `</p>`;
  }

  // --- (b) Framed picture colour-sequence lock -------------------------
  function openArtLock() {
    if (state.solved.art) {
      openModal({ title: "Framed Picture", html: `<p>The frame stands open. Behind it, painted neatly, is the number <strong style="font-size:1.4rem">9</strong>.</p>` });
      return;
    }
    let seq = [];
    const node = make("div");
    node.innerHTML = `
      <p>The picture is really a little door. Six colours sit beneath it, and four slots above. Enter a colour sequence.</p>
      <div class="seq-slots" id="art-slots"></div>
      <div class="color-row" id="art-colors"></div>
      <div class="lock-actions">
        <button class="btn" id="art-clear">Clear</button>
        <button class="btn btn-primary" id="art-submit" data-primary>Try it</button>
      </div>
      <p class="muted center">Hint lives elsewhere in the room: something else just put four colours in a deliberate order.</p>`;
    const slotsEl = node.querySelector("#art-slots");
    const colorsEl = node.querySelector("#art-colors");
    function drawSlots() {
      slotsEl.innerHTML = "";
      for (let i = 0; i < 4; i++) {
        const s = make("div", "seq-slot" + (seq[i] ? " filled" : ""));
        if (seq[i]) s.style.background = ART_PALETTE.find((p) => p.id === seq[i]).color;
        slotsEl.appendChild(s);
      }
    }
    ART_PALETTE.forEach((p) => {
      const sw = make("button", "swatch");
      sw.style.background = p.color;
      sw.setAttribute("aria-label", p.id);
      sw.title = p.id;
      sw.addEventListener("click", () => {
        if (seq.length < 4) { seq.push(p.id); drawSlots(); sfx.click(); }
      });
      colorsEl.appendChild(sw);
    });
    function submit() {
      if (seq.length < 4) { status("Fill all four slots.", "bad"); return; }
      if (seq.join(",") === ART_SOLUTION.join(",")) {
        state.solved.art = true;
        state.findings.art = NUMBERS.art;
        save();
        sfx.good();
        closeModal();
        status("The frame clicks and swings aside, revealing the number 9.", "good");
        render();
      } else {
        status("Nothing happens. That colour order isn't right.", "bad");
        sfx.bad();
        seq = []; drawSlots();
      }
    }
    node.querySelector("#art-clear").addEventListener("click", () => { seq = []; drawSlots(); });
    node.querySelector("#art-submit").addEventListener("click", submit);
    drawSlots();
    openModal({ title: "Framed Picture", node, onEnter: submit });
  }

  // --- (c) Puzzle box symbol wheels ------------------------------------
  function clickBox() {
    if (state.solved.box) {
      openModal({ title: "Puzzle Box", html: `<p>The little box sits open and empty. It already gave up the Cabinet Key.</p>` });
      return;
    }
    const canRead = hasItem("magnifier");
    let wheels = [0, 0, 0, 0]; // indices into WHEEL_SYMBOLS
    const node = make("div");
    node.innerHTML = `
      <p>A wooden puzzle box. Four little wheels of symbols sit along the front, and a row of marks is engraved across the lid.</p>
      <div class="modal-note" id="box-engraving"></div>
      <div class="wheels" id="box-wheels"></div>
      <div class="lock-actions"><button class="btn btn-primary" id="box-open" data-primary>Open</button></div>`;
    const eng = node.querySelector("#box-engraving");
    if (canRead) {
      eng.innerHTML = `Through the magnifying glass the engraving is clear:
        <span style="font-size:1.4rem;letter-spacing:6px">${BOX_SOLUTION.map((s) => SYMBOL_GLYPH[s]).join(" ")}</span>`;
    } else {
      eng.innerHTML = `The marks are engraved too small to read with the naked eye. You'd need something to magnify them.`;
    }
    const wEl = node.querySelector("#box-wheels");
    function drawWheels() {
      wEl.innerHTML = "";
      wheels.forEach((wi, i) => {
        const w = make("div", "wheel");
        w.innerHTML = `<button aria-label="up">▲</button>
          <div class="wheel-face">${symbolSvg(WHEEL_SYMBOLS[wi])}</div>
          <button aria-label="down">▼</button>`;
        const [up, , down] = w.children;
        up.addEventListener("click", () => { wheels[i] = (wheels[i] + 1) % WHEEL_SYMBOLS.length; drawWheels(); sfx.click(); });
        down.addEventListener("click", () => { wheels[i] = (wheels[i] + WHEEL_SYMBOLS.length - 1) % WHEEL_SYMBOLS.length; drawWheels(); sfx.click(); });
        wEl.appendChild(w);
      });
    }
    function open() {
      const cur = wheels.map((wi) => WHEEL_SYMBOLS[wi]);
      if (cur.join(",") === BOX_SOLUTION.join(",")) {
        state.solved.box = true;
        addItem("cabinetkey");
        save();
        sfx.good();
        closeModal();
        status("The box springs open — inside is a Cabinet Key.", "good");
        render();
      } else {
        status("The wheels won't release. That isn't the engraved order.", "bad");
        sfx.bad();
      }
    }
    node.querySelector("#box-open").addEventListener("click", open);
    drawWheels();
    openModal({ title: "Puzzle Box", node, onEnter: open });
  }

  // --- (d) Bookshelf reorder -------------------------------------------
  function openBookshelf() {
    if (state.solved.bookshelf) {
      openModal({
        title: "The Coloured Books",
        html: `<p>The books are in their proper order now: Spring, Summer, Autumn, Winter.</p>
               <p>The hidden panel behind them shows the number <strong style="font-size:1.4rem">2</strong>.</p>
               <p class="muted">With the seasons in order, the spines read: <strong>green, gold, orange, blue</strong>.</p>`,
      });
      return;
    }
    let picked = null;
    const node = make("div");
    node.innerHTML = `
      <p>Four books, each marked with a season. Put them in the order the year runs. Click one book, then another, to swap them.</p>
      <div class="book-slots" id="bs-slots"></div>
      <p class="muted center">The note from the drawer reminds you: Spring, Summer, Autumn, Winter.</p>`;
    const slotsEl = node.querySelector("#bs-slots");
    function draw() {
      slotsEl.innerHTML = "";
      state.bookOrder.forEach((id, i) => {
        const b = BOOKS[id];
        const div = make("div", "book-slot" + (picked === i ? " picked" : ""));
        div.style.background = b.color;
        div.setAttribute("role", "button");
        div.setAttribute("aria-label", b.season + " book");
        div.innerHTML = `<span class="book-icon">${seasonGlyphSVG(id)}</span><span class="book-season">${b.season}</span>`;
        div.addEventListener("click", () => pick(i));
        slotsEl.appendChild(div);
      });
    }
    function pick(i) {
      if (picked === null) { picked = i; draw(); return; }
      if (picked === i) { picked = null; draw(); return; }
      const arr = state.bookOrder;
      const t = arr[picked]; arr[picked] = arr[i]; arr[i] = t;
      picked = null;
      sfx.click();
      draw();
      check();
    }
    function check() {
      if (state.bookOrder.join(",") === BOOK_SOLUTION.join(",")) {
        state.solved.bookshelf = true;
        state.findings.bookshelf = NUMBERS.bookshelf;
        save();
        sfx.good();
        setTimeout(() => {
          closeModal();
          status("A panel slides back behind the books — the number 2, and the spines now read green, gold, orange, blue.", "good");
          render();
        }, 350);
      }
    }
    draw();
    openModal({ title: "The Coloured Books", node });
  }

  /* ===================================================================
     11. Per-object handlers (room logic + clues)
     =================================================================== */

  // FRONT ---------------------------------------------------------------
  function inspectClock() {
    state.solved.clock = true; // "seen"
    state.findings.clock = NUMBERS.clock;
    save();
    const extra = hasItem("magnifier")
      ? `<p class="muted">Through the magnifying glass you notice a tiny <strong>7</strong> scratched beside the hour mark — someone wanted to be sure.</p>`
      : "";
    openModal({
      title: "Wall Clock",
      html: `<div class="modal-figure"><svg viewBox="0 0 180 180" width="170" height="170">${clockSvg(90, 90, 70, 7, 0)}</svg></div>
             <p>A quiet analog clock, stopped — or simply patient — at <strong>seven o'clock</strong>.</p>
             <p>The sampler by the door said to mind only the hour.</p>${extra}`,
    });
  }
  function inspectSampler() {
    openModal({
      title: "Framed Sampler",
      html: `<div class="modal-note">"When you leave, mind only <strong>the hour</strong>."</div>
             <p>A cross-stitched motto in a thin wooden frame. It seems to be pointing you at the clock.</p>`,
    });
  }
  function inspectVase() {
    openModal({
      title: "Ceramic Vase",
      html: `<p>A round ceramic vase on the console table, holding one dried sprig of lavender. You tip it, peer inside, and run a finger around the rim. Pretty, but quite empty.</p>
             <p class="muted">Not everything in a room is a clue.</p>`,
    });
  }

  // RIGHT ---------------------------------------------------------------
  function clickDrawer() {
    if (state.solved.drawer) {
      openModal({ title: "Desk Drawer", html: `<p>The drawer hangs open and empty now. You've taken everything it held.</p>` });
      return;
    }
    openModal({
      title: "Desk Drawer",
      html: `<p>The top desk drawer is locked. There's a small keyhole — the sort a little brass key would fit.</p>
             <p class="muted">Tip: if you're holding the right key, select it and click the drawer.</p>`,
    });
  }
  function useKeyOnDrawer() {
    state.solved.drawer = true;
    removeItem("brasskey"); // key stays in the lock
    addItem("magnifier");
    addItem("flashlight_dead");
    save();
    sfx.good();
    render();
    openModal({
      title: "The Drawer Opens",
      html: `<p>The brass key turns and the drawer slides out. Inside you find:</p>
             <ul>
               <li><strong>a Magnifying Glass</strong></li>
               <li><strong>a Flashlight</strong> — though it seems to be dead</li>
             </ul>
             <div class="modal-note">A handwritten note rests on top:<br>
               "The shelf keeps time. Read the seasons in their turn — <strong>Spring, Summer, Autumn, Winter</strong>."</div>
             <p class="muted">Both items are now in your inventory.</p>`,
    });
  }
  function clickPenCup() {
    if (state.flags.brasskeyTaken) {
      openModal({ title: "Pen Cup", html: `<p>A teal cup of pens and pencils. Nothing else hiding in here.</p>` });
      return;
    }
    openModal({
      title: "Pen Cup",
      html: `<p>A little cup of pens — and tucked among them, catching the light, a small <strong>brass key</strong>.</p>
             <div class="lock-actions"><button class="btn btn-primary" id="take-key" data-primary>Take the brass key</button></div>`,
      onEnter: takeKey,
    });
    setTimeout(() => { const b = $("take-key"); if (b) b.addEventListener("click", takeKey); }, 0);
    function takeKey() {
      state.flags.brasskeyTaken = true;
      addItem("brasskey");
      save();
      render();
      closeModal();
      status("You pocket the brass key.", "good");
    }
  }
  function clickLamp() {
    state.flags.lampOn = !state.flags.lampOn;
    save();
    render();
    status(state.flags.lampOn ? "You switch the desk lamp on. The room feels warmer." : "You switch the desk lamp off.", "");
  }
  function inspectNotebook() {
    openModal({
      title: "Open Notebook",
      html: `<p>A notebook lies open on the desk, covered in a friend's looping handwriting. One line is underlined twice:</p>
             <div class="modal-note">"The picture only opens for the <strong>seasons' own colours</strong>, given in their turn."</div>
             <p class="muted">A little sketch beside it shows four paint blobs in a row.</p>`,
    });
  }
  function inspectWindow() {
    openModal({
      title: "The Window",
      html: `<p>Beyond the glass the afternoon has gone to amber and the first cool blue of evening. A calm view — and a reminder that the hour really is getting late.</p>`,
    });
  }

  // BACK ----------------------------------------------------------------
  function inspectGlobe() {
    openModal({
      title: "Desk Globe",
      html: `<p>A small tabletop globe. You give it a spin and watch the oceans blur by. It wobbles on its stand but reveals nothing — just a well-loved decoration.</p>`,
    });
  }
  function inspectPhoto() {
    openModal({
      title: "Framed Photo",
      html: `<p>A framed photograph of a quiet shoreline at low tide, the sand ribbed and silver. On the back, in pencil: "the calm hour." Nothing more.</p>`,
    });
  }

  // LEFT ----------------------------------------------------------------
  function clickCabinet() {
    if (state.solved.cabinet) {
      openModal({
        title: "Cabinet",
        html: `<p>The open cabinet is empty now, but you remember what it held: the number <strong>5</strong>, and a small diagram.</p>
               ${cabinetDiagramHtml()}`,
      });
      return;
    }
    if (!state.flags.cabinetUnlocked) {
      openModal({
        title: "Cabinet",
        html: `<p>A handsome wooden cabinet, firmly locked. The keyhole is larger than the desk drawer's — it wants a proper key.</p>
               <p class="muted">Tip: hold the right key, select it, and click the cabinet.</p>`,
      });
      return;
    }
    // unlocked but not yet lit
    openModal({
      title: "Cabinet",
      html: `<p>The cabinet doors stand open, but the inside is in deep shadow. You can just make out a card pinned to the back panel — too dark to read.</p>
             <p class="muted">If only you had a light to shine inside.</p>`,
    });
  }
  function cabinetAccepts(id) {
    if (id === "cabinetkey" && !state.flags.cabinetUnlocked) return true;
    if (id === "flashlight" && state.flags.cabinetUnlocked && !state.flags.cabinetLit) return true;
    return false;
  }
  function useOnCabinet(id) {
    if (id === "cabinetkey") {
      state.flags.cabinetUnlocked = true;
      removeItem("cabinetkey");
      save();
      render();
      status("The cabinet key turns with a heavy clunk. The doors swing open — but it's dark inside.", "good");
      return;
    }
    if (id === "flashlight") {
      state.flags.cabinetLit = true;
      state.solved.cabinet = true;
      state.findings.cabinet = NUMBERS.cabinet;
      save();
      sfx.good();
      render();
      openModal({
        title: "Inside the Cabinet",
        html: `<p>Your flashlight fills the cabinet with warm light. Pinned to the back panel is a card showing a large number and a little diagram:</p>
               <div class="modal-figure"><div style="font-size:2.6rem;font-family:Georgia,serif">5</div></div>
               ${cabinetDiagramHtml()}
               <p class="muted">So that's the order the door's numbers go in.</p>`,
      });
    }
  }
  function cabinetDiagramHtml() {
    // The order diagram: clock -> cabinet -> books -> picture
    return `<div class="modal-figure"><svg viewBox="0 0 360 90" width="340" height="86">
        ${orderIcon(28, "clock")}<text x="60" y="50" font-size="22">→</text>
        ${orderIcon(96, "cabinet")}<text x="128" y="50" font-size="22">→</text>
        ${orderIcon(164, "book")}<text x="196" y="50" font-size="22">→</text>
        ${orderIcon(232, "frame")}
      </svg></div>
      <p class="center muted">clock, then cabinet, then books, then picture</p>`;
  }
  function orderIcon(x, kind) {
    const y = 24;
    if (kind === "clock") return `<g transform="translate(${x},${y})"><circle cx="14" cy="22" r="16" fill="#f6f1e2" stroke="#9c7d3c" stroke-width="2"/><line x1="14" y1="22" x2="14" y2="11" stroke="#48564f" stroke-width="2.5"/><line x1="14" y1="22" x2="22" y2="26" stroke="#5d6b63" stroke-width="2"/></g>`;
    if (kind === "cabinet") return `<g transform="translate(${x},${y})"><rect x="0" y="6" width="30" height="34" rx="3" fill="#b08a52" stroke="#6e4f30" stroke-width="2"/><line x1="15" y1="6" x2="15" y2="40" stroke="#6e4f30" stroke-width="2"/><circle cx="11" cy="23" r="2" fill="#3a2a18"/><circle cx="19" cy="23" r="2" fill="#3a2a18"/></g>`;
    if (kind === "book") return `<g transform="translate(${x},${y})"><rect x="2" y="8" width="9" height="30" fill="#6FA86A"/><rect x="12" y="8" width="9" height="30" fill="#D9A93B"/><rect x="22" y="8" width="8" height="30" fill="#C56B33"/></g>`;
    if (kind === "frame") return `<g transform="translate(${x},${y})"><rect x="0" y="6" width="32" height="32" rx="3" fill="#8a6a44"/><rect x="5" y="11" width="22" height="22" fill="#9fb6ad"/><circle cx="16" cy="22" r="5" fill="#f3ecd8"/></g>`;
    return "";
  }

  function clickPlant() {
    if (state.solved.plant) {
      openModal({ title: "Potted Plant", html: `<p>The soil is turned over where you dug. Just a healthy little plant now.</p>` });
      return;
    }
    openModal({
      title: "Potted Plant",
      html: `<p>A leafy plant in a clay pot. The soil looks recently disturbed, as though something was pressed down into it. You could dig — but not with bare hands.</p>
             <p class="muted">Tip: find something to dig with, then use it here.</p>`,
    });
  }
  function digPlant() {
    state.solved.plant = true;
    addItem("battery");
    save();
    sfx.good();
    render();
    openModal({
      title: "You Dig in the Pot",
      html: `<p>A few scoops of soil and the trowel strikes something solid. You lift out a chunky <strong>Battery</strong>, brush it clean, and pocket it.</p>
             <p class="muted">Something in this room was waiting for power.</p>`,
    });
  }
  function takeTrowel() {
    if (state.flags.trowelTaken) {
      openModal({ title: "Hand Trowel", html: `<p>You've already taken the trowel.</p>` });
      return;
    }
    state.flags.trowelTaken = true;
    addItem("trowel");
    save();
    render();
    status("You take the hand trowel.", "good");
  }

  /* ===================================================================
     12. Hint system (progressive, context-aware)
     =================================================================== */
  // For each puzzle: which wall it lives on, whether it's still relevant,
  // and three escalating hints (nudge -> strong -> answer).
  const HINTS = [
    { id: "drawer", wall: "right", relevant: (s) => !s.solved.drawer, tiers: [
      "Some things are left in plain sight. Look closely at what's resting on the desk before you wrestle with the drawers.",
      "The pen cup is holding more than pens. Take the brass key, then use it on the locked drawer.",
      "Open the pen cup, take the Brass Key, select it in your inventory, and click the desk drawer to unlock it.",
    ]},
    { id: "clock", wall: "front", relevant: (s) => !s.solved.clock, tiers: [
      "The framed sampler by the door tells you which part of the clock matters.",
      "The sampler says to mind only the hour. Read where the short hand points.",
      "The clock reads seven o'clock. The clock's number is 7.",
    ]},
    { id: "bookshelf", wall: "back", relevant: (s) => !s.solved.bookshelf, tiers: [
      "The four coloured books each carry a little season. The note from the drawer gives their proper order.",
      "Put the books in the order the year runs — Spring, Summer, Autumn, Winter. Click one book then another to swap them.",
      "Order them Spring (green), Summer (gold), Autumn (orange), Winter (blue). A panel reveals the number 2, and the spines now read green-gold-orange-blue.",
    ]},
    { id: "art", wall: "left", relevant: (s) => !s.solved.art, tiers: [
      "The picture is a colour lock. Something else in the room just put four colours in a deliberate order.",
      "Use the colour order from the sorted bookshelf spines: green, gold, orange, blue.",
      "Enter green, gold, orange, blue into the picture. The frame opens to reveal the number 9.",
    ]},
    { id: "plant", wall: "left", relevant: (s) => !s.solved.plant, tiers: [
      "The soil in the plant pot looks recently disturbed. You'll want something to dig with.",
      "A hand trowel is leaning by the plant stand. Take it, then use it on the pot.",
      "Take the trowel, select it, click the plant, and dig out the Battery.",
    ]},
    { id: "flashlight", wall: "right",
      relevant: (s) => hasItem("flashlight_dead") && hasItem("battery"),
      tiers: [
        "The flashlight from the drawer is dead. It only needs power.",
        "You have a battery now. Combine it with the dead flashlight.",
        "Select the dead flashlight, then click the battery (or use 🔍 → it explains combining) to assemble a working Flashlight.",
      ]},
    { id: "box", wall: "right", relevant: (s) => !s.solved.box, tiers: [
      "The puzzle box has symbols engraved along its lid, but they're tiny.",
      "Use the magnifying glass (from the drawer) to read the engraved symbol order, then set the wheels to match.",
      "Set the four wheels to diamond, circle, triangle, square (◆ ● ▲ ■). The box opens and gives the Cabinet Key.",
    ]},
    { id: "cabinet", wall: "left", relevant: (s) => !s.solved.cabinet, tiers: [
      "The cabinet needs a proper key — and its insides are dark.",
      "Open it with the Cabinet Key from the puzzle box, then shine the working Flashlight inside to read the back panel.",
      "Unlock with the Cabinet Key, then use the Flashlight inside. It reveals the number 5 and a diagram: clock, cabinet, books, picture.",
    ]},
    { id: "door", wall: "front", relevant: (s) => !s.solved.door, tiers: [
      "The door wants four numbers. You can gather one from the clock, one from the bookshelf, one from the picture, and one from the cabinet.",
      "The cabinet's diagram gives the order: clock, then cabinet, then books, then picture.",
      "Enter 7, 5, 2, 9 → 7529 and the door unlocks.",
    ]},
  ];

  function pickHintPuzzle() {
    const relevant = HINTS.filter((h) => h.relevant(state));
    if (!relevant.length) return null;
    // Prefer a puzzle on the wall the player is currently facing.
    const here = WALLS[state.wall].id;
    return relevant.find((h) => h.wall === here) || relevant[0];
  }

  function showHint() {
    const p = pickHintPuzzle();
    if (!p) {
      openModal({ title: "Hint", html: `<p>You've solved everything that needs solving. The way out is the door — enter the code and step through.</p>` });
      return;
    }
    const lvl = state.hintLevel[p.id] || 0;
    const shown = Math.min(lvl + 1, p.tiers.length);
    state.hintLevel[p.id] = shown;
    save();
    let html = `<p class="muted">Hint for: <strong>${puzzleNiceName(p.id)}</strong></p>`;
    for (let i = 0; i < shown; i++) {
      const tag = i === 0 ? "A nudge" : i === 1 ? "Getting warmer" : "The answer";
      html += `<div class="hint-tier"><div class="hint-q">${tag}</div><div>${p.tiers[i]}</div></div>`;
    }
    if (shown < p.tiers.length) {
      html += `<div class="lock-actions"><button class="btn btn-primary" id="more-hint" data-primary>Need more help?</button></div>`;
    } else {
      html += `<p class="muted center">That's the full solution for this step.</p>`;
    }
    openModal({
      title: "Hint",
      html,
      onEnter: () => { if (shown < p.tiers.length) { closeModal(); showHint(); } },
    });
    setTimeout(() => {
      const b = $("more-hint");
      if (b) b.addEventListener("click", () => { closeModal(); showHint(); });
    }, 0);
  }
  function puzzleNiceName(id) {
    return {
      drawer: "the locked desk drawer", clock: "the clock", bookshelf: "the coloured books",
      art: "the framed picture", plant: "the potted plant", flashlight: "the dead flashlight",
      box: "the puzzle box", cabinet: "the cabinet", door: "the door",
    }[id] || id;
  }

  /* ===================================================================
     13. Timer, win flow, menu, how-to
     =================================================================== */
  let timerIv = null;
  function startTimer() {
    stopTimer();
    timerIv = setInterval(() => {
      if (state.won) return;
      state.elapsedMs += 1000;
      updateTimer();
      if (state.elapsedMs % 5000 === 0) save();
    }, 1000);
    updateTimer();
  }
  function stopTimer() { if (timerIv) { clearInterval(timerIv); timerIv = null; } }
  function updateTimer() {
    const total = Math.floor(state.elapsedMs / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    $("timer").textContent = m + ":" + s;
  }
  function elapsedNice() {
    const total = Math.floor(state.elapsedMs / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m === 0) return s + " second" + (s === 1 ? "" : "s");
    return m + " minute" + (m === 1 ? "" : "s") + " and " + s + " second" + (s === 1 ? "" : "s");
  }

  function win() {
    state.won = true;
    stopTimer();
    save();
    sfx.good();
    setTimeout(() => sfx.good(), 250);
    $("win-time").textContent = "You let yourself out in " + elapsedNice() + ".";
    showScreen("win");
  }

  function status(msg, kind) {
    const el = $("status");
    el.textContent = msg;
    el.className = "status flash" + (kind ? " " + kind : "");
    // remove the flash class so it can re-trigger next time
    setTimeout(() => { el.className = "status" + (kind ? " " + kind : ""); }, 500);
  }

  function showMenu() {
    const node = make("div");
    node.innerHTML = `
      <ul class="menu-list">
        <li><button class="btn" id="m-howto">How to Play</button></li>
        <li><button class="btn" id="m-sound">Sound: ${state.settings.sound ? "On" : "Off"}</button></li>
        <li><button class="btn" id="m-restart">Restart (new game)</button></li>
        <li><button class="btn btn-ghost" id="m-title">Back to Title</button></li>
      </ul>`;
    openModal({ title: "Menu", node });
    node.querySelector("#m-howto").addEventListener("click", () => { closeModal(); showHowTo(); });
    node.querySelector("#m-sound").addEventListener("click", () => {
      state.settings.sound = !state.settings.sound; save(); closeModal();
      status("Sound " + (state.settings.sound ? "on" : "off") + ".", "");
      if (state.settings.sound) sfx.good();
    });
    node.querySelector("#m-restart").addEventListener("click", () => { closeModal(); confirmRestart(); });
    node.querySelector("#m-title").addEventListener("click", () => { closeModal(); stopTimer(); showScreen("title"); refreshTitleButtons(); });
  }

  function confirmRestart() {
    const node = make("div");
    node.innerHTML = `
      <p>Start a brand-new game? Your current progress and elapsed time will be cleared.</p>
      <div class="lock-actions">
        <button class="btn" id="cr-no">Keep playing</button>
        <button class="btn btn-primary" id="cr-yes" data-primary>New game</button>
      </div>`;
    openModal({ title: "Restart", node, onEnter: () => { closeModal(); newGame(); } });
    node.querySelector("#cr-no").addEventListener("click", closeModal);
    node.querySelector("#cr-yes").addEventListener("click", () => { closeModal(); newGame(); });
  }

  function showHowTo() {
    openModal({
      title: "How to Play",
      wide: true,
      html: `
        <div class="howto-grid">
          <div class="ic">🔄</div><div>Use the <span class="kbd">‹</span> <span class="kbd">›</span> arrows (or the on-screen arrows) to turn and face each of the four walls.</div>
          <div class="ic">🔎</div><div>Click anything that looks interesting to inspect it up close. Hovering highlights what you can click.</div>
          <div class="ic">🎒</div><div>Items you find go to your <strong>inventory</strong>. Click an item to <strong>select</strong> it, then click an object in the room to <strong>use</strong> it there.</div>
          <div class="ic">🧩</div><div>Click the small 🔍 on an item to inspect it. To <strong>combine</strong> two items, select one and then click the other.</div>
          <div class="ic">💡</div><div>Stuck? The <strong>Hint</strong> button gives a gentle nudge first, then more help, and finally the answer — only if you ask for it.</div>
          <div class="ic">⌨️</div><div><span class="kbd">Esc</span> closes a window or drops a held item. <span class="kbd">Enter</span> submits a lock. <span class="kbd">←</span><span class="kbd">→</span> turn the room.</div>
        </div>
        <p class="muted center" style="margin-top:16px">Everything you need is in the room. There's no guessing and no timer — take your quiet hour.</p>`,
    });
  }

  /* ===================================================================
     14. Boot / screen management / events
     =================================================================== */
  function showScreen(which) {
    const title = $("title-screen"), game = $("game"), winS = $("win-screen");
    title.hidden = which !== "title";
    game.hidden = which !== "game";
    winS.hidden = which !== "win";
    title.setAttribute("aria-hidden", which !== "title");
    game.setAttribute("aria-hidden", which !== "game");
    winS.setAttribute("aria-hidden", which !== "win");
  }

  function refreshTitleButtons() {
    $("btn-continue").hidden = !hasSave();
  }

  function newGame() {
    wipeSave();
    state = freshState();
    save();
    showScreen("game");
    render();
    startTimer();
    if (!state.flags.introSeen) {
      state.flags.introSeen = true;
      save();
      showHowTo();
    }
  }

  function continueGame() {
    const data = loadSave();
    if (!data) { newGame(); return; }
    state = Object.assign(freshState(), data);
    // selected is never restored
    state.selected = null;
    showScreen("game");
    render();
    if (state.won) { win(); return; }
    startTimer();
  }

  function wireEvents() {
    $("btn-new-game").addEventListener("click", newGame);
    $("btn-continue").addEventListener("click", continueGame);
    $("btn-howto").addEventListener("click", showHowTo);
    $("btn-play-again").addEventListener("click", newGame);

    $("nav-left").addEventListener("click", () => navigate(-1));
    $("nav-right").addEventListener("click", () => navigate(1));
    $("btn-menu").addEventListener("click", showMenu);
    $("btn-hint").addEventListener("click", showHint);

    // Clicking empty stage area drops a held item (so it's easy to cancel "use").
    // Hotspot buttons stopPropagation, so this only fires on non-hotspot clicks.
    $("stage").addEventListener("click", (e) => {
      if (e.target.closest(".hotspot")) return;
      if (state.selected) { deselect(); status("You put the item away.", ""); }
    });

    // Modal close controls
    $("modal-close").addEventListener("click", closeModal);
    $("modal-root").querySelector(".modal-backdrop").addEventListener("click", closeModal);

    // Global keyboard
    document.addEventListener("keydown", (e) => {
      if (modalOpen()) {
        if (e.key === "Escape") { e.preventDefault(); closeModal(); }
        else if (e.key === "Enter") {
          // Don't hijack Enter if focus is on a specific button.
          const primary = $("modal-body").querySelector("[data-primary]");
          if (modalOnEnter) { e.preventDefault(); modalOnEnter(); }
          else if (primary) { e.preventDefault(); primary.click(); }
        }
        return;
      }
      if ($("game").hidden) return; // only in-game shortcuts below
      if (e.key === "Escape") { if (state.selected) { deselect(); } else { showMenu(); } }
      else if (e.key === "ArrowLeft") { navigate(-1); }
      else if (e.key === "ArrowRight") { navigate(1); }
      else if (e.key.toLowerCase() === "h") { showHint(); }
    });

    // Keep the saved game when the tab is closed.
    window.addEventListener("beforeunload", save);
  }

  function boot() {
    wireEvents();
    refreshTitleButtons();
    showScreen("title");
  }

  // Expose a tiny debug hook (handy for testing in the console).
  window.__quietHour = {
    state: () => state,
    solveAll: () => { Object.keys(state.solved).forEach((k) => (state.solved[k] = true)); render(); },
    code: () => DOOR_CODE,
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
