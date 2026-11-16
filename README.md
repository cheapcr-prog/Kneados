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

## Pizza mode

KneadOS also runs pizza shops. The pizza demo is a made-up shop, Shoreline Slice Co., at `/pizza` (product page)
and `/pizza/demo/*`: a website with an interactive pizza builder (toppings on the whole pie or either half, drawn live,
price as you go), the phone and counter register with caller lookup, the make line with oven timers and tonight's dough
batch sheet, dispatch with a delivery map and stacked runs, and the owner dashboard with the AI briefing and Ask KneadOS.

The logic lives in `src/pizza/logic.ts` with tests beside it: prices with half toppings, recipes (what each pie uses by
size), 90 days of generated sales, the forecast and the 48 hour dough plan, stock and purchase orders by recipe,
quote times from what is on the make line, and grouping deliveries into runs. The chat sends `mode: "pizza"` to
`/api/ask`, which answers with pizza instructions and the same daily cap.

Pizza photos in `public/pizza/` are from [Unsplash](https://unsplash.com) under the Unsplash License.

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

Smoothie photos: strawberry by Kofi Buckley, mango by Julia Zyablova, taro by Penfer, boba by Malcolm Broström, all on Unsplash. Popping boba and fruit jelly still use drawings because no free photo was found.

## Claude in the briefing chat

The "Ask KneadOS" chat on the owner Briefing can be answered by Claude. The browser sends the question and the shop's figures to `/api/ask`, a small server in `worker/` that calls the Claude API (Claude Sonnet 5.5) with the shop owner's own key.

- **Key.** A Cloudflare secret named `ANTHROPIC_API_KEY` on the `kneados` Worker. Until it is set the chat answers from its built-in rules.
- **Daily cap.** `DAILY_CAP_CENTS` in `wrangler.jsonc` (200, which is $2 a day). Spending is counted in the `kneados-usage` KV namespace at list price and starts over at midnight Pacific. Each visitor is also limited to 30 questions a day.
- **Fallbacks.** If the model declines a question, Anthropic's recommended fallback model answers in the same call. If anything else goes wrong the chat answers from the built-in rules and says so.
