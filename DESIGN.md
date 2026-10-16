---
name: Iron Lake property file
description: A recorded, replayable agent run over seven BC assessment reports, and the property file it produced, every mark one click from its call, page or lab row.
colors:
  ink: "#161d29"
  ink-2: "#414854"
  ink-3: "#5d646f"
  paper: "#f4f6f9"
  sheet: "#fcfdff"
  rule: "#dde0e5"
  rule-2: "#c6cbd3"
  night: "#0f1623"
  night-2: "#192030"
  night-3: "#222b3d"
  night-rule: "#303848"
  night-ink: "#eff2f7"
  night-ink-2: "#b1b8c5"
  night-ink-3: "#848c9c"
  blue: "#1762f4"
  blue-ink: "#0e4ec8"
  blue-tint: "#e4efff"
  blue-night: "#5b9eff"
  copper: "#d16d23"
  copper-ink: "#9c470d"
  copper-tint: "#feeadb"
  copper-night: "#ed9c55"
  red: "#db2b33"
  red-ink: "#b71824"
  red-tint: "#ffe7e4"
  red-night: "#ff645f"
  read-night: "#717b8d"
  hover: "#edf0f6"
  map-ground: "#f3f7fa"
  page-line: "#ced1d6"
  sel-night: "#22304a"
  code-chip: "#e5e8ed"
  claude-night: "#203761"
  claude-night-ink: "#bfd9ff"
  fresh: "#d4eaff"
  copper-line: "#edc5a8"
  red-line: "#f4b0aa"
  red-wash: "#fff7f6"
  json-str: "#f5c299"
  assay-0: "#f3ede6"
  assay-1: "#f2d5b8"
  assay-2: "#eeae7b"
  assay-3: "#de8040"
  assay-4: "#bd531d"
  assay-5: "#85311b"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  big:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
  number:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 650
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
  lead:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
  small:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
  micro:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "10.5px"
    fontWeight: 500
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "10px"
  sheet: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  button-quiet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  chip-page:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  who-claude:
    backgroundColor: "{colors.blue-tint}"
    textColor: "{colors.blue-ink}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  who-code:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
---

# Design System: Iron Lake property file

## 1. Overview

**Creative North Star: "The Core Tray"**

Drill core comes out of the ground in trays, laid in order, labelled by hole and depth, and a geologist checks it against the log under good light. This interface does the same with an agent run. The run sits in a night band at the top, eight lanes laid out in time like core in trays, every tool call a mark you can pick up. Below it, on paper, sits what the run produced: the property file, the page each value came from, and the reports' own drill tables drawn as core strips. Night means "what the machine did". Paper means "what the reports say".

Scene: Alan, a P.Geo., opens the link at his office desk in daylight with an ARIS PDF in the next tab, skeptical, about to check three numbers. Daylight reading forces a light working surface; the night band borrows Quminex's own dark slate sections so the run reads as a separate, machine-made thing.

Dense on purpose. The reader is an expert with ten minutes, so the first screen carries the run, the twelve fields and the inspector, with a header line and labels for words. The system rejects the generic AI demo, the essay page, the hero-metric row and any motion the logs don't record.

**Key Characteristics:**
- Night band for the recorded run; paper for the file, sources and tables.
- Quminex blue marks the agent and the controls. Copper marks the reports' own tables. Red marks a check that failed.
- Mono for anything copied from a report or a log; sans for everything the interface wrote.
- Hairlines and spacing group things. Cards only where a thing is a separate object (the inspector, the page crop).

## 2. Colors

Restrained surfaces, with a three-role data palette that never trades meanings.

