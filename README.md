# ToothQBank

MCQ question bank for dentistry students. See `CLAUDE.md` for the full project brief.

## Project layout
- `src/`: the website (React + Vite + TypeScript)
- `src/config.ts`: price and contact messages (change them here)
- `public/`: browser tab icon and phone home-screen icon
- `data/`: question files (JSON), format in `docs/question-format.md`
- `functions/`: Cloudflare Pages Functions (server code). `functions/api/admin/reset-password.ts` lets admins reset a student's password
- `supabase/migrations/`: database changes (tables, security rules, seed data), applied in order in the Supabase SQL Editor
- `docs/brand/tooth-original.jpg`: original logo image the icons were made from
- `docs/CHANGELOG.md`: what each build phase added

## Cloudflare Pages build settings
- Framework preset: **React (Vite)**
- Build command: `npm run build`
- Build output directory: `dist`

## Cloudflare Pages environment variables
Set for both Production and Preview (values from Supabase > Project Settings > API Keys):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (the publishable key, starts with `sb_publishable_`)

And one **secret** (type "Secret"), used only by the password-reset function:
- `SUPABASE_SERVICE_ROLE_KEY` (the Supabase secret key, starts with `sb_secret_`). Never put it in the code or the repo.

## For developers
```
npm install
npm run dev      # local preview
npm run build    # production build into dist/
```
