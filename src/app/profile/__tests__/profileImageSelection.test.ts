import { withSelectedProfileImage } from '@/app/profile/profileImageSelection';

describe('withSelectedProfileImage', () => {
  it('stores the selected file id instead of the preview url', () => {
    const previous = {
      firstName: 'Seed',
      lastName: 'User',
      userName: 'seed.user',
      dateOfBirth: '2000-01-01',
      profileImageId: 'old_file_id',
    };

    const next = withSelectedProfileImage(
      previous,
      'new_file_id',
      '/api/files/new_file_id/preview?w=320&h=320&fit=cover',
    );

    expect(next.profileImageId).toBe('new_file_id');
  });

  it('clears the profile image id when selection is removed', () => {
    const previous = {
      profileImageId: 'existing_file_id',
    };

    const next = withSelectedProfileImage(previous, '', '');

    expect(next.profileImageId).toBe('');
  });
});