### Primary
- **Quminex Blue** (#1762f4; #0e4ec8 as text; #5b9eff on night): Quminex's button blue. Controls, selection, focus, and every mark of the agent's own work: accepted claims, session bars when selected, the summary session.

### Secondary
- **Assay Copper** (#d16d23; #9c470d as text; #ed9c55 on night): anything read from the reports' drill collar tables and lab certificates: collars on the map, assay strips, "Settled by" lines. Taken from the copper glow in Quminex's imagery, and it is the metal Iron Lake was drilled for.

### Tertiary
- **Check Red** (#db2b33; #b71824 as text; #ff645f on night): a check that failed. A claim the checker threw out, an eval miss, a table row its own lab sample doesn't bear out. Nothing else is red.

### Assay ramp
Six steps from paper to dark copper (assay-0 to assay-5) shade lab samples on the core strips and hole logs. Copper bins: under 30, 30 to 100, 100 to 300, 300 to 1,000, 1,000 to 3,000, 3,000 ppm and up; nickel bins: under 300, 300 to 1,000, 1,000 to 1,500, 1,500 to 2,000, 2,000 to 3,000, 3,000 and up. Every strip shows its legend. It is the copper role at six strengths, not a new hue.

### Neutral
- **Ink** (#161d29), **Ink 2** (#414854), **Ink 3** (#5d646f, the lightest text allowed on paper).
- **Paper** (#f4f6f9) and **Sheet** (#fcfdff). **Rule** (#dde0e5), **Rule 2** (#c6cbd3).
- **Night** (#0f1623), **Night 2** (#192030), **Night 3** (#222b3d, session bars), **Night rule** (#303848), **Night ink** (#eff2f7, #b1b8c5, #848c9c).
- **Read ticks** (#717b8d): searches and page opens, grey on purpose. Reading is background work.

**The Three Roles Rule.** Blue is the agent, copper is the reports' own tables, red is a failed check. A fourth meaning gets a shape or a word, never a hue.

## 3. Typography

**Interface:** Plus Jakarta Sans (Quminex's site font), with system-ui.
**Data:** IBM Plex Mono, with ui-monospace.

One sans carries the interface on a tight product scale, named in `styles.css` as `--t-micro` 10.5, `--t-xs` 11.5, `--t-sm` 12.5, `--t-md` 13.5, `--t-base` 14, `--t-lg` 15, `--t-title` 18, `--t-num` 20, `--t-big` 22 and `--t-display` 28. Plex Mono marks every string copied from a report or a log, so quoted data and interface copy never blur. Chart labels use the micro step; nothing goes below it except the hole numbers over a 23-hole core tray (9.5).

### Hierarchy
- **Display** (700, 28px): big numbers in the run readout and the eval score. Never a page headline over prose.
- **Title** (700, 17px): the inspector's subject, section heads.
- **Body** (400, 14px, 1.5): rows, inspector text. Prose capped at 68ch.
- **Label** (600, 12px): column heads, lane names, legend items, chips. Sentence case.
- **Data** (400, 12.5px mono, tabular figures): values, hole IDs, depths, page refs, call times.

**The Quoted-Is-Mono Rule.** Values, IDs, page refs and times copied from a report or a log are mono. Long quoted sentences stay sans, inside quote marks or the quote block, because mono paragraphs are hard to read. If the interface wrote it, it is sans.

## 4. Elevation

Flat. Depth comes from the night/paper split and from paper to sheet. Two shadows only: the inspector sheet on narrow screens (`0 -8px 32px rgb(15 22 35 / 0.22)`) and chart tooltips (`0 6px 20px rgb(15 22 35 / 0.28)`).

## 5. Components

### Buttons
- **Primary** (blue, sheet text, 6px radius): Replay only.
- **Quiet** (sheet, 1px Rule 2 border): everything else. Segmented controls are joined quiet buttons; the pressed one fills with ink (night-ink on night).
- **Focus:** 2px blue ring, 2px offset, on every control. Hover darkens one step in 120ms.

### Who chips
"Claude" (blue tint, blue ink) or "Code" (paper, ink 2), on every pipeline step and inspector view, so no one mistakes code for the model.

### Page chips
Mono `41327 p33`, sheet, 1px Rule border. Scanned pages add the word "scan". A chip opens the claim's page crop.

### The Run Chart (signature)
Eight lanes on night: four field workers, four eval workers, time left to right across 7:32. A session is a Night 3 bar labelled with its field or question. Each tool call is a 2px tick at its logged time: read-grey and short for search and open_page, blue and taller for an accepted claim, red, full height with a cap for a rejection, a blue ring for a refusal. Replay sweeps a playhead; ticks past it are clipped, not re-rendered. Picking a filter (rejections, refusals) dims every other tick to 15%.

### Pipeline
One row of steps under the chart: Claude sessions, the quote checker (joined to the sessions by a two-way glyph, since it runs inside every claim call), drill tables, the summary session, the eval. Each step: who chip, name, one number, one short line. Steps are buttons that open their detail in the inspector; the checker step also dims every tick but the thrown-out ones.

### Inspector
Right column on desktop, bottom sheet under 900px. It shows one thing at a time (a field, a session, a call, a claim, a drill hole, a pipeline step) with a back button to the previous one. A claim shows its page map, the quote with its value marked, the checker's verdict, the ARIS link, and the calls that produced it with their times.

### Page map
The cited page drawn as geometry: every text line a grey bar at its real place, the quote's lines boxed in blue, the value underlined. No page text and no page image ships (README, "Why there are no page images"); the map links to the page on ARIS.

### Your call
Where a table row and its own lab disagree and code can't settle it, one bordered box asks which figures the file carries: two joined buttons, the pick kept in the viewer's browser and labelled so. The only question the site asks.

### Core strips
Drill holes as vertical strips, depth down, each lab sample a band on the assay ramp. The report's stated intervals sit beside the strip as brackets: ink when the lab bears them out, red when it doesn't, dashed grey when the lab samples don't reach them. A hole log repeats this for one hole with each sample as a bar on a log scale, and a zoom lists the samples around one interval with the report's figure marked in red.

## 6. Do's and Don'ts

### Do:
- **Do** show the run and the file on the first screen, with 40 words of prose or fewer.
- **Do** give every tick, value, collar and score a click that ends at its call, page, rule or lab row.
- **Do** label recorded data as recorded: "Recorded run, Oct 15, 2026".
- **Do** put a "Claude" or "Code" chip on every step.
- **Do** keep hints next to their control, 8 words or fewer.

### Don't:
- **Don't** build the generic AI demo: centered hero, gradient blobs, glass, emoji, badge soup.
- **Don't** build the essay page or a numbered walkthrough.
- **Don't** use the hero-metric row of big-number cards.
- **Don't** animate anything the logs don't record: no typing effects, no "thinking", no invented progress or timings for code steps.
- **Don't** use colored side stripes over 1px on rows or callouts.
- **Don't** give a fourth meaning its own hue.
