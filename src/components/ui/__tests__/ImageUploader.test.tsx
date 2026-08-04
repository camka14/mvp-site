import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import { ImageUploader } from '../ImageUploader';

jest.mock('../ImageSelectionModal', () => ({
  ImageSelectionModal: () => null,
}));

describe('ImageUploader', () => {
  it('applies caller sizing and renders accessible icon actions', () => {
    render(
      <MantineProvider>
        <ImageUploader
          currentImageUrl="/event-image.jpg"
          className="event-card-preview"
          previewHeight={176}
          onChange={jest.fn()}
        />
      </MantineProvider>,
    );

    const image = screen.getByAltText('Selected image');

    expect(image.closest('.event-card-preview')).not.toBeNull();
    expect(image).toHaveStyle({ height: 'calc(11rem * var(--mantine-scale))' });
    expect(screen.getByRole('button', { name: 'Change image' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Remove image' }).querySelector('svg')).not.toBeNull();
  });
});
