import { DEFAULT_APP_MARKUP, seedGiftCards, seedInvoices } from '../data/channels';
import { useShopState } from '../data/local';
import { useDemo } from '../data/store';
import { newGiftCode, normalizeCode, redeemGift, type DeliveryApp, type GiftCard, type Invoice } from '../lib/channels';

export interface GiftUse {
  code: string;
  cents: number;
  at: string;
}

/** Gift cards sold, their balances, and what has been spent from them. */
export function useGiftCards() {
  const demo = useDemo();
  const [data, setData] = useShopState('giftcards', () => ({ cards: seedGiftCards(demo.state.today), uses: [] as GiftUse[], next: 100 }));
  const find = (code: string): GiftCard | undefined => data.cards.find((c) => c.code === normalizeCode(code));
  return {
    cards: data.cards,
    uses: data.uses,
    find,
    /** Loads a new card and returns it. */
    sell: (name: string, cents: number): GiftCard => {
      const card: GiftCard = { code: newGiftCode(), name: name.trim() || 'Gift card', loadedCents: cents, balanceCents: cents, sold: demo.state.today };
      setData((d) => ({ ...d, cards: [card, ...d.cards], next: d.next + 1 }));
      return card;
    },
    /** Spends as much of the bill as the card covers and returns what it took. */
    spend: (code: string, billCents: number): number => {
      const card = find(code);
      if (!card) return 0;
      const r = redeemGift(card, billCents);
      setData((d) => ({ ...d, cards: d.cards.map((c) => (c.code === card.code ? r.card : c)), uses: [{ code: card.code, cents: r.appliedCents, at: new Date().toISOString() }, ...d.uses] }));
      return r.appliedCents;
    },
  };
}

export function useInvoices() {
  const demo = useDemo();
  const [invoices, setInvoices] = useShopState<Invoice[]>('invoices', () => seedInvoices(demo.state.today));
  return {
    invoices,
    markPaid: (id: string) => setInvoices((list) => list.map((i) => (i.id === id ? { ...i, paid: true } : i))),
  };
}

export interface DeliverySettings {
  connected: Record<DeliveryApp, boolean>;
  /** Markup on the shop price for delivery app menus. */
  markup: number;
  /** New delivery orders go straight to the packing queue without anyone tapping accept. */
  autoAccept: boolean;
  sent: number;
}

export function useDeliverySettings() {
  return useShopState<DeliverySettings>('delivery', () => ({ connected: { doordash: true, ubereats: true, grubhub: false }, markup: DEFAULT_APP_MARKUP, autoAccept: true, sent: 0 }));
}
