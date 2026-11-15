import type { LogEntry, Paper, PaperRule, Requirement, RulePack, Source, StaffHire } from '../lib/compliance';
import { plusDays } from '../lib/compliance';

/**
 * Rule packs. The state rules are the California Retail Food Code, which every county and city
 * health department in California enforces. A city pack adds what is local.
 * Sources were read on 2026-11-15. `verified: false` marks a section number or a common practice
 * that was not read from the source that day, and the screen tells the owner to confirm it.
 */
export const RULES_CHECKED = '2026-11-15';

const code = (section: string, url?: string): Source => ({ label: `California Retail Food Code section ${section}`, url });
const HOLDING = code('113996', 'https://california.public.law/codes/health_and_safety_code_section_113996');
const SANITIZER = code('114099.6', 'https://california.public.law/codes/health_and_safety_code_section_114099.6');
const TIME = code('114000', 'https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-114000/');
const HANDLER = code('113948', 'https://california.public.law/codes/health_and_safety_code_section_113948');
const MANAGER = code('113947.1', 'https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-113947-1/');
const ALLERGEN = code('113947', 'https://california.public.law/codes/health_and_safety_code_section_113947');
const FIRE: Source = { label: 'California Fire Code sections 606.3.3.1 and 904.13.5.2, as summarized by a California fire district', url: 'https://firedepartment.org/home/showpublisheddocument/108/638088492345270000' };
const PRACTICE: Source = { label: 'Common practice, not a written rule' };

const cold = (id: string, what: string): Requirement => ({
  id, group: 'Temperatures', title: `Log the ${what} temperature`, rule: 'Food that can spoil is kept at 41°F or colder.', source: HOLDING, verified: true, basis: 'law',
  everyDays: 1, perDay: 2, reading: { unit: '°F', max: 41 }, major: true, who: id === 'walkin' ? 'kitchen' : 'counter',
});

