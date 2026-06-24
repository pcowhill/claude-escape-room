# The Quiet Hour

A calm, logic-driven **point-and-click escape room** that runs entirely in your
browser. You spent the whole afternoon lost in a borrowed book in a friend's
study — and now the door has latched itself shut. Look around the four walls,
gather what was left in plain sight, and let yourself out.

It's built in the spirit of classic online escape rooms: serene, observation-
focused, and fair. No jump-scares, no countdown, no guessing — every lock can
be reasoned out from clues that are visible before you need them.

* **One room, four walls** (door, desk, bookshelf, cabinet) you rotate between.
* **5–7 puzzles**, **7 collectable items**, **~16 inspectable objects**.
* Hand-drawn **vector art generated entirely in code** (SVG) — no image, audio,
  or font files of any kind.
* Original game, original puzzles, original art.
* Optional progress saving, a progressive hint system, and an elapsed-time
  counter (no timer pressure).

---

## How to run locally

There is **no build step and no server required.**

1. Download / clone this folder.
2. Open **`index.html`** in any modern desktop browser (double-click it, or
   drag it into a browser window).

That's it. The game works fully offline. If your browser blocks
`localStorage` on `file://` URLs (some do in private mode), the game still plays
perfectly — only the optional save/continue feature is skipped.

> Prefer a local server? Any static server works, e.g.
> `python3 -m http.server` then visit `http://localhost:8000`. It is **not**
> needed, just an option.

### Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure: title screen, game shell, modal + win screens. |
| `styles.css` | All styling (calm palette, layout, responsive rules). |
| `script.js`  | Everything else: room art (SVG), state, puzzles, hints, save/load. |
| `README.md`  | This file. |

---

## Controls

| Action | How |
|--------|-----|
| Turn to another wall | On-screen **‹ ›** arrows, or the **← →** arrow keys |
| Inspect / interact with something | **Click** it (objects highlight gently on hover) |
| Select an inventory item | **Click** it (it lifts and shows "Using…") |
| Use a held item on the room | With an item selected, **click** the target object |
| Combine two items | Select one item, then **click** the other |
| Inspect an item closely | Click the small **🔍** on the item tile |
| Get a hint | **Hint** button (top-right) or press **H** |
| Close a window / drop a held item | **Esc** |
| Submit a lock / confirm | **Enter** |
| Menu (sound, restart, how-to) | **Menu** button, or **Esc** when nothing is held |

The game is keyboard-accessible: hotspots and items are focusable buttons,
`Esc` closes modals, `Enter` submits the focused puzzle.

---

## Design notes

* **Fairness first.** Every code is derivable from clues that exist *before* the
  lock that needs them. There is no pixel-hunting (click targets are generous
  and highlight on hover), no math beyond reading numbers, and no "gotcha"
  interactions. Decorative objects exist (a vase, a globe, a photo) and are
  honestly described as decorative when inspected.
* **A teaching first puzzle.** The brass-key-and-drawer step exists to teach the
  three core verbs — *inspect, take, use* — before anything harder.
* **Interconnected clues.** The bookshelf, once sorted, both reveals a number
  *and* establishes the colour order the framed picture needs, so solving one
  puzzle visibly arms the next. The finale combines a number from four different
  places in the room.
* **Progressive, context-aware hints.** The Hint button looks at what you've
  already solved and which wall you're facing, then offers a gentle nudge first,
  a stronger hint second, and the literal answer only if you keep asking.
* **No timer pressure.** An elapsed-time counter ticks up for those who like it,
  and the completion screen reports it — but nothing is ever lost to time.
* **Clean separation.** In `script.js`, room rendering, inventory, the modal
  system, each puzzle's UI, the hint engine, and save/load are organised into
  clearly-labelled sections (see the code map at the top of the file).
* **Self-contained art.** All visuals are SVG strings produced in code, so the
  whole game is three text files plus this README. Season symbols and lock
  symbols are drawn as vector shapes (not emoji) so they look identical in every
  browser.

---

## Browser compatibility

Tested logic via a full automated DOM playthrough (jsdom) and rendered every
wall to confirm the art. Works in current **Chrome, Edge, Firefox, and Safari**
on desktop. Requirements are modest and widely supported:

* CSS `aspect-ratio` and CSS custom properties (all evergreen browsers, 2021+).
* Inline SVG and `localStorage`.
* `prefers-reduced-motion` is respected (animations are minimised).

Desktop is the primary target; the layout is responsive and playable on tablets
and larger phones. Optional sound effects are generated with the Web Audio API
(off by default; toggle in the Menu) and degrade silently if unavailable.

---

## Accessibility

* All interactive elements are real, focusable `<button>`s with `aria-label`s.
* `Esc` closes any modal and returns focus; `Enter` submits the focused lock.
* The room can be rotated with the keyboard; hints work with the `H` key.
* Status messages use an `aria-live` region.

---

# Spoiler Walkthrough

