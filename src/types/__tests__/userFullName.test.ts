import { getUserFullName, type UserData } from '@/types';

describe('getUserFullName', () => {
  it('applies name casing to first and last name parts', () => {
    const user = {
      firstName: 'sam',
      lastName: 'raz',
      displayName: '',
      userName: 'samraz',
      isIdentityHidden: false,
    } as UserData;

    expect(getUserFullName(user)).toBe('Sam Raz');
  });

  it('preserves existing inner capitalization in names', () => {
    const user = {
      firstName: 'sam',
      lastName: 'McDonald',
      displayName: '',
      userName: 'sammy',
      isIdentityHidden: false,
    } as UserData;

    expect(getUserFullName(user)).toBe('Sam McDonald');
  });
});
