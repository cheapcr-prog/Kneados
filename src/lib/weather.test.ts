import { describe, expect, it } from 'vitest';
import { describeWeather, forecastUrl, isRainy, parseForecast } from './weather';

const reply = { daily: { time: ['2026-11-18', '2026-11-19'], weather_code: [1, 63], precipitation_probability_max: [5, 80], precipitation_sum: [0, 0.42], temperature_2m_max: [71.6, 61.2], temperature_2m_min: [55, 52] } };

describe('weather', () => {
  it('reads the day it is asked for', () => {
    expect(parseForecast(reply, '2026-11-19')).toEqual({ date: '2026-11-19', rainChance: 80, rainInches: 0.42, highF: 61, lowF: 52, code: 63 });
    expect(parseForecast(reply, '2026-11-25')).toBeUndefined();
    expect(parseForecast({ error: true }, '2026-11-19')).toBeUndefined();
    expect(parseForecast(null, '2026-11-19')).toBeUndefined();
  });
  it('calls a day rainy when rain is likely or a real amount is due', () => {
    expect(isRainy({ rainChance: 80, rainInches: 0 })).toBe(true);
    expect(isRainy({ rainChance: 30, rainInches: 0.2 })).toBe(true);
    expect(isRainy({ rainChance: 30, rainInches: 0.02 })).toBe(false);
  });
  it('describes the day in plain words', () => {
    expect(describeWeather(parseForecast(reply, '2026-11-18')!)).toBe('Partly cloudy, high 72°, 5% chance of rain');
    expect(describeWeather(parseForecast(reply, '2026-11-19')!)).toBe('Rain, high 61°, 80% chance of rain');
  });
  it('asks for the shop location in its own time zone', () => {
    const u = forecastUrl(33.77, -118.19, 'America/Los_Angeles');
    expect(u).toContain('latitude=33.77');
    expect(u).toContain('timezone=America%2FLos_Angeles');
  });
});
