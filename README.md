# Digger 2027

**▶ Play it: <https://ubershmekel.github.io/digger-2027/>**

A fan-made, modern version of the original 1983 **[Digger](https://en.wikipedia.org/wiki/Digger_(video_game))** (Windmill Software, designed by Rob Sleath), a Mr. Do! / Dig Dug-style maze game.

It's the same game: the same eight levels, the same rules, monster AI, timing and tunes, verified tick-for-tick against the original logic. What's new is the presentation and the comfort: real-time 3D graphics, jazz arrangements of the original music, and modern quality-of-life features. Press **F2** at any time to switch to the original CGA graphics, and **F3** for the original PC-speaker sound.

> License: **GPL-2.0-or-later** (see [LICENSE](LICENSE)). The upstream Digger Remastered code is GPLv2.
>
> Inspiration and behaviour reference: the browser port at <https://www.futrega.org/digger/>.

## Controls

| Action | Keys |
|---|---|
| Move | Arrow keys or WASD |
| Fire | Space, Ctrl, F1, Z or J |
| Pause | Esc or P |
| Classic graphics on/off | F2 |
| Classic sound on/off | F3 |
| Mute | M |
| Skip a cut-scene | Press Fire twice (a prompt appears) |

Gamepads work (D-pad or stick, A to fire, Start to pause), and touch devices get an on-screen D-pad and fire button.

## Development

```bash
npm install
```
```bash
npm run dev
```

`npm test` runs the test suite and `npm run build` makes a static build in `dist/`. Every push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

Dev helpers: `?autoplay` (or `?autoplay=3` for level 3) jumps straight into a game, and `window.app` is exposed in dev builds.

---

## 1. Goals

| Goal | What it means in practice |
|---|---|
| **Plays like the original** | Same 8 levels, scoring, monster AI, bag physics, bonus mode, fire recharge, extra lives, 1P/2P alternating. Same logic tick rate. Veterans should not have to relearn anything. |
| **Sucks less** | Smooth rendering at any refresh rate, responsive layout, proper pause, turn buffering, gamepad and touch support. |
| **3D, cinematic, recognisable** | Real 3D models and lighting in a side-on diorama. Every entity keeps its silhouette, palette cues and animation beats from the CGA sprites. |
| **Beautiful music, same notes** | Jazz arrangements of the *same* melodies: the main theme, the bonus-mode theme, the death dirge and the level jingle. Sound effects keep their original pitch contours, with richer timbre. |
| **Never make the player wait** | Every cut-scene and transition is skippable. Skipping fast-forwards the game logic, so nothing desyncs. |
| **Quality of life** | Separate master, music and effects volume, mute, pause, gamepad, touch controls, high scores saved in the browser. |
| **Classic mode** | Hotkeys and menu toggles switch the graphics (F2) and the sound (F3) back to the original CGA look and PC-speaker sound, live, mid-game, and back again. |

### Non-goals (for v1)
- New levels, new enemies or rule changes. (A level editor or "remix" mode could come after 1.0.)
- Online leaderboards or accounts.
- Native or mobile app stores. It's a web game; a PWA install is enough.

---

## 2. How it stays faithful

The game logic is a TypeScript port of the browser port at [futrega.org/digger](https://www.futrega.org/digger/), which itself comes from Andrew Jenner's C *Digger Remastered*. The port keeps the original module structure (`main`, `digger`, `monster`, `bags`, `drawing`, `sprite`, `scores`, `sound`) and constants unchanged.

- **The original screen is part of the game state.** Digger's fireball detects dirt by reading screen pixels, so the sim keeps an exact virtual 320×200 CGA framebuffer. That makes the logic bit-exact, and classic mode simply displays that buffer.
- **The flow is a generator.** The original's async loops became a generator that yields "wait N ms". That keeps the sim deterministic and lets any cut-scene be fast-forwarded.
- **Parity test.** `tests/parity.test.ts` runs the original JS side by side with the port, on the same seed and scripted input, and compares the framebuffer and state after every tick. It runs locally when the reference sources are present in a gitignored `old/` folder, and is skipped otherwise.
- **One fix:** the reference JS port skipped a level when the last emerald was collected (it advanced the level twice). The port follows the C original instead.

### Rules checklist (must match exactly)
- Dig horizontal and vertical tunnels; each level starts with some tunnels pre-dug.
- Monsters spawn at the top-right as **Nobbins**. They sometimes turn into **Hobbins** (more often on higher levels). Hobbins dig, and they destroy emeralds and gold bags in their path.
- When a monster dies, another spawns, up to a per-level maximum. Once they've all spawned, a **cherry** appears top-right. Eating it starts **bonus mode** (≈15 s, shorter on higher levels): monsters flee and the Digger can eat them.
- Undermined bags wobble, then fall. A bag **breaks into gold only if it falls more than one row**. Bags can be pushed left and right. Falling bags squash monsters *and* the Digger.
- The weapon fires in a straight line, then recharges. Recharge takes **longer on higher levels**.
- A level ends when **all emeralds are collected or all monsters are killed**.
- Scoring: emerald 25, 8-in-a-row bonus 250, monster kill (shot or squashed) 250, gold 500, entering bonus mode 1000, bonus eats 200 / 400 / 800… (doubling), extra life every 20,000.

---

## 3. Architecture

```
               ┌────────────────────────────────────────────┐
  Input ──────▶│  SIM (pure TS, deterministic, no DOM)      │
 (kbd/pad/touch)│  76 ms tick, seeded RNG, virtual CGA screen│
               └──────────┬───────────────────┬─────────────┘
                          │ state + events    │ sound commands
               ┌──────────▼─────────┐  ┌──────▼───────────────┐
               │ RENDERER (swappable)│  │ AUDIO (swappable)    │
               │  • HD: Three.js     │  │  • HD: jazz + synth  │
               │  • Classic: CGA 2D  │  │    effects           │
               │  interpolates ticks │  │  • Classic: PC       │
               └────────────────────┘  │    speaker worklet   │
                                        └──────────────────────┘
               UI layer (HTML/CSS overlay): menus, HUD, settings
```

1. **The sim never touches rendering.** It exposes its state (sprite table, dug mask, emeralds, scores) and emits *events* (`emerald`, `bagLand`, `gold`, `monsterKilled`, `explode`, `diggerHit`, `levelStart`…) plus the original's sound commands.
2. **Fixed-timestep sim, interpolated rendering.** The sim runs at the original rate (1000/13 ms per tick). The 3D renderer draws at display refresh and interpolates between ticks.
3. **Renderers and audio backends are hot-swappable** on the same live sim.

### Layout
```
src/
  sim/          # the ported game logic, levels and extracted CGA data
  app/          # frame driver (fixed-rate stepping, pause, skip) and app wiring
  render/
    classic/    # shows the virtual CGA framebuffer
    hd/         # Three.js scene, terrain, procedural models, textures, effects
  audio/
    classic/    # AudioWorklet port of the original PC-speaker engine
    hd/         # synthesized instruments, arrangements, jazz backend
  input/        # keyboard, gamepad, touch
  ui/           # menus, settings, HUD, high scores, initials
  storage/      # localStorage for settings and high scores
tools/          # extract-data.mjs: CGA sprites and font → TypeScript data
tests/          # parity test against the reference port
```

---

## 4. Visuals (HD mode)

- **Camera:** a side-on diorama with a slight downward tilt. The whole playfield is always on screen, as in the original. A gentle drift, shakes on impacts and an ease-in on death are all disabled by "Reduced motion".
- **Earth:** a cross-section slab whose front face is a heightfield carved live from the sim's per-pixel dug mask, with crumbly edges. Each level has its own soil theme, derived from the colours of the original's eight dirt patterns. A grassy surface and night sky sit above.
- **Lighting:** a key light with soft shadows, the Digger's headlamp, fireballs and explosions as real lights, plus bloom.
- **Characters**, built procedurally in code (`src/render/hd/models.ts`) and modelled on the CGA sprites:
  - **Digger:** a red machine with yellow wheels and a green drill that pumps in and out like the sprite's scoop. Its yellow hoop stands tall when the weapon is ready and sinks while recharging.
  - **Nobbin:** a green body with two big yellow eyes on top and red legs planted wide.
  - **Hobbin:** side-on and spiky, with one yellow eye and snapping red jaws, facing the way it travels. Nobbins pop into Hobbins with a puff of smoke.
  - **Gold bag:** a leather sack with a `$` that wobbles, falls and bursts into a heap of coins.
  - Also faceted **emeralds**, the **cherry**, the **fireball**, and the **gravestone**.
- **Effects:** particles, tossed coins, score popups and title cards.
- **Title screen:** the original cast introduction, restaged in a cave, beside the menu and a high-score table.

## 5. Audio (HD mode)

Composed as code, and synthesized: no samples ship with the game.

| Cue | Original table | Arrangement |
|---|---|---|
| Main theme (*Popcorn*) | `backgjingle` | Medium swing in D minor: vibes lead, then a Rhodes chorus. Walking bass, brushes then sticks. Two choruses, looped. |
| Bonus (*William Tell*) | `bonusjingle` | Up-tempo hard bop: muted trumpet lead with band hits on the long notes. |
| Death (Chopin's *Funeral March*) | `dirge` | Piano in octaves over strings. |
| Level complete | `newlevjingle` | Vibes arpeggios over lush Rhodes chords and a cymbal swell. |

- **Instruments:** FM electric piano, vibraphone, upright bass, muted trumpet, strings, piano, and a drum kit (ride, hi-hat, brushes, snare, kick). All are synthesized with Web Audio (`src/audio/hd/instruments.ts`).
- **Rendering:** each cue is bounced in an `OfflineAudioContext` when the game starts. Looping cues get their reverb tail folded back onto the start, so the loop is seamless.
- **Effects** are synthesized live and follow the original's pitch contours. Emerald pickups climb the original C-major scale on vibes. A falling bag gets a dropping whistle and a wobbling bag creaks. Gold goes "cha-ching". Eating monsters gulps higher with each bite. Death is a sad muted trombone.

> **Decision:** the main theme is *Popcorn* (Gershon Kingsley, 1969), in a jazz arrangement, as in every Digger version. The bonus theme (Rossini) and the dirge (Chopin) are public domain. *Popcorn* is still under copyright, and an arrangement doesn't change that. That's fine for a free fan project, but it would need revisiting before any commercial release.

## 6. Classic mode

- **Graphics (F2):** the sim's own CGA framebuffer, scaled with nearest-neighbour filtering, with an optional CRT overlay.
- **Sound (F3):** the original PC-speaker engine, ported to an AudioWorklet. Music and effects are on separate channels, so the volume sliders still work.

## 7. Quality-of-life features

- [x] Master, music and effects volume, plus mute (M). All settings persist and apply live.
- [x] Audio unlocks on the first interaction, via a "press any key" start screen.
- [x] Arrow keys / WASD, Space / Ctrl / F1 to fire, Esc / P to pause.
- [x] Gamepad support.
- [x] Touch controls (on-screen D-pad and fire), automatic on touch devices.
- [x] Turn buffering *(experimental)*: a turn pressed just before a junction is remembered and taken when legal. Off / Short / Normal / Long; Off plays exactly like 1983.
- [x] Auto-pause when the tab or window loses focus.
- [x] Game speed: Slow / Original / Fast.
- [x] 1P / 2P alternating, as in the original.
- [x] Every cut-scene is skippable, via a fast-forward in the sim.
- [x] High scores (top 10 with initials) kept in `localStorage`, surviving restarts. Old `ds` scores from the reference port are imported. Reset is in Settings. Scores made with assists are marked.
- [x] Graphics quality presets (Low / Medium / High) and reduced motion.
- [ ] Rebindable keys.
- [ ] Starting-level select.
- [ ] Fullscreen toggle.
- [ ] Colour-blind and high-contrast options; captions for audio cues.

---

## 8. Roadmap

### Phase 0: Foundations
- [x] Vite + TS + Three.js project skeleton, Vitest, CI.
- [x] GitHub Pages deploy via GitHub Actions.
- [x] `tools/extract-data.mjs`: CGA sprites and font extracted into TypeScript data.
- [x] Measure the reference timing (76 ms ticks).
- [ ] Lint and Playwright smoke tests.

### Phase 1: Faithful sim + classic renderer
- [x] Port the sim module by module, typed, with no globals or DOM.
- [x] Fireball collision: kept the original pixel reads, on a virtual framebuffer, for exact behaviour.
- [x] Classic renderer and classic audio running on the new sim.
- [x] Scene state machine with skip/fast-forward for every cut-scene.
- [x] Tick-for-tick parity test against the reference port.

### Phase 2: HD renderer
- [x] Diorama camera, earth slab, live tunnel carving.
- [x] 3D models for all entities, interpolation, events driving effects.
- [x] Live HD ⇄ Classic toggle.

### Phase 3: Audio
- [x] Mixer buses (master/music/effects), settings UI, persistence.
- [x] Synthesized instruments, the 4 arranged cues, offline-rendered seamless loops.
- [x] Effects set, plus the classic/jazz toggle (F3).
- [ ] Beat-synced transitions between cues; mix polish.

### Phase 4: Art & polish
- [x] Procedural models and animations: Digger, Nobbin, Hobbin (plus the morph), bag, gold, emerald, cherry, fireball, gravestone.
- [x] Level soil themes, lighting, post-processing, particles.
- [x] Title / cast sequence with high scores, level title cards, game over and high-score entry.
- [x] Quality presets.
- [ ] Automatic quality detection and a performance pass on low-end devices.

### Phase 5: QoL & ship
- [x] Gamepad, touch, PWA manifest.
- [ ] Rebinding, more accessibility options, offline cache.
- [ ] Cross-browser testing (Chrome, Firefox, Safari desktop + iOS, Android Chrome).
- [ ] v1.0 release.

### Later / maybe
Replays and sharing, a daily-seed challenge, a level editor, "remix" levels, simultaneous 2P co-op (Digger Remastered added a simultaneous 2-player mode).

---

## 9. Decisions

| Topic | Decision |
|---|---|
| Name | **Digger 2027**. *Digger HD* (Creat Studios, PS3, 2009) and *Digger Remastered* (Andrew Jenner) are both taken. |
| License | **GPL-2.0-or-later**, to match the GPLv2 upstream. |
| Main theme | **Popcorn**, jazz-arranged (see §5). |
| Art | Made by Claude, procedurally and as code. |
| Music & SFX | Composed and synthesized by Claude, as code. |
| Turn buffering | Experimental. On by default ("Normal"), tunable, and the final default is decided after playtesting. |
| High scores | Persistent `localStorage`, surviving browser restarts. |
| Cut-scenes | All skippable, via fast-forward in the sim. |

---

## 10. Credits

- Original *Digger* © 1983 Windmill Software. Designed by Rob Sleath; released under the GNU GPL in 1998.
- *Digger Remastered* by Andrew Jenner ([digger.org](http://www.digger.org/)).
- The browser port at [futrega.org/digger](https://www.futrega.org/digger/), the inspiration and behaviour reference for this project.
- Digger 2027 is a fan-made, modern version of the original game, licensed under the GNU GPL v2 or later.
