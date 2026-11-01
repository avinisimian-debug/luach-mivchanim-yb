import DAYS from '../days.json' with { type: 'json' };
export const ALL_DAYS = DAYS;
export const EXAMS = DAYS.map((d) => ({ ...d, items: d.items.filter((i) => i.k !== 'event') })).filter((d) => d.items.length);
