import { Link, useParams } from 'react-router-dom';
import { RewardsCard, WalletButtons } from '../components/Rewards';
import { SHOP } from '../data/shop';
import { useDemo } from '../data/store';
import type { RewardsMember } from '../data/types';
import { phoneFromCode } from '../lib/wallet';

/** The page a customer opens from their text to get their Dough Rewards card. */
export function RewardsCardPage() {
  const { code = '' } = useParams();
  const demo = useDemo();
  // Only a real member's card opens. A made-up or mistyped code shows nothing about anyone.
  const phone = phoneFromCode(code, demo.state.members.map((m) => m.phone));
  const member: RewardsMember | undefined = phone ? demo.findMember(phone) : undefined;
  return (
    <div className="min-h-[calc(100vh-48px)] bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-sm">
        {member ? (
          <>
            <RewardsCard member={member} />
            <div className="mt-4"><WalletButtons member={member} /></div>
            <p className="mt-4 text-center text-xs text-slate-500">Keep this card in your phone and show it at {SHOP.name}. The cashier scans it, and you never have to say your number out loud.</p>
          </>
        ) : (
          <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
            <h1 className="font-display text-xl font-bold">We could not find that card</h1>
            <p className="mt-1 text-sm text-slate-600">The link may be cut off. Order online with your phone number and we will send a fresh one.</p>
          </div>
        )}
        <Link to="/demo/shop" className="mt-5 block text-center text-sm font-semibold text-glaze-700 underline">Back to {SHOP.name}</Link>
      </div>
    </div>
  );
}
