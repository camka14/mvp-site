import { fireEvent, screen } from '@testing-library/react';

import UserCard from '../UserCard';
import { UserData } from '@/types';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const createUser = (overrides: Partial<UserData> = {}): UserData => ({
  $id: 'user_1',
  firstName: 'Jane',
  lastName: 'Doe',
  displayName: 'Jane Doe',
  dateOfBirth: '1990-01-01T00:00:00.000Z',
  isMinor: false,
  isIdentityHidden: false,
  dobVerified: true,
  teamIds: [],
  friendIds: [],
  friendRequestIds: [],
  friendRequestSentIds: [],
  followingIds: [],
  blockedUserIds: [],
  hiddenEventIds: [],
  userName: 'jane_doe',
  uploadedImages: [],
  fullName: 'Jane Doe',
  avatarUrl: '',
  ...overrides,
});

describe('UserCard interactions', () => {
  it('calls onClick for unrestricted users', () => {
    const onClick = jest.fn();

    renderWithMantine(<UserCard user={createUser()} onClick={onClick} />);

    fireEvent.click(screen.getByText('Jane Doe'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick for minor or placeholder-DOB users marked as minor', () => {
    const onClick = jest.fn();

    renderWithMantine(
      <UserCard
        user={createUser({
          $id: 'minor_1',
          firstName: 'Junior',
          lastName: 'Doe',
          displayName: 'Junior Doe',
          dateOfBirth: '1970-01-01T00:00:00.000Z',
          isMinor: true,
        })}
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByText('Junior Doe'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not call onClick for legacy hidden users', () => {
    const onClick = jest.fn();

    renderWithMantine(
      <UserCard
        user={createUser({
          displayName: 'Name Hidden',
          isIdentityHidden: true,
        })}
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByText('Name Hidden'));

    expect(onClick).not.toHaveBeenCalled();
  });
});
