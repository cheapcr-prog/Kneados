import { useMemo } from 'react';
import { hourShares } from '../data/history';
import { useShopState } from '../data/local';
import { MENU, SHOP } from '../data/shop';
import { useDemo } from '../data/store';
import type { MenuItem } from '../data/types';
import { dowOf, holidayFor } from '../lib/dates';
import { DEFAULT_RULES, applyPrices, markdownPlan, quietestWindow, type LivePrice, type PriceContext, type PricingRules, type RackLine } from '../lib/smartpricing';
import type { OfferKind } from '../lib/upsell';
import { useTick } from './Breaks';

/** A day and time to show prices for, so the rules can be seen outside the hours they run. */
export interface PricePreview { dow: number; hour: number }

export interface Pricing {
  rules: PricingRules;
  setRules: (next: PricingRules | ((cur: PricingRules) => PricingRules)) => void;
  preview: PricePreview | null;
  setPreview: (p: PricePreview | null) => void;
  ctx: PriceContext;
  /** The menu at the prices to charge right now. */
  menu: MenuItem[];
  byId: Record<string, MenuItem>;
  live: Record<string, LivePrice>;
  rack: RackLine[];
  /** What a markdown would cover with the rack as it stands. */
  markdown: ReturnType<typeof markdownPlan>;
  /** The quietest two hours before the markdown starts. */
  quiet: ReturnType<typeof quietestWindow>;
}

/** The shop's pricing rules and the prices they give at this moment. The register and the website both charge from here. */
export function usePricing(): Pricing {
  const demo = useDemo();
  useTick(60_000);
  const [rules, setRules] = useShopState<PricingRules>('pricing', () => DEFAULT_RULES);
  const [preview, setPreview] = useShopState<PricePreview | null>('pricing-preview', () => null);
  const { state, soldToday } = demo;

  const rack = useMemo<RackLine[]>(() => MENU.filter((m) => m.baked).map((m) => {
    const sold = soldToday[m.id] ?? 0;
    return { id: m.id, name: m.name, onRack: Math.max(0, (state.bake[m.id]?.made ?? 0) - sold), stillNeeded: Math.max(0, demo.forecastToday(m.id).qty - sold), priceCents: m.price };
    // The rack only changes when something is made or sold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state.bake, soldToday]);

  const now = new Date();
  const minute = Math.floor(now.getTime() / 60_000);
  return useMemo(() => {
    const ctx: PriceContext = {
      dow: preview?.dow ?? dowOf(state.today), hour: preview?.hour ?? now.getHours() + now.getMinutes() / 60,
      holiday: !preview && !!holidayFor(state.today), closeHour: SHOP.closeHour,
      extra: Object.fromEntries(rack.map((r) => [r.id, r.onRack - r.stillNeeded])),
    };
    const { menu, live } = applyPrices(MENU, rules, ctx);
    return {
      rules, setRules, preview, setPreview, ctx, menu, live, rack, byId: Object.fromEntries(menu.map((m) => [m.id, m])),
      markdown: markdownPlan(rack, rules.markdown), quiet: quietestWindow(hourShares(), 2, rules.markdown.fromHour),
    };
    // `minute` stands in for the clock so prices change when a rule's hour arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, preview, rack, state.today, minute]);
}

export interface UpsellStats {
  on: boolean;
  /** Tickets finished since the count began. */
  tickets: number;
  /** Tickets where a suggestion was on screen. */
  offered: number;
  /** Tickets where the customer said yes to one. */
  accepted: number;
  addedCents: number;
  byKind: Partial<Record<OfferKind, number>>;
}

/** Checkout suggestions: whether they are on, and how they have done on tickets rung up in this demo. */
export function useUpsells() {
  const [stats, setStats] = useShopState<UpsellStats>('upsells', () => ({ on: true, tickets: 0, offered: 0, accepted: 0, addedCents: 0, byKind: {} }));
  return {
    stats,
    setOn: (on: boolean) => setStats((s) => ({ ...s, on })),
    /** Call once when a ticket is paid. */
    record: (offered: boolean, taken: { kind: OfferKind; cents: number }[]) => setStats((s) => ({
      ...s, tickets: s.tickets + 1, offered: s.offered + (offered ? 1 : 0), accepted: s.accepted + (taken.length > 0 ? 1 : 0),
      addedCents: s.addedCents + taken.reduce((a, t) => a + t.cents, 0),
      byKind: taken.reduce((k, t) => ({ ...k, [t.kind]: (k[t.kind] ?? 0) + 1 }), s.byKind),
    })),
    reset: () => setStats((s) => ({ on: s.on, tickets: 0, offered: 0, accepted: 0, addedCents: 0, byKind: {} })),
  };
}
