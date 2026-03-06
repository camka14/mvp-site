import React from 'react';

import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { buildTeam } from '../../../../test/factories';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const { src, alt, fill, unoptimized, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} {...rest} />;
  },
}));

jest.mock('@/app/providers', () => ({
  useApp: jest.fn(),
}));

import TeamDetailModal from '../TeamDetailModal';
import { useApp } from '@/app/providers';

describe('TeamDetailModal', () => {
  beforeEach(() => {
    (useApp as jest.Mock).mockReturnValue({
      user: null,
    });
  });

  it('renders safely when eventFreeAgents prop is omitted', () => {
    const team = buildTeam({
      captainId: 'captain_1',
      playerIds: [],
      pending: [],
      teamSize: 6,
    });

    expect(() => {
      renderWithMantine(
        <TeamDetailModal
          currentTeam={team}
          isOpen={false}
          onClose={jest.fn()}
        />,
      );
    }).not.toThrow();
  });
});