const CALIFORNIA: Requirement[] = [
  cold('walkin', 'walk-in fridge'),
  cold('milk-fridge', 'milk and cream fridge'),
  cold('filled-case', 'cream and custard donut case'),
  { id: 'hot-case', group: 'Temperatures', title: 'Log the hot case temperature (ham and cheese croissants)', rule: 'Hot food that can spoil is kept at 135°F or hotter.', source: HOLDING, verified: true, basis: 'law', everyDays: 1, perDay: 2, reading: { unit: '°F', min: 135 }, major: true, who: 'counter' },
  { id: 'time-marks', group: 'Temperatures', title: 'Mark the 4 hour throw-out time on filled donuts kept on the counter', rule: 'Food kept out of the fridge is marked with the time four hours after it came out, and is sold or thrown away by then. The shop keeps written steps for this.', source: TIME, verified: true, basis: 'law', everyDays: 1, major: true, who: 'counter' },
  { id: 'probe', group: 'Temperatures', title: 'Check the probe thermometer in ice water', rule: 'A probe thermometer that reads right is on hand. In ice water it should read 32°F.', source: code('114159'), verified: false, basis: 'law', everyDays: 7, reading: { unit: '°F', min: 30, max: 34 }, major: false, who: 'kitchen' },
  { id: 'fryer-oil', group: 'Temperatures', title: 'Log the fryer oil temperature', rule: 'Not a health rule. Oil at the right heat fries evenly and lasts longer, and a log shows when a thermostat is drifting.', source: PRACTICE, verified: false, basis: 'practice', everyDays: 1, reading: { unit: '°F', min: 360, max: 385 }, major: false, who: 'kitchen' },

  { id: 'sani-bucket', group: 'Cleaning and sanitizing', title: 'Test the sanitizer buckets', rule: 'Quaternary ammonium sanitizer is at 200 ppm. Wiping cloths stay in the bucket between uses, and the solution is changed when it gets cloudy.', source: SANITIZER, verified: true, basis: 'law', everyDays: 1, perDay: 2, reading: { unit: ' ppm', min: 200, max: 400 }, major: true, who: 'kitchen' },
  { id: 'sani-sink', group: 'Cleaning and sanitizing', title: 'Test the sanitizer in the three-part sink', rule: 'Utensils sit in 200 ppm quaternary ammonium for at least one minute. With chlorine it is 100 ppm for 30 seconds.', source: SANITIZER, verified: true, basis: 'law', everyDays: 1, reading: { unit: ' ppm', min: 200, max: 400 }, major: true, who: 'kitchen' },
  { id: 'surfaces', group: 'Cleaning and sanitizing', title: 'Clean and sanitize the glazing table, cutters and scoops', rule: 'Surfaces and tools that touch food are cleaned and sanitized through the day, at least every four hours while in use.', source: code('114117'), verified: false, basis: 'law', everyDays: 1, perDay: 2, major: true, who: 'kitchen' },
  { id: 'ice-machine', group: 'Cleaning and sanitizing', title: 'Clean and sanitize the ice machine and bin', rule: 'Ice is food. The machine is cleaned on the maker\'s schedule so mold and slime do not build up.', source: PRACTICE, verified: false, basis: 'practice', everyDays: 30, major: false, who: 'counter' },
  { id: 'deep-clean', group: 'Cleaning and sanitizing', title: 'Deep clean floors, walls, drains and under equipment', rule: 'Floors, walls and ceilings are kept clean and in good repair.', source: code('114257'), verified: false, basis: 'law', everyDays: 7, major: false, who: 'kitchen' },

  { id: 'hand-sinks', group: 'Handwashing and staff', title: 'Check every hand sink: soap, paper towels, warm water, nothing in the way', rule: 'Each hand sink has soap, paper towels and warm water, and is used only for washing hands.', source: code('113953 and 113953.2'), verified: false, basis: 'law', everyDays: 1, perDay: 2, major: true, who: 'counter' },
  { id: 'restroom', group: 'Handwashing and staff', title: 'Check the restroom: clean, stocked, hand washing sign up', rule: 'Restrooms are clean, stocked with soap, towels and toilet paper, and have a sign telling staff to wash their hands.', source: code('113953.5 and 114250'), verified: false, basis: 'law', everyDays: 1, major: false, who: 'counter' },
  { id: 'sick-check', group: 'Handwashing and staff', title: 'Confirm nobody is working sick', rule: 'Staff with vomiting, diarrhea or a diagnosed foodborne illness do not work with food, and staff know to report it.', source: code('113949.2'), verified: false, basis: 'law', everyDays: 1, major: true, who: 'manager' },
  { id: 'hot-water', group: 'Handwashing and staff', title: 'Check the hot water at the three-part sink', rule: 'Hot water at the dish sink reaches at least 120°F.', source: code('114192'), verified: false, basis: 'law', everyDays: 30, reading: { unit: '°F', min: 120 }, major: true, who: 'manager' },

  { id: 'pest-walk', group: 'Pests', title: 'Walk the shop for signs of pests', rule: 'The shop is kept free of roaches, rodents and flies. Look for droppings, gnaw marks and gaps under doors.', source: code('114259 and 114259.1'), verified: false, basis: 'law', everyDays: 7, major: true, who: 'manager' },
  { id: 'pest-service', group: 'Pests', title: 'Pest control service visit', rule: 'A licensed pest control company treats and inspects, and the report is kept on file to show the inspector.', source: PRACTICE, verified: false, basis: 'practice', everyDays: 30, vendor: true, major: false, who: 'manager' },

  { id: 'hood-clean', group: 'Building and fire', title: 'Hood and exhaust duct inspection and cleaning', rule: 'Hoods and ducts over fryers are inspected every six months by a qualified company and cleaned when grease has built up.', source: FIRE, verified: true, basis: 'law', everyDays: 182, vendor: true, major: true, who: 'manager' },
  { id: 'hood-system', group: 'Building and fire', title: 'Hood fire suppression system service', rule: 'The automatic fire system over the fryers is serviced every six months and after any time it goes off.', source: FIRE, verified: true, basis: 'law', everyDays: 182, vendor: true, major: true, who: 'manager' },
  { id: 'extinguishers', group: 'Building and fire', title: 'Fire extinguisher yearly service', rule: 'Extinguishers are serviced and tagged once a year by a licensed company.', source: { label: 'California Code of Regulations, Title 19' }, verified: false, basis: 'law', everyDays: 365, vendor: true, major: false, who: 'manager' },
];

