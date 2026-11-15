/** Tomorrow's weather for the bake forecast, read from the free Open-Meteo forecast. */

export interface DayWeather {
  date: string;
  /** Chance of rain, 0 to 100. */
  rainChance: number;
  rainInches: number;
  highF: number;
  lowF: number;
  /** WMO weather code. */
  code: number;
}

export function forecastUrl(lat: number, lon: number, timezone: string): string {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), daily: 'weather_code,precipitation_probability_max,precipitation_sum,temperature_2m_max,temperature_2m_min',
    temperature_unit: 'fahrenheit', precipitation_unit: 'inch', timezone, forecast_days: '3',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

/** Picks one day out of the forecast. Undefined when the day is not in it or the reply is not what was expected. */
export function parseForecast(json: unknown, date: string): DayWeather | undefined {
  const d = (json as { daily?: Record<string, unknown[]> } | null)?.daily;
  const i = Array.isArray(d?.time) ? d!.time.indexOf(date) : -1;
  if (!d || i < 0) return undefined;
  const num = (key: string) => { const v = Number(d[key]?.[i]); return Number.isFinite(v) ? v : 0; };
  return {
    date, rainChance: num('precipitation_probability_max'), rainInches: num('precipitation_sum'),
    highF: Math.round(num('temperature_2m_max')), lowF: Math.round(num('temperature_2m_min')), code: num('weather_code'),
  };
}

/** A day counts as rainy for the bake plan when rain is more likely than not, or a real amount is expected. */
export function isRainy(w: Pick<DayWeather, 'rainChance' | 'rainInches'>): boolean {
  return w.rainChance >= 50 || w.rainInches >= 0.1;
}

export function describeWeather(w: DayWeather): string {
  const c = w.code;
  const sky = c === 0 ? 'Clear' : c <= 2 ? 'Partly cloudy' : c === 3 ? 'Cloudy' : c <= 48 ? 'Foggy' : c <= 57 ? 'Drizzle' : c <= 67 ? 'Rain' : c <= 77 ? 'Snow' : c <= 82 ? 'Showers' : c <= 86 ? 'Snow showers' : 'Thunderstorms';
  return `${sky}, high ${w.highF}°, ${Math.round(w.rainChance)}% chance of rain`;
}
