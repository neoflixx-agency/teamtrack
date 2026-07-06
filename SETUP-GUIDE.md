# TeamTrack — Setup Guide
Complete this in about 15 minutes.

---

## STEP 1 — Supabase (Database)

1. Go to https://supabase.com → sign in
2. Click **New project** → give it a name like "teamtrack" → set a DB password → Create
3. Wait ~1 minute for it to provision
4. Go to **SQL Editor** (left sidebar) → click **New query**
5. Open the file `supabase-schema.sql` from this folder
6. Paste the entire contents into the SQL editor → click **Run**
7. You should see "Success. No rows returned"

**Get your keys:**
- Go to **Project Settings** → **API**
- Copy **Project URL** → this is your `VITE_SUPABASE_URL`
- Copy **anon / public** key → this is your `VITE_SUPABASE_ANON_KEY`

---

## STEP 2 — GitHub (to deploy on Vercel)

1. Go to https://github.com → sign in (or sign up free)
2. Click **+** → **New repository** → name it "teamtrack" → Create
3. Upload all files from this folder to the repository
   (drag and drop in the GitHub web interface, or use GitHub Desktop)

---

## STEP 3 — Vercel (Live hosting)

1. Go to https://vercel.com → sign in with GitHub
2. Click **Add New Project** → select your "teamtrack" repository → Import
3. Framework: **Vite** (auto-detected)
4. Click **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
5. Click **Deploy**
6. In ~1 minute you get a live URL like: `teamtrack-xyz.vercel.app`

**Share that URL with your team. Done.**

---

## STEP 4 — First use

1. Open your live URL
2. Log in as Admin (PIN: `admin123`)
3. Go to **Manage** tab → add all your employee names
4. **Change the admin PIN** to something only you know
5. Share the URL with employees — they pick their name and start logging

---

## Updating the app later

- Edit files locally → push to GitHub → Vercel auto-deploys in seconds

## Default admin PIN
`admin123` — change it immediately after first login

