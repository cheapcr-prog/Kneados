import { useMemo } from 'react';
import { useShopState } from '../data/local';
import { RECIPES } from '../data/supplies';

type Recipes = Record<string, Record<string, number>>;

/** The shop's recipes with the owner's own scoop counts on top. Supplies and reordering read these. */
export function useRecipes() {
  const [edits, setEdits] = useShopState<Recipes>('recipes', () => ({}));
  const recipes = useMemo<Recipes>(() => {
    const out: Recipes = { ...RECIPES };
    for (const [item, parts] of Object.entries(edits)) out[item] = { ...RECIPES[item], ...parts };
    return out;
  }, [edits]);
  return {
    recipes,
    edited: Object.keys(edits).length > 0,
    setAmount: (itemId: string, supplyId: string, amount: number) => setEdits((e) => ({ ...e, [itemId]: { ...e[itemId], [supplyId]: Math.max(0, amount) } })),
    reset: () => setEdits({}),
  };
}
