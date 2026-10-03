# ToothQBank security review

Written for Omar at the end of Phase 7 (October 2026). Plain language, no programming needed.

## The short version

**The questions are protected by the database itself, not just hidden by the website.**
Someone who skips the website and talks to the database directly (the way an attacker would) still gets **zero questions** unless all three of these are true:

1. their account is **approved**,
2. an admin has **unlocked that course** for them, and
3. they are on the **one device** their account is bound to.

Admins see everything. That is on purpose.

This was tested on your live database and on a test copy (details below). Everything that should be blocked was blocked.

## What protects what

| What | How it is protected |
|---|---|
| Question text, options, answers, explanations | Database rules (Row Level Security). The three checks above run on **every** request. |
| Question images | Stored in a **private** Supabase Storage bucket (`question-images`). Supabase only gives out a link to an image if the person can read a question that uses it (the same three checks). Links stop working after 1 hour. Only admins can upload, replace or delete images. Added after Phase 7, see `0005_question_images.sql`. |
| Internal fields (answer status, source pages) | Only admins can read them. They are never sent to students. |
| Student names and phone numbers | Each student can read only their own. Admins can read all. |
| Admin notes ("Paid InstaPay…") | Admins only. Students cannot see any notes, not even their own. |
| Course unlocks, approving, admin rights | Only admins can change them. A student cannot approve or unlock themselves, or make themselves an admin. |
| Answers, sessions, progress, error reports | Each student sees only their own. |
| Question import, editing courses and chapters | Admins only. |
| Password resets | Done by a small program on Cloudflare. It checks that the person asking is an admin. It is the only place the Supabase **secret key** is used. That key lives only in Cloudflare's secret settings: never in the website code, never on GitHub. |
| The website itself | Security headers stop other sites from showing ToothQBank inside a frame. They also stop the browser from running scripts from anywhere except ToothQBank, or talking to any server except Supabase. |
| Copying text | Selecting, copying and right-clicking are turned off on question screens. This only makes copying a bit harder. The real protection is the list above. |

Course names, chapter names and question **counts** are public on purpose: everyone needs them to see the course layout. They contain no question content.

## What was tested

- **Your live database (3 October 2026), read-only.** Nothing was changed.
  - A logged-out visitor is refused the questions table entirely.
  - A made-up account sees nothing.
  - A real approved student on the **wrong device** sees 0 questions, only their own profile, no internal fields and no admin notes.
  - All 11 tables have their security rules switched on.
- **Supabase's own security checker.** Its warnings were either intended (see "Supabase warnings you will see" below) or fixed in this phase.
- **A test copy of the database**, with every rule from the four SQL files. This covered students with and without access, the wrong device, a pending account, a course locked again, and admin-only actions.
- **The website in a phone-sized browser** with the new security headers switched on. Nothing the site needs was blocked.
- **The new Security check page** (`/security-check`, see below).

## Fixed in this phase (`supabase/migrations/0004_phase7_hardening.sql`)

1. **Changing an old answer after losing access.** Before, a student whose course was locked again could still change an answer in an old session and learn whether it was right. Now they can only change answers on questions they can still open.
2. **Removed public access to a Supabase helper function** (`rls_auto_enable`). Supabase adds this function to new projects. It was harmless, but nobody needs to call it from the website.

The website also got:
- the security headers described above
- a friendly "Reload" message if a page breaks or the site was updated while a student had it open
- a "You are offline" banner
- logged-out visitors being sent to Log in and then back to the page they wanted
- a clear "Questions locked" message if access is removed in the middle of a session

## Honest list of what is NOT fully preventable

None of these are emergencies. Each comes with what to do.

1. **Screenshots and photos.** No website can stop a student photographing a question on their screen. Students only ever see questions from courses they paid for.
2. **A student who has access can pass on an image link**, and it works for anyone until it expires (at most 1 hour). They could also just screenshot it, so this adds little risk.
3. **A tech-savvy student who has access** could save the questions of *their own unlocked courses* using browser developer tools. The copy protection slows down normal users only.
4. **Sharing an account.** The one-device rule blocks this for normal users. A very technical student could copy the hidden device ID to a friend's phone together with the password.
   - **What to do:** if you suspect sharing, use **Reset password** and **Reset device**, then send the new password only to the real student.
5. **Reset device: whoever opens the site first wins.** After you press Reset device, the next phone that opens ToothQBank becomes the bound device, even the old phone.
   - **What to do:** tell the student to log in on the new phone straight after the reset.
6. **A new password does not log out a phone that is already logged in.** Combine it with Reset device if you need to lock someone out (or use **Revoke**, which works immediately).
7. **Anyone can create a pending account.** It sees no questions. Reject accounts you don't recognise.
8. **A student could send many error reports.** It is only a nuisance. Revoke the account if it happens.
9. **Admin accounts can do everything** and are exempt from the device limit.
   - **What to do:** keep admin accounts to the two people who need them.
   - Use a long password that you use nowhere else.
   - Remove admin rights from anyone who leaves (`supabase/snippets/make-admin.sql` has the reverse command).

## Things to know about the free plans

- **Supabase pauses free projects after about a week with no activity.** During term, students keep it active. In a long holiday the site may stop working until you open Supabase and press **Restore project**.
- **The Supabase free plan does not include backups you can restore yourself.**
  - **Questions** are safe: they can always be re-imported from the JSON files.
  - **Student accounts, unlocks and notes** would be lost if the database were lost. Keep your own record of who paid for what (for example in a spreadsheet). Notes in the dashboard are not a backup.
- **"Leaked password protection"** (checking passwords against lists of stolen passwords) is a paid Supabase feature. The website already requires at least 8 characters.
- **Images and the free plan.** The free plan includes 1 GB of file storage and limited monthly download traffic. Images are shrunk before upload to stay well inside this. Once several courses have images, check **Usage** in Supabase now and then.

## Supabase warnings you will see (and why they are fine)

Supabase's **Security Advisor** page lists some warnings. These are expected:

- **"Public can execute SECURITY DEFINER function: question_counts"**: on purpose. It returns question **counts only** for the course layout.
- **"Signed-in users can execute SECURITY DEFINER function"** for `accessible_course_ids`, `claim_device`, `import_questions`, `is_admin`, `question_counts`: on purpose.
  - The website needs to call them.
  - Each one checks who is asking. Students only ever learn about their own account, and `import_questions` refuses anyone who is not an admin.
- **"Leaked password protection disabled"**: paid feature, see above.
- After running `0004`, the warnings about `rls_auto_enable` should disappear.

## How to re-check security yourself (any time)

1. Keep one **test student account** that is **pending** (not approved, no courses unlocked).
2. Log in with it on a phone and open `your-site-address/security-check`.
3. Tap **Run security check**. Every line should show a green tick and the summary should say **"All 17 checks passed"** (3 of them test question images: seeing or opening images of locked courses, seeing images from another device, and uploading an image).
4. If any line shows a red ✗ **PROBLEM**, take a screenshot and send it to your developer.

Re-run it after any database change.
