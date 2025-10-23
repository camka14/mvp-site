import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';

export const renderWithMantine = (ui: ReactElement, options?: RenderOptions) =>
  render(
    <MantineProvider>
      <ModalsProvider>
        <Notifications />
        {ui}
      </ModalsProvider>
    </MantineProvider>,
    options,
  );

