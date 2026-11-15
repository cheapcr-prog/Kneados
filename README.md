# KneadOS

The operating system for donut shops and bakeries: shop website, online ordering, register (POS),
kitchen screen, bake forecasting, staff and tips, Dough Rewards, and reports. Built by Lens & Lever.

Domain: kneados.app

## What's here today

A working demo of every screen for a made-up shop, Good Batch Donuts, running on generated data in
the browser. Nothing is charged, texted, or saved to a server yet.

| Screen | Path | What it shows |
| --- | --- | --- |
| Product page | `/` | What KneadOS is, with links into the demo |
| Shop website | `/demo/shop` | Menu, cart, pickup and pre-orders, Dough Rewards sign-up |
| Register | `/demo/register` | PIN login, one-tap items, dozen pricing, tips, rewards, clock in |
| Kitchen | `/demo/kitchen` | Bakers' screen: today's bake list, tomorrow's pre-orders, sold-out switch |
| Owner | `/demo/owner` | Today, tomorrow's bake plan, time clock and tip split, rewards, reports |

The parts that are real, tested logic (in `src/lib`, with tests beside them):

- `forecast.ts`: the bake plan. Same-weekday history, rain, holidays, sell-outs, trend, pre-orders, buffer.
- `tips.ts`: daily tip pool split by hours. Owners and managers are excluded (California Labor Code 351).
- `rewards.ts`: Dough Rewards punch card, one punch per visit.
- `pricing.ts`: dozen pricing, tax on taxable items only, reward discount.

The demo data lives in `src/data`. `history.ts` generates 90 days of sales from a seeded random
generator, so everyone sees the same shop on a given day.

## Not built yet

Accounts and a real database (Supabase), card payments and the Stripe reader, the native iPad app
with offline mode, live texts (Sent.dm), email (Resend), and AI chat over a shop's own data.

## Run it

```
npm install
npm run dev     # local dev server
npm test        # unit tests
npm run build   # type-check and build to ./dist
```

Stack: React 19, Vite, TypeScript, Tailwind. Hosted on Cloudflare (see `wrangler.jsonc`).

## Photos

Menu photos in `public/menu/` come from [Unsplash](https://unsplash.com) and are used under the [Unsplash License](https://unsplash.com/license), which allows free commercial use. They are placeholders for the demo. A real shop uploads its own photos.
