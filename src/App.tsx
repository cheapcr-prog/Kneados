import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { DemoBar } from './components/DemoBar';
import { EventSync } from './components/Events';
import { SubscriptionSync } from './components/Subscriptions';
import { Events } from './pages/Events';
import { Fridays } from './pages/Fridays';
import { RewardsCardPage } from './pages/RewardsCardPage';
import { StaffLogin } from './components/Session';
import { Kitchen } from './pages/Kitchen';
import { Landing } from './pages/Landing';
import { Register } from './pages/Register';
import { Shop } from './pages/Shop';
import { PizzaLanding } from './pizza/pages/Landing';

// Pizza mode is its own demo shop with its own screens, loaded only when opened.
const PizzaDemoRoutes = lazy(() => import('./pizza/PizzaApp').then((m) => ({ default: m.PizzaDemoRoutes })));

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
      <Route path="/pizza" element={<PizzaLanding />} />
      <Route path="/pizza/demo/*" element={<Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading the pizza shop…</p>}><PizzaDemoRoutes /></Suspense>} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}

function DemoRoutes() {
  return (
    <div className="flex min-h-full flex-col">
      <DemoBar />
      <SubscriptionSync />
      <EventSync />
      <div className="flex-1">
        <Routes>
          <Route path="shop" element={<Shop />} />
          <Route path="shop/fridays" element={<Fridays />} />
          <Route path="shop/events" element={<Events />} />
          <Route path="shop/card/:code" element={<RewardsCardPage />} />
          <Route path="login" element={<StaffLogin />} />
          <Route path="register" element={<Register />} />
          <Route path="kitchen" element={<Kitchen />} />
          <Route path="owner" element={<Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading the dashboard…</p>}><Owner /></Suspense>} />
          <Route path="*" element={<Shop />} />
        </Routes>
      </div>
    </div>
  );
}
