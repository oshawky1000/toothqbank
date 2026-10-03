# Changelog

- **Phase 1 (Skeleton + deploy):** React + Vite + TypeScript app with the ToothQBank layout shell (top bar with tooth logo, coming-soon home page, page-not-found page), settings file `src/config.ts`, ready for Cloudflare Pages.
- **Phase 2 (Database + auth):** Supabase tables with Row Level Security (questions readable only by approved students with the course unlocked, on their bound device, or admins), seed courses and General Medicine 1 chapters, phone-number sign-up and login, pending/rejected/revoked banners, one device per account.
- **Phase 3 (Course layout):** home page with Year → Semester → course cards (Unlocked / Locked with price and "How to unlock" / Coming soon), course page with sections and chapter list with progress, chapter page. Contact messages stay in `src/config.ts`.