const CA_PAPERS: PaperRule[] = [
  { id: 'manager-cert', title: 'Food Protection Manager certificate', rule: 'At least one owner or employee has passed an approved food safety exam. The certificate is kept at the shop and renewed every five years. A shop has 60 days to replace a certified person who leaves.', source: MANAGER, verified: true, validYears: 5, major: true },
  { id: 'allergen', title: 'Allergen training for all staff', rule: 'The person in charge knows the major food allergens and the symptoms they cause, and teaches the staff. KneadOS asks for a refresher once a year, which is our practice and not part of the rule.', source: ALLERGEN, verified: true, validYears: 1, major: false },
  { id: 'time-procedure', title: 'Written steps for the 4 hour rule', rule: 'A shop that keeps filled donuts out of the fridge has written steps for marking and throwing them out, ready to show the inspector.', source: TIME, verified: true, major: true },
];

export const PACKS: RulePack[] = [
  {
    id: 'long-beach', city: 'Long Beach, CA', agency: 'Long Beach Health Department, Bureau of Environmental Health', phone: '(562) 570-4132',
    posting: 'Long Beach does not post letter grades or scores. The inspector leaves an Inspection Summary Report that must stay posted where customers can see it until the next routine inspection.',
    notes: [
      'Long Beach runs its own health department, separate from Los Angeles County, and enforces the California Retail Food Code.',
      'The same bureau inspects food facilities for grease going down the drain and oversees the grease haulers.',
    ],
    requirements: [
      ...CALIFORNIA,
      { id: 'grease', group: 'Building and fire', title: 'Grease interceptor pumped by a licensed hauler', rule: 'Long Beach inspects food facilities for grease discharge. Keep the hauler\'s receipt for every pump-out. Every 90 days is a common schedule for a fryer shop, but the city page does not give a number, so ask your inspector what yours should be.', source: { label: 'Long Beach grease management program', url: 'https://www.longbeach.gov/health/inspections-and-reporting/inspections/water-quality/grease-management-program/' }, verified: false, basis: 'law', everyDays: 90, vendor: true, major: true, who: 'manager' },
    ],
    papers: [
      { id: 'permit', title: 'Long Beach health permit', rule: 'A valid health permit is posted in the shop. Long Beach bills it each year. The due date is on the permit.', source: { label: 'Long Beach food safety program', url: 'https://www.longbeach.gov/health/inspections-and-reporting/inspections/environmental-health-bureau/food-safety-program/' }, verified: false, validYears: 1, major: true },
      { id: 'summary-report', title: 'Inspection Summary Report posted', rule: 'The summary from the last routine inspection is posted in a place customers can see, and stays up until the next one.', source: { label: 'Long Beach food facility questions and answers', url: 'https://www.longbeach.gov/health/services/directory/food-faqs/' }, verified: true, major: true },
      ...CA_PAPERS,
      { id: 'grease-receipts', title: 'Grease hauler receipts on file', rule: 'Receipts from each pump-out are kept at the shop to show the inspector.', source: { label: 'Long Beach grease management program', url: 'https://www.longbeach.gov/health/inspections-and-reporting/inspections/water-quality/grease-management-program/' }, verified: false, major: false },
    ],
    foodHandler: { daysAfterHire: 30, validYears: 3, source: HANDLER },
  },
  {
    id: 'california', city: 'Another California city', agency: 'Your county or city environmental health department',
    posting: 'What gets posted after an inspection depends on the county or city. Some post a letter grade, some a colored placard, some a report.',
    notes: ['These are the statewide rules only. Local additions such as grease, permits and posting have not been loaded for this city yet.'],
    requirements: CALIFORNIA,
    papers: [{ id: 'permit', title: 'Health permit', rule: 'A valid health permit from the local health department is posted in the shop.', source: code('114381'), verified: false, validYears: 1, major: true }, ...CA_PAPERS],
    foodHandler: { daysAfterHire: 30, validYears: 3, source: HANDLER },
  },
];

export const PACK_BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p]));

