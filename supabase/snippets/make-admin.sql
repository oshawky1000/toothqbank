-- Give admin rights to an account. The person must sign up on the website first.
-- Replace the number with their phone number as stored: digits only, country code first,
-- no '+' and no leading 0. Example: 01012345678 is stored as 201012345678.
-- Paste into Supabase > SQL Editor and press Run. It should say "1 row affected"
-- (or "Success. No rows returned"; then check the number).

update public.profiles
set is_admin = true, status = 'approved'
where phone = '201012345678';

-- To remove admin rights later, run the same with: set is_admin = false
