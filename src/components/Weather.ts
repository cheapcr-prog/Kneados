import { useEffect } from 'react';
import { useShopState } from '../data/local';
import { SHOP } from '../data/shop';
import { useDemo } from '../data/store';
import { forecastUrl, isRainy, parseForecast, type DayWeather } from '../lib/weather';

interface WeatherState {
  forecast?: DayWeather;
  fetchedAt?: string;
  /** Set when the forecast could not be loaded. */
  failed?: boolean;
  /** The owner's own call for tomorrow, when they overrule the forecast. */
  override?: 'clear' | 'rain';
}

const STALE_MS = 3 * 3600_000;

/**
 * Keeps tomorrow's weather up to date from the live forecast and feeds it to the bake plan,
 * so nobody has to tell KneadOS whether it will rain.
 */
export function useWeather() {
  const demo = useDemo();
  const { tomorrow, setRain } = demo;
  const [w, setW] = useShopState<WeatherState>('weather', () => ({}));
  const fresh = w.forecast?.date === tomorrow && w.fetchedAt && Date.now() - new Date(w.fetchedAt).getTime() < STALE_MS;

  useEffect(() => {
    if (fresh) return;
    let stop = false;
    fetch(forecastUrl(SHOP.lat, SHOP.lon, SHOP.timezone))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        const forecast = parseForecast(json, tomorrow);
        if (stop) return;
        setW((cur) => (forecast ? { ...cur, forecast, fetchedAt: new Date().toISOString(), failed: false } : { ...cur, failed: true }));
      })
      .catch(() => { if (!stop) setW((cur) => ({ ...cur, failed: true })); });
    return () => { stop = true; };
  }, [fresh, tomorrow, setW]);

  const forecast = w.forecast?.date === tomorrow ? w.forecast : undefined;
  const rain = w.override ? w.override === 'rain' : forecast ? isRainy(forecast) : undefined;
  const current = demo.state.tomorrowRain;
  useEffect(() => {
    if (rain !== undefined && rain !== current) setRain(rain);
  }, [rain, current, setRain]);

  return {
    forecast, failed: !!w.failed && !forecast, override: w.override,
    setOverride: (override?: 'clear' | 'rain') => setW((cur) => ({ ...cur, override })),
  };
}