/** Example hire dates. Luis is a new hire still inside his 30 days. */
export function seedHires(today: string): StaffHire[] {
  return [
    { id: 'rosa', name: 'Rosa M.', hired: '2019-03-04', exempt: true },
    { id: 'danny', name: 'Danny T.', hired: '2021-06-14' },
    { id: 'luis', name: 'Luis R.', hired: plusDays(today, -18) },
    { id: 'mai', name: 'Mai N.', hired: '2023-02-20' },
    { id: 'jess', name: 'Jess P.', hired: '2024-08-05' },
    { id: 'andre', name: 'Andre W.', hired: '2022-11-01' },
  ];
}

/** Example papers. One card has run out and one runs out soon, so the screen has something to flag. */
export function seedPapers(today: string): Paper[] {
  return [
    { id: 'card:danny', expires: plusDays(today, 410) },
    { id: 'card:mai', expires: plusDays(today, 27) },
    { id: 'card:jess', expires: plusDays(today, 620) },
    { id: 'card:andre', expires: plusDays(today, -12) },
    { id: 'manager-cert', expires: plusDays(today, 900) },
    { id: 'permit', expires: plusDays(today, 38) },
    { id: 'allergen', expires: plusDays(today, 140) },
    { id: 'summary-report', onFile: true },
    { id: 'time-procedure', onFile: true },
    { id: 'grease-receipts', onFile: true },
  ];
}

/** A steady, repeatable number between 0 and 1 from a string, so the example log is the same on every load. */
function steady(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const WHO: Record<Requirement['who'], string> = { counter: 'jess', kitchen: 'luis', manager: 'danny' };

/** Example readings that pass, near the middle of the allowed range. */
function sample(req: Requirement, key: string): number | undefined {
  const r = req.reading;
  if (!r) return undefined;
  const n = steady(key);
  if (r.unit === '°F' && r.max === 41) return Math.round(35 + n * 5);
  if (r.unit === '°F' && r.min === 135) return Math.round(140 + n * 12);
  if (r.unit === '°F' && r.min === 120) return Math.round(122 + n * 8);
  if (r.unit === '°F' && r.min === 360) return Math.round(365 + n * 15);
  if (r.unit === '°F') return Math.round(31.6 + n);
  return 200 + Math.round(n * 4) * 50;
}

/**
 * Example log for the last two weeks, up to this hour today. A few things are left undone on purpose:
 * the grease interceptor is overdue, the weekly pest walk is due, and this morning's milk fridge read warm.
 */
export function seedLog(today: string, hour: number, reqs: Requirement[], openHour: number, closeHour: number): LogEntry[] {
  const out: LogEntry[] = [];
  const at = (date: string, h: number) => `${date}T${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}:00`;
  const lastDone: Record<string, number> = { probe: 3, 'deep-clean': 4, 'ice-machine': 12, 'hot-water': 20, 'pest-walk': 7, 'pest-service': 16, 'hood-clean': 150, 'hood-system': 150, extinguishers: 200, grease: 104 };
  for (const req of reqs) {
    const by = WHO[req.who];
    if (req.everyDays > 1) {
      const ago = lastDone[req.id] ?? Math.floor(req.everyDays / 2);
      const date = plusDays(today, -ago);
      out.push({ reqId: req.id, at: at(date, 9), by, value: sample(req, req.id + date), ok: true });
      continue;
    }
    const perDay = req.perDay ?? 1;
    const span = (closeHour - openHour) / perDay;
    for (let d = 14; d >= 0; d--) {
      const date = plusDays(today, -d);
      for (let i = 0; i < perDay; i++) {
        const h = openHour + span * i + 0.25 + steady(req.id + date + i) * 0.5;
        if (d === 0 && h > hour) continue;
        // The second sanitizer and hand sink checks are left for the demo visitor to do.
        if (d === 0 && i > 0 && (req.id === 'sani-bucket' || req.id === 'hand-sinks')) continue;
        if (d === 0 && i === 0 && req.id === 'milk-fridge') { out.push({ reqId: req.id, at: at(date, h), by, value: 46, ok: false, fix: 'Door was left open during the delivery. Closed it and moved the milk to the walk-in.' }); continue; }
        out.push({ reqId: req.id, at: at(date, h), by, value: sample(req, req.id + date + i), ok: true });
      }
    }
  }
  return out;
}
