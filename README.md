# Digger 2027

A modern, 3D, browser-native reimagining of **[Digger](https://en.wikipedia.org/wiki/Digger_(video_game))** (Windmill Software, 1983, designed by Rob Sleath). Digger is a Mr. Do! / Dig Dug-style maze game.

It should play like the original: same levels, same rules, same tight grid feel, same tunes. It should also look, sound and handle like a game made this decade. Think of a cinematic remaster that is still obviously Digger: you should recognise every sprite, just lit, modelled and animated properly.

> Status: **planning**. No code yet. The 1:1 JS port this is based on lives in a local, gitignored `old/` folder. It's reference material only.
>
> License: **GPL-2.0-or-later** (see [LICENSE](LICENSE)). The upstream Digger Remastered code is GPLv2.

---

## 1. Goals

| Goal | What it means in practice |
|---|---|
| **Plays like the original** | Same 8 levels, scoring, monster AI, bag physics, bonus mode, fire recharge, extra lives, 1P/2P alternating. Same logic tick rate. Veterans should not have to relearn anything. |
| **Sucks less** | No input lag or dropped turns, smooth 60–144 fps rendering, responsive layout, proper pause, no pixel-read collision quirks caused by the framebuffer, gamepad and touch support. |
| **3D, cinematic, recognisable** | Real 3D models and lighting in a side-on diorama. Every entity keeps its silhouette, palette cues and animation beats from the CGA/EGA sprites. |
| **Beautiful music, same notes** | Smooth jazz arrangements (piano trio, brushes, upright bass, a bit of brass or vibes) of the *same* melodies: the main theme, the bonus-mode theme, the death dirge and the level jingle. SFX keep their original pitch contours, with richer timbre. |
| **Never make the player wait** | Every cut-scene and transition is skippable: the attract sequence, level intro, death and gravestone, level clear, game over. Skipping fast-forwards the game logic, so nothing desyncs. |
| **Quality of life** | Separate master, music and SFX volume, mute, pause, rebindable keys, gamepad, touch controls, high scores saved in the browser. |
| **Classic mode** | A menu toggle (and hotkey) that switches the renderer, and optionally the audio, back to the original CGA look and PC-speaker sound, live, mid-game, and back again. |

### Non-goals (for v1)
- New levels, new enemies or rule changes. (A level editor or "remix" mode could come after 1.0.)
- Online leaderboards or accounts.
- Native or mobile app stores. It's a web game; a PWA install is enough.

---

## 2. What we inherit from `old/`

`old/src/*.js` is a straight port of the C Digger Remastered source. It's useful as the **spec** but not as a code base:

| File | Contains | How we use it |
|---|---|---|
| `Main.js` | `leveldat` (8 level maps, 15×10 chars: `S` start, `B` bag, `C` emerald, `H`/`V` pre-dug tunnels), level progression, game loop, attract screen | Port the level data verbatim. Port the loop as the new sim's state machine. |
| `Digger.js` | Player movement, digging, firing, bonus mode, death sequence, emerald pickup / 8-in-a-row bonus | Port the logic. **Replace** fireball collision, which uses `Pc.ggetpix` (reads framebuffer pixels!), with queries against the tunnel mask. |
| `Monster.js` | Nobbin/Hobbin AI, spawning, transformation, squash/kill | Port the logic, keeping the same RNG usage order so behaviour matches. |
| `Bags.js` | Bag push, wobble, fall, break into gold, squash | Port the logic. |
| `Sprite.js` | Sprite table, bounding-box collision (`bcollide`) | Keep the collision maths and drop the drawing side. |
| `Drawing.js` | The `field` arrays (dig state per cell), `eatfield` tunnel carving | Becomes the **tunnel mask** model, which both renderers draw from. |
| `Scores.js` | Scoring constants, high-score table (already in `localStorage` key `ds`) | Port it. Scoring: emerald 25, 8-emerald streak +250, gold 500, kill 250, bonus eat 200×2ⁿ, extra life every 20,000 (max 5 shown). |
| `Sound.js` | Note tables `backgjingle` (main theme), `bonusjingle` (bonus theme), `dirge`, `newlevjingle`, `emfreqs`, plus the SFX envelopes | **Source of truth for every melody and SFX pitch.** Convert the PIT divisors to MIDI (`f = 1193180 / divisor`). |
| `cgagrafx.js`, `alpha.js` | CGA sprite bitmaps and font | Decoded into a texture atlas for **classic mode**. |

### Rules checklist (must match exactly)
- Dig horizontal and vertical tunnels; each level starts with some tunnels pre-dug.
- Monsters spawn at the top-right as **Nobbins**. They sometimes turn into **Hobbins** (more often on higher levels). Hobbins dig, and they destroy emeralds and gold bags in their path.
- When a monster dies, another spawns, up to a per-level maximum. Once they've all spawned, a **cherry** appears top-right. Eating it starts **bonus mode** (≈15 s, shorter on higher levels): monsters flee and the Digger can eat them.
- Undermined bags wobble, then fall. A bag **breaks into gold only if it falls more than one row**. Bags can be pushed left and right. Falling bags squash monsters *and* the Digger.
- The weapon fires in a straight line, then recharges. Recharge takes **longer on higher levels**.
- A level ends when **all emeralds are collected or all monsters are killed**.
- Scoring: emerald 25, 8-in-a-row bonus 250, monster kill (shot or squashed) 250, gold 500, entering bonus mode 1000, bonus eats 200 / 400 / 800… (doubling), extra life every 20,000.

The whole game logically lives in a **320×200 coordinate space** on a 15×10 cell grid (20×18 px cells). We keep that space as the simulation's coordinate system, so all the original constants carry over unchanged.

---

## 3. Architecture

```
               ┌────────────────────────────────────────────┐
  Input ──────▶│  SIM (pure TS, deterministic, no DOM)      │
 (kbd/pad/touch)│  fixed tick ≈ original rate, seeded RNG    │
               │  state: digger, monsters, bags, gold,      │
               │  emeralds, fire, bonus, tunnel mask, score │
               └──────────┬───────────────────┬─────────────┘
                          │ snapshot + events │ (dig, eat, fall, die, …)
               ┌──────────▼─────────┐  ┌──────▼───────────────┐
               │ RENDERER (swappable)│  │ AUDIO DIRECTOR       │
               │  • HD: Three.js     │  │  • HD: jazz stems +  │
               │  • Classic: CGA 2D  │  │    sampled SFX       │
               │  interpolates ticks │  │  • Classic: square   │
               └────────────────────┘  │    wave PC-speaker   │
                                        └──────────────────────┘
               UI layer (HTML/CSS overlay): menus, HUD, settings
```

Key principles:

1. **The sim never touches rendering.** It emits a state snapshot each tick plus a list of *events* (`EmeraldEaten`, `BagWobble`, `BagFall`, `GoldBurst`, `MonsterSpawn`, `MonsterHobbinify`, `FireShot`, `FireHit`, `DiggerDie`, `BonusStart`, `BonusEnd`, `LevelClear`, `ExtraLife`…). Renderers and audio react to those events.
2. **Fixed-timestep sim, interpolated rendering.** The sim runs at the original logic rate (≈ `ftime` 50 ms ≈ 20 Hz, but this gets measured against the reference build). The renderer draws at display refresh and lerps positions between the last two ticks, so the grid snapping feels the same but motion looks smooth.
3. **Determinism.** Seeded RNG and a fixed tick mean we get replays for free (input log + seed). We'll use that for regression tests against the original's behaviour, and possibly a "watch replay" feature later.
4. **Renderers are hot-swappable.** Classic mode is just a different renderer and audio backend on the same live sim. Toggling it is instant and doesn't pause or reset anything.

### Tech stack
- **TypeScript + Vite**: fast dev server, static build, deployable anywhere (GitHub Pages, Netlify, itch.io).
- **Three.js** for the HD renderer: WebGL2 now, WebGPU renderer when stable. glTF/GLB assets with Draco/Meshopt compression and KTX2 textures.
- **Web Audio API** for mixing: separate music/SFX/master `GainNode` buses. Probably no Tone.js. Plain Web Audio plus a small scheduler is enough.
- **Vitest** for sim unit tests, **Playwright** for smoke and visual tests of both renderers.
- No framework for UI. A thin HTML/CSS overlay (or Lit if it grows). The menus should be keyboard and gamepad navigable.

### Proposed layout
```
src/
  sim/          # pure game logic ported from old/: levels, digger, monsters, bags, scores, rng
  render/
    hd/         # Three.js scene, materials, tunnel mesh, VFX, camera
    classic/    # CGA atlas + 2D canvas blitter (pixel-perfect, integer scaled)
  audio/
    hd/         # stem player, sampled SFX, ducking
    classic/    # square-wave PC-speaker emulation driven by original tables
  input/        # keyboard, gamepad, touch, rebinding
  ui/           # title, menus, settings, HUD, high scores, pause
  storage/      # localStorage wrapper (settings + high scores)
assets/
  models/ textures/ audio/ fonts/
tools/          # scripts: convert note tables → MIDI, decode CGA sprites → PNG atlas
old/            # reference implementation: local only, gitignored, never imported
```

---

## 4. Visual direction (HD mode)

**Camera:** a side-on "living diorama". A perspective camera with a slight downward tilt and a narrow FOV, so the 15×10 grid reads exactly like the original while the dirt has real depth. The camera gets a subtle breathing drift, eases in on death, and gives a small punch on bag impacts (all toggleable). The whole playfield always fits on screen, with no scrolling, just like the original.

**The world:**
- **Earth:** a thick slab of layered soil (strata, pebbles, roots, the odd fossil) seen in cross-section. The original's brown/blue CGA dirt patterns become *per-level material themes* that echo the original palette shift between levels.
- **Tunnels:** carved for real. The sim's tunnel mask drives a mesh rebuilt per dirty chunk (marching squares on the mask, extruded inward with a bevel), with crumbly edges, falling dirt particles and ambient occlusion in the tunnel.
- **Lighting:** dark, moody underground. The Digger has a headlamp. Emeralds glow faintly. Gold sparkles. Fireballs are real light sources. Soft shadows, bloom, a little volumetric dust in the headlamp cone.

**Entities** (each keeps its original silhouette and colour cue):

| Original | Reimagined |
|---|---|
| **Digger**: little red/yellow drilling vehicle | A chunky, cute mining machine with a spinning drill bit, treads, a glass cab and a headlamp. Turns and drives exactly on the original grid. Gets dirty as it digs. Classic death "flip and gravestone" kept as a cinematic beat. |
| **Nobbin**: green blob with eyes | A squishy green gelatinous creature with big googly eyes and a wobbly subsurface-scattering body. |
| **Hobbin**: Nobbin with arms, digs through dirt | The same creature, but it sprouts little arms and claws, chomps through earth and kicks up debris. The transformation is an animated morph. |
| **Gold bag** with `$` | A worn leather sack with a `$` stitched on it. It wobbles (with the same timing) before falling, then bursts into a spill of coins and nuggets that stays put as pickup-able gold. |
| **Emerald** | A faceted green gem with refraction and glints. On pickup it pops out with a chime-synced sparkle. |
| **Bonus cherry** | Glossy cherries. Bonus mode tints the world (a nod to the original palette flash) and the monsters turn frightened. |
| **Fireball** | A glowing plasma bolt with a trail. Same speed, same recharge. |
| **Lives / HUD** | Score in a clean modern typeface with a retro wink. Lives shown as little Digger icons. |

**Screens:** an animated title with the original attract sequence (Nobbin and Hobbin walk in and get introduced) restaged in 3D, plus level intro and clear transitions, and a game-over card with high-score entry. **All of these are skippable** (see §7).

**Art pipeline: authored as code (by Claude).** There's no external artist, so every asset is generated procedurally in the repo. That makes it reproducible, diffable and easy to tweak:
- **Models** are built in TypeScript from Three.js primitives under `src/render/hd/models/`: lathe and extrude shapes, rounded boxes, tubes, and marching-cubes metaballs for the gooey Nobbin and Hobbin bodies. Each model is a function with parameters (`makeDigger({ dirt: 0.3 })`), so variants are cheap.
- **Animation** is procedural too: drill spin, tread scroll, squash-and-stretch, a blob wobble from vertex-shader noise, and the Nobbin→Hobbin morph done with blend shapes.
- **Materials and textures** come from shaders: noise-based soil strata, gem refraction, leather and metal, plus a small baked set from `tools/art/` generated at build time into KTX2.
- **Iteration loop:** a dev-only model viewer page (`/viewer.html`) shows each asset under game lighting. We check it with screenshots against the original sprite until it reads as "obviously Digger".
- If a model outgrows procedural code, the fallback is a scripted Blender (`bpy`) generator in `tools/art/`, run headless to export GLB. It's still code, still in the repo.
- Budget: the whole game under ~10 MB, since procedural assets are tiny. One environment probe per level theme.

**Performance tiers:** Low / Medium / High / Ultra presets (shadows, bloom, particles, resolution scale), auto-picked from a quick GPU benchmark on first launch. It should hold 60 fps on an integrated-GPU laptop at Medium.

---

## 5. Audio direction (HD mode)

### Music: same notes, jazz arrangement
Convert the original note tables in `old/src/Sound.js` to MIDI using `tools/`, then arrange them:

| Cue | Original source table | Arrangement idea |
|---|---|---|
| Main theme | `backgjingle` | Mid-tempo swing / lounge piano trio. Melody on Rhodes or vibes, walking upright bass, brushed drums. Loops seamlessly with variations on each pass so it doesn't grate. |
| Bonus mode | `bonusjingle` | The same melody, energised: up-tempo hard bop with a muted trumpet or sax lead and driving ride cymbal. Crossfades in on beat, in the same key family, then hands back to the main theme. |
| Death | `dirge` | A slow, rubato solo piano or a smoky sax over sustained strings. Short and bittersweet. |
| New level | `newlevjingle` | A quick, bright brass and piano flourish. |

**Production approach: composed as code (by Claude).**
- **Scores** live as TypeScript data in `src/audio/hd/scores/`. Each cue keeps the melody taken from the original note tables, and adds an arranged chord chart, a bass line, voicings and drum patterns, all written by hand. Swing feel comes from per-instrument timing and velocity humanisation.
- **Instruments** are sampled, using freely licensed, GPL-compatible packs: a grand piano (e.g. Salamander, CC-BY), upright bass, a brushed drum kit, vibraphone, muted trumpet or sax, Rhodes. They play through an in-house Web Audio sampler with a convolution reverb, a gentle bus compressor and EQ.
- **Two playback paths, one engine.** A `tools/render-music` script runs the same sequencer through an `OfflineAudioContext` and bounces each cue to **loopable OGG/Opus stems (with AAC for Safari)**, so the shipped game streams cheap pre-rendered audio. The live sequencer stays available in dev, for fast iteration and beat-synced transitions.
- Every arrangement gets an A/B check against the classic PC-speaker version, so the tune stays instantly recognisable.

> **Decision:** we use *Popcorn* (Gershon Kingsley, 1969) for the main theme, in a jazz arrangement, just as every Digger version has. The bonus theme (Rossini's *William Tell Overture*) and the dirge (Chopin's *Funeral March*) are public domain. Note for later: *Popcorn* is still under copyright, and an arrangement doesn't change that. It's fine for a free fan project, but it would need revisiting before any commercial release.

### SFX
Every original SFX keeps its **pitch contour and timing** (from the `Sound.js` envelopes), re-voiced:
- Emerald pickup: a rising vibraphone or celesta note on the original `emfreqs` scale, so 8 in a row plays the same ascending octave run as in 1983 (and resolves with a chord on the 8th).
- Bag wobble, fall and break: wooden creak, a whoosh with the original falling-pitch sweep, a thud, then a coin cascade.
- Fire and explode: a soft zap and a muffled pop.
- Monster eaten (bonus mode): a cartoony gulp whose pitch rises with each consecutive eat (as the 200×2ⁿ score does).
- Extra life: a little jazz lick.
- Digger death: a deflating trombone that blends into the dirge.

The mix uses SFX buses with light ducking of the music on big events, and a small reverb send tuned to "underground cave".

### Classic audio
A square-wave PC-speaker emulator driven directly by the original tables and envelopes. It's chosen independently of classic rendering (so you could have HD visuals with chiptune sound, or the other way round).

---

## 6. Classic rendering mode

- Decode `cgagrafx.js` and `alpha.js` into a sprite and font atlas at build time.
- Draw the 320×200 frame onto an offscreen canvas exactly as the original did, then present it with **integer scaling** and nearest-neighbour filtering. An optional CRT shader adds scanlines, a slight curvature and phosphor glow.
- Toggle from **Settings → Display → Classic graphics**, or with the hotkey **F2**. It switches instantly mid-game.
- A separate toggle for **Classic sound** (Settings → Audio), plus an "authentic" preset that sets both at once.

---

## 7. Quality-of-life features

**Audio**
- Master, Music and SFX volume sliders (0–100). Settings persist and apply live.
- Mute-all hotkey (**M**). Music and SFX can each be muted from the pause menu too.
- Audio unlocks properly on the first interaction (browser autoplay rules), with a "click/tap to start" title screen.

**Controls**
- Arrow keys / WASD to move, **F1** / Space / Ctrl to fire (original F1 kept). **Esc** / P pauses.
- Rebindable keys.
- Gamepad support (D-pad / stick, A to fire, Start to pause).
- Turn buffering: a direction pressed slightly before a junction is remembered for a few ticks and applied when legal. The original felt sticky here. This is the main "sucks less" gameplay change. **Experimental:** it ships *on* by default with a tunable window (`0–8` ticks) behind a settings toggle, and we decide the final default after playtesting.
- Touch controls: a virtual D-pad and fire button (replacing the old `#vkeys`), with adjustable size and opacity.

**Game**
- Auto-pause on tab blur or window focus loss.
- Speed setting (the original had a speed option). Default matches the original.
- 1P / 2P alternating, as in the original.
- Starting-level select for levels you've already reached.
- Accessibility: reduced motion (no camera shake or drift), high-contrast monsters, colour-blind-friendly emerald and gold cues, and subtitles-style captions for audio cues (optional).

**Cut-scenes & transitions: always skippable**
- Any key, click, tap or gamepad button skips: the attract sequence, "get ready" / level intro, death and gravestone and dirge, level clear, game over.
- The first press skips the *current* scene. On the title screen, it goes straight to the menu.
- Skipping is implemented in the sim as **fast-forward to the scene's end state**, not by cutting the visuals, so lives, respawn, RNG and replays stay correct. Audio fades out quickly instead of hard-cutting.
- A "Short transitions" setting trims the unskippable minimum (e.g. the brief beat after death) for speedrunners.

**Display**
- Fullscreen toggle, responsive to any aspect ratio (letterbox the playfield, use the extra space for HUD and ambience), DPR-aware, graphics quality preset.

**High scores & settings: browser storage**
- Top-10 table with 3-letter initials (as in the original), stored in **`localStorage`** so it **survives reloads and browser restarts** on the same browser.
- Keys: `digger2027.highscores.v1`, `digger2027.settings.v1`, with versioned JSON and safe fallback if storage is blocked (private mode means it works but doesn't persist).
- One-time import of the old port's `localStorage["ds"]` scores if present.
- "Reset high scores" in Settings, with a confirmation.
- Separate tables for HD / Classic? No: it's the same game, so there's one table. Scores set with turn buffering or non-default speed get a small marker.

---

## 8. Roadmap

### Phase 0: Foundations
- [ ] Vite + TS + Three.js project skeleton, lint, Vitest, Playwright, CI.
- [ ] GitHub Pages deploy via a GitHub Actions workflow (Vite `base` set to the repo path).
- [ ] `tools/`: decode CGA sprites → PNG atlas; convert `Sound.js` tables → MIDI files.
- [ ] Measure the reference build in `old/`: exact tick rate, speeds and timings.

### Phase 1: Faithful sim + classic renderer (the "it's Digger" milestone)
- [ ] Port `sim/` from `old/src` module by module, typed, with no globals or DOM.
- [ ] Replace pixel-read collision (fireball vs. tunnels) with tunnel-mask queries.
- [ ] Classic renderer and classic audio running on the new sim.
- [ ] Scene state machine with skip/fast-forward for every cut-scene (built into the sim from day one).
- [ ] Replay-based tests: record input logs in `old/` (instrumented) and assert the new sim produces the same score and event trace.
- **Exit criterion:** side-by-side with `old/`, nobody can tell the difference, except that it's smoother.

### Phase 2: HD renderer, greybox
- [ ] Diorama camera, dirt slab, chunked tunnel-mask → mesh carving.
- [ ] Placeholder 3D primitives for all entities, interpolation, the event → VFX hookup.
- [ ] Live HD ⇄ Classic toggle.

### Phase 3: Audio
- [ ] Mixer buses (master/music/SFX), settings UI, persistence.
- [ ] Build the sampler and sequencer, then compose the 4 arranged cues as score data and bounce them to stems.
- [ ] Design and record the SFX set. Event-driven audio director with beat-synced crossfades.

### Phase 4: Art & polish
- [ ] Model viewer page, then procedural models and animations: Digger, Nobbin, Hobbin (plus the morph), bag, gold, emerald, cherry, fireball, gravestone.
- [ ] Level material themes, lighting, post-processing, particles.
- [ ] Title / attract sequence, level transitions, game over and high-score entry.
- [ ] Quality presets and auto-detection, performance pass.

### Phase 5: QoL & ship
- [ ] Gamepad, touch, rebinding, accessibility options, PWA manifest and offline cache.
- [ ] Cross-browser testing (Chrome, Firefox, Safari desktop + iOS, Android Chrome).
- [ ] v1.0 release.

### Later / maybe
Replays and sharing, daily-seed challenge, level editor, "remix" levels, simultaneous 2P co-op (Digger Remastered added a simultaneous 2-player mode).

---

## 9. Decisions

| Topic | Decision |
|---|---|
| Name | **Digger 2027**. *Digger HD* (Creat Studios, PS3, 2009) and *Digger Remastered* (Andrew Jenner) are both taken. |
| License | **GPL-2.0-or-later**, to match the GPLv2 upstream. |
| Main theme | **Popcorn**, jazz-arranged (see §5). |
| Art | Made by Claude, procedurally and as code (see §4). |
| Music & SFX | Composed and produced by Claude, as code (see §5). |
| Turn buffering | Experimental. On by default, tunable, and decided after playtesting. |
| High scores | Persistent `localStorage`, surviving browser restarts. |
| Cut-scenes | All skippable, via fast-forward in the sim. |

Still open: whether copyright may technically sit with Windmill (per digger.org's FAQ) matters only for a commercial release.

---

## 10. Credits

- Original *Digger* © 1983 Windmill Software.
- Designed by Rob Sleath; released under the GNU GPL in 1998.
- *Digger Remastered* C source by Andrew Jenner ([digger.org](http://www.digger.org/)); Digger 2027's game logic is ported from it, via a JS port.
- Digger 2027 is a fan reimagining, licensed under the GNU GPL v2 or later.
