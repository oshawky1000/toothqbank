# ToothQBank: project brief for Claude Code

Read this whole file at the start of every session. It is the source of truth for what we are building. If something here is unclear or seems wrong, ASK before building. Do not guess.

## About the owner
- Omar is the owner. He is **not a programmer**. Explain every step he must do himself (clicking in GitHub, Supabase or Cloudflare) as numbered, click-by-click instructions. Say exactly which button to press and what to paste.
- Never assume he will run terminal commands on his own computer. Everything he does himself happens in a web browser.
- Keep each session to ONE phase (see "Build phases"). End every session with:
  1. what was done
  2. exactly how Omar can test it on his phone
  3. what the next phase is
- He is careful with money. Use free tiers only: Supabase free plan, Cloudflare Pages free plan.

## What ToothQBank is
An MCQ question bank for dentistry students: past exam questions with answers and explanations, organised by course and chapter. The first audience is Year 3 dentistry students (~350 students).

**Branding rules:**
- The site is called **ToothQBank**. Never show any university name, logo or course code anywhere on the site.
- English interface. Mobile-first: most students use phones.
- Design: white backgrounds, minimal colour, one calm accent colour, clean and serious, like UWorld or AMBOSS. No saturated or coloured page backgrounds. Large, readable text for questions.

## Tech stack (decided, do not change without asking)
- **Frontend:** React + Vite + TypeScript, deployed on **Cloudflare Pages** (connected to this GitHub repo, auto-deploys from `main`).
- **Backend:** **Supabase** (Postgres, Auth, Row Level Security, Storage for question images).
- **Server-only admin actions** (resetting a student's password, deleting a device binding): a **Cloudflare Pages Function** that uses the Supabase service role key from a Cloudflare environment secret. The service role key must NEVER appear in frontend code or in the repo.
- Database changes go in `supabase/migrations/*.sql`. Omar applies them by pasting into the Supabase SQL Editor. Give him the exact file to copy and tell him to press Run.

## Site structure
Year → Semester → Course → Chapter → Questions.

Build the FULL layout now, even for courses with no questions yet. A course with 0 questions shows "Coming soon" and cannot be unlocked.

Seed data:
- **Year 3, Semester 1:**
  - General Medicine 1 (`gm1`)
  - General Surgery 1 (`gs1`)
  - Oral Pathology 1 (`op1`)
  - Radiology 1 (`rad1`)
  - Fixed Prosthodontics 1 (`fp1`)
  - Restorative 1 (`rest1`)
  - Removable Prosthodontics 1 (`rp1`)
- **Year 3, Semester 2:** courses to be added later. Show the semester with "Coming soon".

General Medicine 1 chapters, in this order:
1. Heart failure
2. Chest pain
3. Cyanosis
4. Edema
5. Rheumatic fever
6. Infective endocarditis
7. Systemic hypertension
8. Syncope
9. Hemoptysis
10. Clubbing of fingers
11. Foreign body inhalation
12. Gastroenterology
13. Disease of mouth
14. Dysphagia
15. Ascites
16. Hematemesis

Other courses' chapters come later with their question files. Chapters must be data (a table), not hard-coded, and ordered by a `position` field.

## Question data
Questions arrive as JSON files in the format described in `docs/question-format.md`. Example file: `data/gm1-pilot.json`.

- Import must **upsert by `id`**, so re-importing a fixed file updates questions instead of duplicating them.
- Chapters in a file that don't exist yet are created automatically, appended after existing chapters.
- `answer_status` and `source_pages` are internal. Store them, never show them to students.
- `times_seen` is shown to students as a small badge: "Seen in 3 papers" (only when it is 2 or more).
- `category` has three values, shown as three sections in each course: **Past papers** (`past_paper`), **Quizzes & midterms** (`quiz_midterm`), **Chapter questions** (`chapter`). Hide a section that has no questions.

## Accounts and access
- **Sign up:** full name, phone number (Egyptian format, e.g. 01012345678), password. No email.
  - Implement with Supabase email/password auth using a synthetic email built from the normalised phone number, e.g. `201012345678@students.toothqbank.app`. Disable email confirmation.
  - Students only ever see and type their phone number.
- **New accounts start as `pending`.** A pending student can log in and browse the course layout, but every course shows as locked. Show a clear banner: "Your account is waiting for approval. Send us a WhatsApp message to activate it." Include a WhatsApp button.
- **Account statuses:** `pending`, `approved`, `rejected`, `revoked`. Every status change can be undone from the admin dashboard. Rejected or revoked students see a message to contact us on WhatsApp and cannot open any questions.
- **Course access is separate from account status.** Each course is unlocked per student by an admin. A student sees questions only if their status is `approved` AND that course is unlocked for them.
- **Locked course card:** shows the course name, number of questions, the price **100 EGP**, and an "Unlock on WhatsApp" button.
  - The button opens `https://wa.me/966555465163` with a prefilled message: "Hi, I'd like to unlock [Course name] on ToothQBank. My registered phone number is [phone]."
  - Keep the price and WhatsApp number in one config file so they are easy to change.
- **No free sample questions.** Locked means fully locked.
- **No payments on the website.** Payment happens on WhatsApp; an admin then unlocks the course.
- **Forgot password:** a link that says "Forgot your password? Message us on WhatsApp" (opens WhatsApp). An admin resets it from the dashboard.

## One device per account
- On first login, the browser generates a random device ID and stores it locally. That ID is saved against the student's account.
- If the same account logs in from a different device ID, block it with: "This account is already active on another device. Contact us on WhatsApp to switch devices." Sign them out.
- Admins can **Reset device** from the dashboard. The next device to log in becomes the bound device.
- Admin accounts are exempt from the device limit.

## Security (very important)
- Use **Row Level Security** on every table. Question rows (stem, options, answer, explanation) must be unreadable through the Supabase API unless the user is approved and has that course unlocked, or is an admin.
  - Hiding questions in the UI is NOT enough. Test it: a pending or locked user querying the questions table directly must get zero rows.
- Course and chapter names and question COUNTS may be public (needed for the layout). Use a view or function that returns counts without question content.
- Students can only read and write their own progress rows.
- Admin is a flag on the profile (`is_admin`). Only admins can change statuses, unlocks or devices, import questions, or see reports.
- Disable right-click and text selection on question screens. This is a mild deterrent only; the real protection is RLS and the device limit.

## Student features
1. **Home:** Year → Semester → course cards (Locked / Unlocked / Coming soon, with question counts).
2. **Course page:** chapters list, each with question count and the student's progress (% answered, % correct).
3. **Create a practice session:**
   - Chapters: multi-select, with a "Select all" option. This is how students practise only what's in their midterm.
   - Sections: Past papers, Quizzes & midterms, Chapter questions (multi-select).
   - Filter: All, Unanswered, Incorrect only.
   - Order: Random, or Most repeated first (sorted by `times_seen`).
   - Number of questions.
   - Mode:
     - **Tutor:** shows the answer and explanation right after each answer.
     - **Timed:** 1 minute per question by default; answers shown only at the end.
4. **Question screen:** stem, options A–D, "Seen in X papers" badge, Next/Previous, a question navigator, Flag for review, and a **Report an error** button (short reason + optional comment).
5. **Session end:** score, list of questions with correct/incorrect, tap any question to review it with its explanation.
6. **Progress is saved:** every answer is stored (question, chosen option, correct or not, time). Students can resume an unfinished session.

## Admin dashboard (`/admin`, admins only)
- **Students table:** name, phone, status, registered date, unlocked courses, device bound (yes/no), notes.
  - Search by name or phone.
  - Filter by status, with Pending shown first by default.
- **Actions per student:**
  - Approve, Reject, Revoke, Restore (undo)
  - Unlock or lock each course (checkboxes)
  - Reset device
  - Reset password (sets a new password the admin types, then shows it so they can send it on WhatsApp)
  - Edit notes (e.g. "Paid InstaPay 3 Nov, GM1")
- Approving and unlocking must take seconds on a phone. Big, clear buttons. Admins will use this on a phone too.
- **Reports:** list of error reports with question preview, reason, comment, and student. Mark as resolved.
- **Import questions:** upload a JSON file. Validate it against the format first and show errors clearly (which question id, which field). Show a preview ("30 questions: 28 new, 2 updated") before confirming.
- **Simple stats:** total students by status, unlocks per course, total questions per course.
- Two admins at launch (Omar and one helper). Admin rights are given by setting `is_admin = true` in Supabase. Give Omar the exact SQL to do it.

## Build phases (one phase per session; do not skip ahead)
1. **Skeleton + deploy:** Vite/React app with the ToothQBank layout shell, deployed on Cloudflare Pages. Walk Omar through connecting Cloudflare Pages to the repo. Done when he opens the live link on his phone.
2. **Database + auth:** all tables, RLS, seed courses and chapters, phone sign-up/login, pending state, device lock. Walk Omar through creating the Supabase project and pasting the SQL.
3. **Course layout:** home, course and chapter pages, locked / coming-soon states, WhatsApp buttons.
4. **Admin dashboard:** students, statuses, unlocks, device reset, password reset, notes, and the question import. Import `data/gm1-pilot.json` as the test.
5. **Practice:** session builder, tutor mode, question screen, report error.
6. **Timed mode + progress:** timed sessions, results, review, saved progress, filters, resume.
7. **Hardening:** RLS tests with a locked test user, mobile polish, loading and error states, a final security review written in plain language for Omar.

## Working rules
- Small, safe steps. After each phase, the site must still work.
- Never commit secrets. Supabase URL and anon key go in Cloudflare environment variables and a `.env.example` (with placeholder values). The service role key goes only in a Cloudflare secret.
- When Omar must do something outside the code (Supabase, Cloudflare, GitHub), stop and give numbered steps, then wait for him to confirm.
- Prefer simple, readable code over clever code. No unnecessary libraries.
- Keep a short `docs/CHANGELOG.md`: one line per phase.
