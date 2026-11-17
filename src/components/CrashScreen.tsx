import { Component, type ReactNode } from 'react';
import { reloadForNewVersion } from '../lib/freshLoad';

/** Missing files after a new version ships look like this in every browser we care about. */
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically|Unable to preload|ChunkLoadError/i;

/**
 * Catches anything that would otherwise leave a blank white page.
 * A stale version reloads itself once. Anything else shows a plain screen with a way out.
 */
export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error) {
    if (STALE.test(error.message)) reloadForNewVersion();
  }

  private clearDemo = () => {
    if (!confirm('Reset the demo data saved in this browser and reload?')) return;
    try { for (const key of Object.keys(localStorage)) if (key.startsWith('kneados-')) localStorage.removeItem(key); } catch { /* storage blocked */ }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-900 p-6 text-white">
        <div className="max-w-md text-center">
          <p className="font-display text-2xl font-extrabold">This screen hit a snag</p>
          <p className="mt-2 text-sm text-slate-300">Reloading usually fixes it. If it keeps happening, reset the demo data saved in this browser.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button onClick={() => window.location.reload()} className="rounded-xl bg-glaze-500 px-5 py-3 text-sm font-bold text-ink-900">Reload</button>
            <button onClick={this.clearDemo} className="rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white">Reset demo data</button>
          </div>
          <p className="mt-6 break-words text-xs text-slate-500">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
