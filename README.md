# Offbeat Arcade

A pixel-art arcade of quick, clever browser games, built with Next.js and deployed on Vercel.
The first game is **Deep Cut**: name the answer nobody else would.

Every page sits on a full-screen pixel world (Abyss, Core, Collage, Orbit) that games can drive:
your score sinks the bathysphere, drills the probe, floats the balloon or launches the rocket.

## Run it locally

You need Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # Windows PowerShell: copy .env.example .env.local
npm run dev
```

Open http://localhost:3000.

The site works without any environment variables.

## Deploy to Vercel

1. Push this folder to a new GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Offbeat Arcade"
   git branch -M main
   git remote add origin https://github.com/<you>/offbeat-arcade.git
   git push -u origin main
   ```
2. In Vercel, choose **Add New → Project**, import the repository, and keep the defaults (Next.js is detected automatically).
3. Optionally, under **Settings → Environment Variables**, add `NEXT_PUBLIC_SITE_URL` with your production URL, then redeploy.

Every push to `main` deploys automatically; pull requests get preview URLs.

## How the project is laid out

```
src/
  site.config.ts              name, tagline, URL of the arcade (rename it here)
  app/
    layout.tsx                fonts, the pixel world backdrop, the top nav
    page.tsx                  arcade home: lists games from the registry
    games/[slug]/page.tsx     loads one game by slug
    api/games/[slug]/[action] one endpoint that runs any game's server actions
    globals.css               world color/font tokens + shared panels and buttons
  components/
    WorldProvider.tsx         owns the backdrop canvas, the gauge and the chosen world
    GameHost.tsx              loads a game's code and hands it the shared services
    SiteNav.tsx               brand, world switcher, sound toggle
  lib/
    games/types.ts            the contract every game implements (GameModule, GameContext)
    worlds/                   pixel engine (pixel.ts), the four worlds (worlds.ts), loop (engine.ts)
    sound.ts, storage.ts      shared synth and namespaced localStorage
    server/rate-limit.ts      per-IP limiter for game API calls
  games/
    registry.ts               every game's title, tagline, status and cover
    loaders.ts                lazy client imports, one per game
    server.ts                 each game's server actions
    deep-cut/                 the first game
    _template/                the starter copied by `npm run new-game`
scripts/new-game.mjs          scaffolder
```

## Add a new game

```bash
npm run new-game word-chain "Word Chain"
```

This creates `src/games/word-chain/` from the template and registers it. The new game starts as `status: "hidden"`:
it is playable at `/games/word-chain` but not listed on the home page. When it's ready, set `status: "live"` in
`src/games/registry.ts` (or `"soon"` to tease it with a "Coming soon" card).

A game is any object with a `mount(root, ctx)` function that renders into `root` and returns a cleanup function.
Write it in plain DOM like Deep Cut, or render React into it with `createRoot(root)`. `ctx` gives every game:

| `ctx.world` | the pixel world behind the page: `setValue()` moves the camera, `burst()` fires pixel confetti, `follow()` switches between score-following and scroll-following, `set()` changes worlds |
|---|---|
| `ctx.sound` | the shared synth: `reward(0–4)`, `miss()`, `tick()`, `click()`, `tone()` |
| `ctx.storage` | localStorage namespaced to the game (`get`, `set`, `remove`), never throws |
| `ctx.api(action, body)` | calls the game's own server actions in `src/games/<slug>/server.ts` |
| `ctx.navigate(href)` | client-side navigation |

Server actions are plain functions keyed by name. They run only on the server, so secrets such as API keys stay
private. Throw `ActionError(status, code)` to return an error; anything else you return is sent as JSON.

Style a game with the shared tokens (`var(--accent)`, `var(--panel)`, `var(--display)`, `.panel`, `.go`, `.field`…)
so it looks right in all four worlds.

## Deep Cut

- Prompts live in `src/games/deep-cut/data/prompts.ts` (187 prompts). The file header explains the format.
- `data/longtail/` adds rare-but-valid answers per prompt (about 26,400 answers in total), so niche picks count.
  Anything a board marks `=0` stays rejected.
- Matching, scoring and the daily seed are in `logic.ts`. Only answers on the board count; small typos are autocorrected.

## Scripts

| `npm run dev` | local dev server |
|---|---|
| `npm run build` | production build (what Vercel runs) |
| `npm run typecheck` | TypeScript check |
| `npm run new-game <slug> "<Title>"` | scaffold a game |
