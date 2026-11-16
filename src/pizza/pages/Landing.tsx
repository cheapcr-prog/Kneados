import { ArrowRight, Bike, Brain, ChefHat, Flame, LayoutDashboard, Package, ShoppingBag, Sparkles, Tablet, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/DemoBar';
import { ModeSwitch } from '../../components/ModeSwitch';

const SCREENS = [
  { to: '/pizza/demo/shop', icon: ShoppingBag, name: 'Your website', body: 'Customers build their pizza on a live pie: tap toppings on the whole thing or one half and watch the price change. Delivery or pickup, with a real quote time.' },
  { to: '/pizza/demo/register', icon: Tablet, name: 'Phone and counter register', body: 'Type the caller\'s number and their name, address, usual order and rewards pop up. One tap to reorder.' },
  { to: '/pizza/demo/kitchen', icon: ChefHat, name: 'Make line', body: 'Tickets in fire order, a timer on every pie in the oven, and tonight\'s dough batch sheet in grams.' },
  { to: '/pizza/demo/dispatch', icon: Bike, name: 'Dispatch', body: 'A map of every delivery. KneadOS stacks orders that are close together and hands each run to the driver who is free first.' },
  { to: '/pizza/demo/owner', icon: LayoutDashboard, name: 'Owner dashboard', body: 'A briefing that tells you what to do next, and an AI you can ask anything about your shop.' },
];

const FEATURES = [
  { icon: Flame, name: 'Dough planned two days out', body: 'Same weekday sales, the weather, game days and pre-orders decide how many balls of each size to make tonight. The batch sheet is in grams.' },
  { icon: Package, name: 'Stock by recipe', body: 'Every pie takes its pepperoni, cheese, sauce, dough and box off the shelf as it goes in the oven, half toppings counted as half. Orders to your suppliers are drafted before you run out.' },
  { icon: Bike, name: 'Your own drivers, done right', body: 'Honest quote times from what\'s in the oven, stacked runs, on-the-way texts, mileage worked out per route and tips kept by the driver.' },
  { icon: Trophy, name: 'Game days and catering', body: 'Party packs with a deposit, pre-orders that drop onto the make line right on time, and extra drivers and wings scheduled before kickoff.' },
  { icon: Brain, name: 'An AI that knows the whole shop', body: 'Ask "how much dough tonight?" or "where am I losing money?" and get an answer from your own numbers, not a guess.' },
  { icon: Sparkles, name: 'Keep the delivery-app money', body: 'Dough Rewards, win-back texts and smart add-ons move regulars from the apps to your own site, where you keep the whole ticket.' },
];

/** What KneadOS does for a pizza shop, with links into the pizza demo. */
export function PizzaLanding() {
  return (
    <div className="min-h-full bg-ink-900 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Link to="/" className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight"><Logo size={28} /> KneadOS</Link>
        <ModeSwitch active="pizza" />
        <Link to="/pizza/demo/shop" className="hidden rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 sm:block">Open the demo</Link>
      </header>

      <section className="relative overflow-hidden">
        <img src="/pizza/hero-oven.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-900 via-ink-900/85 to-ink-900/40" />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 md:pt-16">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">For small pizza shops</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-extrabold leading-[0.98] tracking-tight md:text-7xl">
            Every pie, every driver,
            <br />
            <span className="text-emerald-400">one system.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            KneadOS runs your pizza shop from the website to the make line to the driver's car. Online ordering with a pizza builder, the phone register, oven timers, dispatch, dough and stock, all reading the same orders, so a pie sold tonight changes the dough you make for Sunday.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/pizza/demo/shop" className="flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3.5 text-sm font-bold text-ink-900 hover:bg-emerald-300">Build a pizza in the demo <ArrowRight size={16} /></Link>
            <a href="mailto:hello@kneados.app?subject=KneadOS%20for%20my%20pizza%20shop" className="rounded-full border border-white/20 px-6 py-3.5 text-sm font-bold hover:bg-white/10">Book a walkthrough</a>
          </div>
        </div>
      </section>

      <section className="bg-white text-slate-900">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Five screens, one shop</h2>
          <p className="mt-2 max-w-2xl text-slate-600">The demo is a made-up shop called Shoreline Slice Co. with 90 days of generated sales and a dinner rush already going. Order on one screen and watch it move through the others.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SCREENS.map(({ to, icon: Icon, name, body }) => (
              <Link key={to} to={to} className="group rounded-3xl border border-slate-200 p-6 transition hover:border-emerald-500 hover:shadow-lg">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={22} /></div>
                <h3 className="mt-4 font-display text-xl font-bold">{name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">Open this screen <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Built for a Friday rush</h2>
          <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {FEATURES.map(({ icon: Icon, name, body }) => (
              <div key={name} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-emerald-300"><Icon size={20} /></div>
                <div><h3 className="font-display text-lg font-bold">{name}</h3><p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-400">
          <span>© {new Date().getFullYear()} KneadOS · Photos from Unsplash</span>
          <span>Built by <a href="https://lensandlever.com" className="font-semibold text-slate-200 hover:text-white">Lens &amp; Lever</a> in Long Beach, California</span>
        </div>
      </footer>
    </div>
  );
}
