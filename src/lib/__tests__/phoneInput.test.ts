import { formatPhoneInput } from '@/lib/phoneInput';

describe('formatPhoneInput', () => {
  it('formats a phone number as digits are typed', () => {
    let value = '';
    for (const digit of '5035550142') {
      value = formatPhoneInput(`${value}${digit}`);
    }

    expect(value).toBe('(503) 555-0142');
  });

  it('allows every digit to be removed without sticky punctuation', () => {
    let value = formatPhoneInput('5035550142');
    const values: string[] = [];

    while (value) {
      value = formatPhoneInput(value.slice(0, -1));
      values.push(value);
    }

    expect(values).toContain('(503) 555');
    expect(values).toContain('503');
    expect(values.at(-1)).toBe('');
  });

  it('normalizes a pasted US country code for local display', () => {
    expect(formatPhoneInput('+1 (503) 555-0142')).toBe('(503) 555-0142');
  });
});
