import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileImageUploadField } from '../ProfileImageUploadField';

describe('ProfileImageUploadField', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeAll(() => {
    URL.createObjectURL = jest.fn(() => 'blob:profile-preview');
    URL.revokeObjectURL = jest.fn();
  });

  afterAll(() => {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts a valid image file and shows remove controls', async () => {
    const user = userEvent.setup();
    const onFileChange = jest.fn();
    const file = new File(['profile'], 'profile.png', { type: 'image/png' });

    render(
      <ProfileImageUploadField
        file={null}
        onFileChange={onFileChange}
      />,
    );

    await user.upload(screen.getByLabelText(/profile photo/i), file);

    expect(onFileChange).toHaveBeenCalledWith(file);
  });

  it('rejects unsupported image files', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onError = jest.fn();
    const onFileChange = jest.fn();
    const file = new File(['not image'], 'profile.txt', { type: 'text/plain' });

    render(
      <ProfileImageUploadField
        file={null}
        onFileChange={onFileChange}
        onError={onError}
      />,
    );

    await user.upload(screen.getByLabelText(/profile photo/i), file);

    expect(onFileChange).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Please select a PNG, JPEG, WebP, AVIF, or SVG image.');
  });

  it('clears a selected profile image', async () => {
    const user = userEvent.setup();
    const onFileChange = jest.fn();
    const file = new File(['profile'], 'profile.png', { type: 'image/png' });

    render(
      <ProfileImageUploadField
        file={file}
        onFileChange={onFileChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText('Profile preview')).toHaveAttribute('src', 'blob:profile-preview');
    });
    await user.click(screen.getByRole('button', { name: /remove/i }));

    expect(onFileChange).toHaveBeenCalledWith(null);
  });
});
