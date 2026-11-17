import { describe, expect, it } from 'vitest';
import { MAX_STREET_GUESSES, STREETS, soundOf, streetGuesses } from './streets';

describe('streets that sound like what was heard', () => {
  it('puts Ximeno first for the way a real call heard it', () => {
    const [first] = streetGuesses('1746 Eximino Avenue');
    expect(first).toEqual({ heard: 'Eximino', street: 'Ximeno', address: '1746 Ximeno Avenue' });
  });

  it('handles other mishearings, a direction, and a city said after the street', () => {
    expect(streetGuesses('640 Hunipero Ave')[0].street).toBe('Junipero');
    expect(streetGuesses('210 Turmino Avenue Long Beach California')[0].address).toBe('210 Termino Avenue Long Beach California');
    expect(streetGuesses('1450 East Livingstone Drive')[0]).toMatchObject({ street: 'Livingston', address: '1450 East Livingston Drive' });
    expect(streetGuesses('1925 Radondo Ave, Long Beach')[0].address).toBe('1925 Redondo Ave, Long Beach');
  });

  it('never swaps a real street for another one: then the house number is the problem', () => {
    expect(streetGuesses('99999 Ximeno Ave')).toEqual([]);
    expect(streetGuesses('1 Termino Avenue')).toEqual([]);
  });

  it('leaves numbered streets, addresses without a house number and nonsense alone', () => {
    expect(streetGuesses('1180 E 4th St')).toEqual([]);
    expect(streetGuesses('Eximino Avenue')).toEqual([]);
    expect(streetGuesses('12 Qwrtzplk Street')).toEqual([]);
    expect(streetGuesses('1746 Eximino Avenue').length).toBeLessThanOrEqual(MAX_STREET_GUESSES);
  });

  it('knows the delivery area streets and how they sound', () => {
    expect(STREETS.length).toBeGreaterThan(900);
    expect(new Set(STREETS).size).toBe(STREETS.length);
    expect(soundOf('Eximino')).toBe(soundOf('Ximeno'));
  });
});
