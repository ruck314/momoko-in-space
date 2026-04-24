# Momoko in Space!

A comfortable cosmic RPG inspired by classic NES-era adventure games. Float with
**Momoko** through her ringed home planet, visit her neighbor **Lila**, fly her
rocket to the **Cheese Moon**, and help **MigWord** deliver cheese wheels. Along
the way she'll meet friendly aliens, collect star gems, and decorate her house
with her very own furniture.

## Play

Open `index.html` in any modern browser. Works offline after first visit (PWA).

## Controls

| Action           | Keyboard         | Touch            |
|------------------|------------------|------------------|
| Float / Fly      | Arrow Keys / WASD| D-Pad (left)     |
| Cast Sparkle     | Space / Z        | Sparkle Button   |
| Enter Rocket/House | ↑ (Up)         | Walk close + ↑   |
| Pause            | Escape / P       | Pause Button     |

## Features

- **Pure HTML5 Canvas + JavaScript** — no frameworks, no build tools
- **PWA** — install to home screen, works offline
- **Touch controls** — fully playable on iPad and Android tablets in landscape
- **Dual language** — English and Japanese
- **All art generated in code** — no external image or audio files
- **Chiptune audio** — Web Audio API generated sound effects and music
- **Two planets to explore** — hero's ringed home + the Cheese Moon
- **Furniture placement** — tap-to-place interior decor saved per house
- **Two side quests** — find Lila's star gems, deliver MigWord's cheese wheels
- **No combat** — aliens are friendly, nothing can hurt you. Sparkle them to
  make them twirl happily.

## Characters

- **Momoko** — our hero in a space suit with a sparkle wand
- **Lila** — Momoko's next-door neighbor, who lost 5 star gems
- **MigWord** — lives in a cheese-themed cottage on the Cheese Moon
- **Oliver the Otter** — a friendly otter who tells jokes
- **Kitty Corn** — a sparkle-spotter who shares comet-wishing tips
- **Bob** — a space expert who shares fun facts
- **Wolfe** — Momoko's pet dog (customizable coat)

## Tech Stack

- HTML5 Canvas for rendering
- Web Audio API for procedural sound
- Service Worker for offline caching
- `localStorage` for customization, furniture layouts, and quest progress
- Vanilla JavaScript (ES5 compatible)

## Project Structure

```
index.html          — entry point (meta tags, Back-to-Game-Center link)
css/style.css       — layout, rotate-hint, overlay styles
js/i18n.js          — English & Japanese translations
js/audio.js         — Web Audio API sound engine
js/input.js         — keyboard & touch input handler
js/levels.js        — zone data (Hero's Planet Town, Cheese Moon)
js/entities.js      — all game characters, pickups, NPCs
js/ui.js            — menus, HUD, dialogue, travel menu, house interior
js/engine.js        — game loop, state machine, rendering, zone switching
js/pwa.js           — service worker registration
sw.js               — service worker
manifest.json       — PWA manifest
```

## Adding New Zones

Zone data lives in `js/levels.js`. Each zone is a plain object with:
- `name` — display label
- `width` / `height` — world dimensions
- `bgTop` / `bgMid` / `bgBottom` — gradient stops
- `bgLayer0` / `bgLayer1` / `bgLayer2` — parallax color arrays
- `floorColorA` / `floorColorB` — surface color layers
- `showRings` — true if the sky should have giant planet rings (hero's planet)
- `platforms[]` — solid rocks / cheese chunks
- `decorations[]` — visual-only (`antenna`, `alienFlora`, `crystal`,
  `spaceVine`, `planetRing`, `satellite`, `rocketPad`, `houseDecor`,
  `cheeseCrater`)
- `spawns.{player, enemies, npcs, pickups}` — starting entities

Add the object to the `Game.levels.data` array. Any `type: 'rocket'` NPC opens
the travel menu; add your new zone to the rocket destination card list in
`ui.js:drawTravelMenu`.

## License

MIT License — Copyright (c) 2026 ruck314

Made with love for Momoko.