> ⚠️ **SPOILERS BELOW.** Everything past this point gives away the solution.
> Stop here if you want to play first.

The way out is the **front door**, which needs a **four-digit code**. You collect
one digit each from the **clock**, the **bookshelf**, the **framed picture**, and
the **cabinet**, and the cabinet also tells you the order to enter them.

### Step-by-step

1. **Right wall — the desk (tutorial).**
   * Click the **pen cup**. A **brass key** is tucked among the pens — take it.
   * Select the brass key and click the **locked desk drawer**. It opens, giving
     you a **Magnifying Glass**, a **dead Flashlight**, and a note:
     *"The shelf keeps time. Read the seasons in their turn — Spring, Summer,
     Autumn, Winter."*

2. **Front wall — the clock.**
   * The framed sampler reads *"When you leave, mind only **the hour**."*
   * The clock points to **7 o'clock**. → **Clock number = 7.**

3. **Back wall — the bookshelf.**
   * Four books carry season symbols (sprout = Spring, sun = Summer,
     leaf = Autumn, snowflake = Winter). Click two books to swap them and put
     them in season order: **Spring, Summer, Autumn, Winter.**
   * A hidden panel reveals **2**. → **Bookshelf number = 2.** The sorted spines
     now read **green, gold, orange, blue** — remember that order.

4. **Left wall — the framed picture.**
   * The desk notebook hints: *"The picture only opens for the seasons' own
     colours, in their turn."*
   * Enter the colour sequence from the sorted books: **green, gold, orange,
     blue.** The frame swings open to reveal **9**. → **Picture number = 9.**

5. **Left wall — the plant (get the battery).**
   * A **hand trowel** leans by the plant stand — take it.
   * Select the trowel and click the **potted plant** to dig up a **Battery**.

6. **Inventory — assemble the flashlight (item combine).**
   * Select the **dead Flashlight**, then click the **Battery** (or vice-versa).
     They combine into a working **Flashlight**.

7. **Right wall — the puzzle box.**
   * Click the **puzzle box**. With the **Magnifying Glass** in your inventory,
     the tiny engraving on the lid is readable: **◆ ● ▲ ■**
     (diamond, circle, triangle, square).
   * Set the four wheels to **diamond, circle, triangle, square** and open it to
     get the **Cabinet Key**.

8. **Left wall — the cabinet.**
   * Select the **Cabinet Key** and click the **cabinet** to unlock it — but it's
     dark inside.
   * Select the **Flashlight** and click the cabinet to light it. Pinned inside is
     the number **5** and a diagram showing the order:
     **clock → cabinet → books → picture.** → **Cabinet number = 5.**

9. **Front wall — the door (finale).**
   * Put the four numbers in the cabinet's order:
     clock **7**, cabinet **5**, books **2**, picture **9** → **`7529`**.
   * Enter **7529** on the keypad. The door unlocks — you escaped. 🌿

---

## Puzzle solution list (for testing / debugging)

| Puzzle | Mechanism | Clue source | Answer |
|--------|-----------|-------------|--------|
| Desk drawer | Item use | Brass key in the pen cup | Use **Brass Key** |
| Clock | Observation | Sampler: "mind only the hour" | **7** |
| Bookshelf | Reorder | Drawer note: Spring→Summer→Autumn→Winter | order **spring, summer, autumn, winter** → reveals **2** |
| Framed picture | Colour sequence | Sorted book spines (green, gold, orange, blue) | **green, gold, orange, blue** → reveals **9** |
| Plant | Item use | "Soil recently disturbed" | Use **Trowel** → **Battery** |
| Flashlight | Item combine | Dead flashlight "needs a battery" | **Battery + dead Flashlight** → **Flashlight** |
| Puzzle box | Symbol wheels | Lid engraving (read with Magnifying Glass) | **◆ ● ▲ ■** (diamond, circle, triangle, square) → **Cabinet Key** |
| Cabinet | Item use ×2 | Cabinet key (from box) + flashlight (for the dark) | reveals **5** + order diagram |
| **Door** | 4-digit keypad | Cabinet order: clock, cabinet, books, picture | **7529** |

**Item → use map**

| Item | Found | Used on |
|------|-------|---------|
| Brass Key | Pen cup (desk) | Locked desk drawer (consumed) |
| Magnifying Glass | Desk drawer | Reading the puzzle-box engraving |
| Flashlight (dead) | Desk drawer | Combined with battery |
| Battery | Buried in the plant pot | Combined with dead flashlight |
| Flashlight | Combine above | Lighting the dark cabinet |
| Hand Trowel | By the plant stand | Digging in the plant pot |
| Cabinet Key | Inside the puzzle box | Unlocking the cabinet (consumed) |

**Debug hooks** (browser console): `__quietHour.state()` returns the live game
state, `__quietHour.code()` returns the door code, and `__quietHour.solveAll()`
flags every puzzle solved.

---

*Made as an original, self-contained tribute to the calm, logic-heavy school of
point-and-click escape games. Take your quiet hour.*
