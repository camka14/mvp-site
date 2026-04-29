import { MOBILE_APP_AVATAR_PALETTE } from '@/app/theme/mobilePalette';
import { getEntityColorPair, hashEntityString } from '../entityColors';

describe('entityColors', () => {
  it('uses the same deterministic hash shape as initials avatars', () => {
    expect(hashEntityString('User')).toBe(2645995);
    expect(hashEntityString('Court Alpha')).toBe(468990537);
  });

  it('selects colors from the shared avatar palette', () => {
    expect(getEntityColorPair('User')).toEqual(MOBILE_APP_AVATAR_PALETTE[3]);
    expect(getEntityColorPair('Court Alpha')).toEqual(MOBILE_APP_AVATAR_PALETTE[1]);
  });

  it('falls back to a stable default seed for blank values', () => {
    expect(getEntityColorPair('   ')).toEqual(MOBILE_APP_AVATAR_PALETTE[0]);
    expect(getEntityColorPair(null)).toEqual(MOBILE_APP_AVATAR_PALETTE[0]);
  });
});
