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

  it('keeps resource colors available for typed calendar variants', () => {
    render(
      <SharedCalendarEvent
        title="Open rental slot"
        colorReferenceList={['court-alpha', 'court-beta']}
        colorMatchKey="court-beta"
        variant="availability"
      />,
    );

    const card = screen.getByText('Open rental slot').closest('.shared-calendar-event');
    const expectedColors = getIndexedEntityColorPair(1);
    expect(card).toHaveClass('shared-calendar-event--availability');
    expect(card).toHaveStyle(`--shared-calendar-resource-bg: ${expectedColors.bg}`);
    expect(card).not.toHaveStyle(`--shared-calendar-event-bg: ${expectedColors.bg}`);
  });

  it('renders a drag handle when draggable', () => {
    render(<SharedCalendarEvent title="Movable match" draggable />);

    const card = screen.getByText('Movable match').closest('.shared-calendar-event');
    expect(card).toHaveClass('shared-calendar-event--draggable');
    expect(card?.querySelector('.shared-calendar-event__drag-handle')).toBeInTheDocument();
  });

  it('keeps the full text label on the card root', () => {
    render(
      <SharedCalendarEvent
        title="Suns vs Golden Digs"
        subtitle="Spring League • Field 1"
        meta="Spring League"
      />,
    );

    const card = screen.getByText('Suns vs Golden Digs').closest('.shared-calendar-event');
    expect(card).toHaveAttribute('title', 'Suns vs Golden Digs • Spring League • Field 1 • Spring League');
  });
});
