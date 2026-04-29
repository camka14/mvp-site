import { render, screen } from '@testing-library/react';

import { getIndexedEntityColorPair } from '@/lib/entityColors';
import SharedCalendarEvent from '../SharedCalendarEvent';

describe('SharedCalendarEvent', () => {
  it('uses ordered colors when a reference list and match key are provided', () => {
    render(
      <SharedCalendarEvent
        title="Court Beta Match"
        colorReferenceList={['court-alpha', 'court-beta']}
        colorMatchKey=" COURT-BETA "
      />,
    );

    const card = screen.getByText('Court Beta Match').closest('.shared-calendar-event');
    const expectedColors = getIndexedEntityColorPair(1);
    expect(card).toHaveStyle(`--shared-calendar-event-bg: ${expectedColors.bg}`);
    expect(card).toHaveStyle(`--shared-calendar-event-text: ${expectedColors.text}`);
  });

  it('keeps explicit colors above ordered colors', () => {
    render(
      <SharedCalendarEvent
        title="Selection"
        colorReferenceList={['court-alpha']}
        colorMatchKey="court-alpha"
        colors={{ bg: '#111111', text: '#eeeeee' }}
      />,
    );

    const card = screen.getByText('Selection').closest('.shared-calendar-event');
    expect(card).toHaveStyle('--shared-calendar-event-bg: #111111');
    expect(card).toHaveStyle('--shared-calendar-event-text: #eeeeee');
  });

  it('renders a drag handle when draggable', () => {
    render(<SharedCalendarEvent title="Movable match" draggable />);

    const card = screen.getByText('Movable match').closest('.shared-calendar-event');
    expect(card).toHaveClass('shared-calendar-event--draggable');
    expect(card?.querySelector('.shared-calendar-event__drag-handle')).toBeInTheDocument();
  });
});
