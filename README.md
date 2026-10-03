# ToothQBank

MCQ question bank for dentistry students. See `CLAUDE.md` for the full project brief.

## Project layout
- `src/`: the website (React + Vite + TypeScript)
- `src/config.ts`: price and contact messages (change them here)
- `public/`: browser tab icon and phone home-screen icon
- `data/`: question files (JSON), format in `docs/question-format.md`
- `docs/brand/tooth-original.jpg`: original logo image the icons were made from
- `docs/CHANGELOG.md`: what each build phase added

## Cloudflare Pages build settings
- Framework preset: **React (Vite)**
- Build command: `npm run build`
- Build output directory: `dist`

## For developers
```
npm install
npm run dev      # local preview
npm run build    # production build into dist/
```
