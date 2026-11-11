import { addDays, defaultForm, inclusiveDays, toDetails, type InsuranceForm } from '../products';

const form = (over: Partial<InsuranceForm>): InsuranceForm => ({ ...defaultForm('travel'), ...over });

describe('toDetails', () => {
  it('needs a start date', () => {
    expect(toDetails(form({}))).toBeNull();
  });
  it('travel needs an end date that is not before the start', () => {
    expect(toDetails(form({ start: '2026-11-10' }))).toBeNull();
    expect(toDetails(form({ start: '2026-11-10', end: '2026-11-09' }))).toBeNull();
    expect(toDetails(form({ start: '2026-11-10', end: '2026-11-12', region: 'asia', travelers: 2 }))).toEqual({
      product: 'travel', plan: 'standard', start_date: '2026-11-10', end_date: '2026-11-12', region: 'asia', travelers: 2,
    });
  });
  it('medical sends only the term', () => {
    expect(toDetails({ ...defaultForm('medical'), start: '2026-11-10', months: 6 })).toEqual({ product: 'medical', plan: 'standard', start_date: '2026-11-10', months: 6 });
  });
  it('car needs a plate of at least four characters, ignoring spaces and dashes', () => {
    expect(toDetails({ ...defaultForm('car'), start: '2026-11-10', plate: 'A-1 ' })).toBeNull();
    expect(toDetails({ ...defaultForm('car'), start: '2026-11-10', plate: 'A 123 BC' })).toMatchObject({ product: 'car', plan: 'full', plate: 'A 123 BC', months: 12 });
  });
  it('home needs an address', () => {
    expect(toDetails({ ...defaultForm('home'), start: '2026-11-10', address: 'abc' })).toBeNull();
    expect(toDetails({ ...defaultForm('home'), start: '2026-11-10', address: ' 12 Tverskaya St ' })).toMatchObject({ address: '12 Tverskaya St' });
  });
});

describe('dates', () => {
  it('counts both ends', () => {
    expect(inclusiveDays('2026-11-10', '2026-11-10')).toBe(1);
    expect(inclusiveDays('2026-11-10', '2026-11-12')).toBe(3);
    expect(inclusiveDays('2026-02-27', '2026-03-02')).toBe(4);
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
