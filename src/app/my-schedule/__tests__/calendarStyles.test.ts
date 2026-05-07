import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

const findRulesWithDeclaration = (declaration: string): string[] => {
  const rules = globalsCss.match(/[^{}]+{[^{}]+}/g) ?? [];
  return rules.filter((rule) => rule.includes(declaration));
};

describe('my schedule calendar card styles', () => {
  it('keeps week all-day cards tall enough for readable labels', () => {
    const minHeightRules = findRulesWithDeclaration('min-height: 2.7rem;');
    const contentRules = findRulesWithDeclaration('overflow: visible;');

    expect(
      minHeightRules.some((rule) => (
        rule.includes('.my-schedule-calendar-shell .rbc-time-header .rbc-row-segment')
        && rule.includes('.rbc-event')
      )),
    ).toBe(true);
    expect(
      contentRules.some((rule) => (
        rule.includes('.my-schedule-calendar-shell .rbc-time-header .rbc-row-segment')
        && rule.includes('.rbc-event-content')
        && rule.includes('min-height: 2.7rem;')
      )),
    ).toBe(true);
  });

  it('keeps agenda cards from collapsing into color strips', () => {
    const autoHeightRules = findRulesWithDeclaration('height: auto;');

    expect(
      autoHeightRules.some((rule) => (
        rule.includes('.my-schedule-calendar-shell .rbc-agenda-event-cell .shared-calendar-event')
        && rule.includes('min-height: 2.7rem;')
      )),
    ).toBe(true);
    expect(globalsCss).toContain('.my-schedule-calendar-shell .rbc-agenda-event-cell');
    expect(globalsCss).toContain('padding-top: 0.35rem;');
    expect(globalsCss).toContain('padding-bottom: 0.35rem;');
  });
});
