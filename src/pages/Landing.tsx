import { ArrowRight, BarChart3, ChefHat, Flame, Gift, LayoutDashboard, ShoppingBag, Tablet, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/DemoBar';
import { ItemArt } from '../components/ItemArt';
import { MENU } from '../data/shop';

const SCREENS = [
  { to: '/demo/shop', icon: ShoppingBag, name: 'Shop website', body: 'Your menu online with pickup ordering and pre-orders by the dozen. Customers pay ahead and skip the line.' },
  { to: '/demo/register', icon: Tablet, name: 'Register', body: 'A fast iPad register built for a donut counter: one tap per item, dozen pricing on its own, tips and rewards built in.' },
  { to: '/demo/kitchen', icon: ChefHat, name: 'Kitchen screen', body: "Pickup orders and today's bake list on one screen. Mark an item sold out and it drops off the register and the website." },
  { to: '/demo/owner', icon: LayoutDashboard, name: 'Owner dashboard', body: "Tomorrow's bake plan, the time clock, the tip split, rewards and reports. Check it from your phone." },
];

const FEATURES = [
  { icon: Flame, name: 'A bake plan from your own sales', body: 'KneadOS looks at your last eight of the same weekday, the weather, holidays and pre-orders, then tells the fryer how many of each to make. It shows the reason next to every number.' },
  { icon: Gift, name: 'Dough Rewards', body: 'Customers join with a phone number. No app, no card. On the tenth visit they get a text for a free donut at your shop.' },
  { icon: Users, name: 'Staff and tips handled', body: 'PIN clock-in at the register, a weekly schedule, and a daily tip pool split by hours. Owners and managers are left out of the pool, the way California law requires.' },
  { icon: BarChart3, name: 'Reports you can read', body: 'Sales by hour, best sellers, what got tossed and what sold out early. Plain numbers, no spreadsheet.' },
];

export function Landing() {
  const row = MENU.filter((m) => m.baked).slice(0, 8);
  return (
    <div className="min-h-full bg-ink-900 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight"><Logo size={28} /> KneadOS</Link>
        <Link to="/demo/shop" className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">Open the demo</Link>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-14 pt-10 md:pt-16">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-glaze-300">For donut shops and bakeries</p>
        <h1 className="mt-4 max-w-4xl font-display text-5xl font-extrabold leading-[0.98] tracking-tight md:text-7xl">
          Everything your
          <br />
          shop <span className="text-glaze-400">kneads.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
          KneadOS runs your shop from the website to the register to the fryer. Online orders, the counter, the bake list, your crew and your numbers live in one system, so a sale at 7am changes what you make tomorrow.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/demo/shop" className="flex items-center gap-2 rounded-full bg-glaze-400 px-6 py-3.5 text-sm font-bold text-ink-900 hover:bg-glaze-300">
            Try the live demo shop <ArrowRight size={16} />
          </Link>
          <a href="mailto:hello@kneados.app?subject=KneadOS%20walkthrough" className="rounded-full border border-white/20 px-6 py-3.5 text-sm font-bold hover:bg-white/10">Book a walkthrough</a>
        </div>
        <div className="mt-12 flex items-center gap-3 overflow-hidden opacity-90">
          {row.map((m) => <ItemArt key={m.id} item={m} size={72} />)}
        </div>
      </section>

      <section className="bg-white text-slate-900">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Four screens, one shop</h2>
          <p className="mt-2 max-w-2xl text-slate-600">The demo is a made-up shop called Good Batch Donuts with 90 days of generated sales. Place an order on one screen and watch it land on the others.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {SCREENS.map(({ to, icon: Icon, name, body }) => (
              <Link key={to} to={to} className="group rounded-3xl border border-slate-200 p-6 transition hover:border-glaze-500 hover:shadow-lg">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-glaze-50 text-glaze-700"><Icon size={22} /></div>
                <h3 className="mt-4 font-display text-xl font-bold">{name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-glaze-700">Open this screen <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Built for 4am, not for a boardroom</h2>
          <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {FEATURES.map(({ icon: Icon, name, body }) => (
              <div key={name} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-glaze-300"><Icon size={20} /></div>
                <div>
                  <h3 className="font-display text-lg font-bold">{name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight">Where KneadOS is today</h2>
            <p className="mt-3 leading-relaxed text-slate-300">
              KneadOS is in early build. The demo shows the real screens and the real bake-plan math running on sample data. Card payments, the offline iPad app, live texts and AI chat with your shop's numbers are being built next, and we're looking for one Southern California shop to run it first.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h3 className="font-display text-xl font-bold">Want your shop to be the first?</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">We'll set it up in person, load your menu, and bring in your past sales so the bake plan starts from your numbers.</p>
            <a href="mailto:hello@kneados.app?subject=KneadOS%20pilot%20shop" className="mt-5 inline-flex items-center gap-2 rounded-full bg-glaze-400 px-5 py-3 text-sm font-bold text-ink-900 hover:bg-glaze-300">
              hello@kneados.app <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-400">
          <span>© {new Date().getFullYear()} KneadOS</span>
          <span>Built by <a href="https://lensandlever.com" className="font-semibold text-slate-200 hover:text-white">Lens &amp; Lever</a> in Long Beach, California</span>
        </div>
      </footer>
    </div>
  );
}
