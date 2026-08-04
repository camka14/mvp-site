import {
  formatManualPaymentProviderInput,
  getManualPaymentLinkError,
  getManualPaymentProviderInputLabel,
  getManualPaymentProviderInputPlaceholder,
  normalizeManualPaymentLinks,
  normalizeManualPaymentLinksForDraft,
  normalizeManualPaymentLinksForPersistence,
  normalizeManualPaymentUrl,
} from '../manualRegistrationPayments';

describe('manual registration payments', () => {
  it.each([
    ['CASH_APP', '$camka14', 'https://cash.app/$camka14'],
    ['VENMO', '@camka14', 'https://venmo.com/u/camka14'],
    ['PAYPAL', 'camka14', 'https://paypal.me/camka14'],
  ] as const)('normalizes %s usernames', (provider, input, expected) => {
    expect(normalizeManualPaymentUrl(provider, input)).toBe(expected);
  });

  it('accepts HTTPS links and rejects invalid destinations', () => {
    expect(normalizeManualPaymentUrl('OTHER', 'https://payments.example.com/camka14'))
      .toBe('https://payments.example.com/camka14');
    expect(normalizeManualPaymentUrl('CASH_APP', 'http://cash.app/$camka14')).toBeNull();
    expect(normalizeManualPaymentUrl('CASH_APP', '$cam ka14')).toBeNull();
    expect(normalizeManualPaymentUrl('STRIPE', 'camka14')).toBeNull();
  });

  it('formats stored provider URLs for editing', () => {
    expect(formatManualPaymentProviderInput('CASH_APP', 'https://cash.app/$camka14'))
      .toBe('$camka14');
    expect(formatManualPaymentProviderInput('VENMO', 'https://venmo.com/u/camka14'))
      .toBe('@camka14');
    expect(formatManualPaymentProviderInput('PAYPAL', 'https://paypal.me/camka14'))
      .toBe('camka14');
  });

  it('keeps invalid provider input in draft state while canonicalizing valid destinations', () => {
    expect(normalizeManualPaymentLinksForDraft([
      { id: 'invalid', provider: 'CASH_APP', label: 'Cash App', url: '$' },
      { id: 'valid', provider: 'VENMO', label: 'Venmo', url: '@rivercity' },
    ])).toEqual([
      { id: 'invalid', provider: 'CASH_APP', label: 'Cash App', url: '$' },
      { id: 'valid', provider: 'VENMO', label: 'Venmo', url: 'https://venmo.com/u/rivercity' },
    ]);
  });

  it('returns provider-specific labels, placeholders, and errors', () => {
    expect(getManualPaymentProviderInputLabel('CASH_APP')).toBe('Cash App username');
    expect(getManualPaymentProviderInputPlaceholder('VENMO')).toBe('@bracketiq');
    expect(getManualPaymentLinkError('CASH_APP', '')).toBe('Enter cash app username.');
    expect(getManualPaymentLinkError('CASH_APP', '$')).toBe(
      'Enter a valid Cash App username or HTTPS link.',
    );
    expect(getManualPaymentLinkError('ZELLE', 'camka14')).toBe(
      'Enter a valid https:// payment link.',
    );
    expect(getManualPaymentLinkError('PAYPAL', 'camka14')).toBeNull();
  });

  it('canonicalizes provider inputs without silently dropping valid usernames', () => {
    expect(normalizeManualPaymentLinks([
      {
        id: 'cash',
        provider: 'CASH_APP',
        label: '',
        url: '$camka14',
      },
      {
        id: 'venmo',
        provider: 'VENMO',
        label: 'Venmo account',
        url: '@camka14',
      },
    ])).toEqual([
      {
        id: 'cash',
        provider: 'CASH_APP',
        label: 'Cash App',
        url: 'https://cash.app/$camka14',
      },
      {
        id: 'venmo',
        provider: 'VENMO',
        label: 'Venmo account',
        url: 'https://venmo.com/u/camka14',
      },
    ]);
  });

  it('rejects invalid persistence input instead of silently dropping the row', () => {
    expect(() => normalizeManualPaymentLinksForPersistence([{
      id: 'cash',
      provider: 'CASH_APP',
      label: 'Cash App',
      url: '$',
    }])).toThrow('Enter a valid Cash App username or HTTPS link.');
  });
});
