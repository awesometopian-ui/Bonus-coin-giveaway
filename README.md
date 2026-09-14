# Bonus Coin Giveaway

A generic, production-oriented giveaway platform built with Node.js, Express, vanilla HTML/CSS/JS, and Supabase PostgreSQL.

## What it includes

- Public Home and Rewards pages
- Dynamic giveaway fields powered by Supabase
- Generic field types: text, email, number, URL, textarea
- Optional Copy button per field
- Secure server-side validation
- Admin authentication using a signed, HTTP-only cookie
- Admin dashboard
- Giveaway management
- Welcome/security message editor
- Custom field manager with ordering
- Submission management
- Random/manual winner selection
- Rate limiting, Helmet, SameSite cookies, CSRF protection for state-changing routes
- Render-ready start command

## 1. Install

```bash
npm install
```

## 2. Create Supabase database

Open the Supabase SQL Editor and run `supabase/schema.sql`.

The application uses the server-side Supabase service-role key only. No service-role key is sent to browsers.

## 3. Environment

Copy `.env.example` to `.env` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD` OR `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`

For production, prefer `ADMIN_PASSWORD_HASH`. You can create a bcrypt hash with a small Node script or an online/offline bcrypt tool you trust.

Never commit `.env`.

## 4. Run

```bash
npm start
```

The server uses `process.env.PORT` and binds to `0.0.0.0`.

## 5. Render

Create a Web Service from the repository.

- Build Command: `npm install`
- Start Command: `npm start`
- Runtime: Node
- Add the environment variables in Render's Environment section.
- Do not upload `.env` to GitHub.

After deployment, the public site is at the Render URL.

Admin:
`https://YOUR-RENDER-DOMAIN/admin`

There is intentionally no public navigation link to the admin area.

## 6. Supabase credentials

Paste the values from Supabase into Render environment variables, not into frontend files.

Supabase dashboard:
- Project URL -> `SUPABASE_URL`
- Project Settings -> API -> service role key -> `SUPABASE_SERVICE_ROLE_KEY`

The service-role key is a server secret. Treat it like a password.

## Security notes

- Public routes only expose current public configuration.
- Submission data is only returned from authenticated admin routes.
- Do not configure custom fields to request passwords, OTPs, seed/recovery phrases, private keys, or authentication secrets.
- This project does not use localStorage, SQLite, JSON files, or browser storage for important application data.
