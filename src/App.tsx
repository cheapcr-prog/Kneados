import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { DemoBar } from './components/DemoBar';
import { SubscriptionSync } from './components/Subscriptions';
import { Fridays } from './pages/Fridays';
import { Kitchen } from './pages/Kitchen';
import { Landing } from './pages/Landing';
import { Register } from './pages/Register';
import { Shop } from './pages/Shop';

// The owner dashboard carries the charting library, so it loads only when opened.
const Owner = lazy(() => import('./pages/Owner').then((m) => ({ default: m.Owner })));

export function App() {
  const { pathname } = useLocation();
  // Each screen starts at the top, like a fresh page load.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/demo/*" element={<DemoRoutes />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}

function DemoRoutes() {
  return (
    <div className="flex min-h-full flex-col">
      <DemoBar />
      <SubscriptionSync />
      <div className="flex-1">
        <Routes>
          <Route path="shop" element={<Shop />} />
          <Route path="shop/fridays" element={<Fridays />} />
          <Route path="register" element={<Register />} />
          <Route path="kitchen" element={<Kitchen />} />
          <Route path="owner" element={<Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading the dashboard…</p>}><Owner /></Suspense>} />
          <Route path="*" element={<Shop />} />
        </Routes>
      </div>
    </div>
  );
}
