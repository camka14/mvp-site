import { screen } from '@testing-library/react';

import MySchedulePage from '../page';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const pushMock = jest.fn();
const useAppMock = jest.fn();
const scheduleCalendarPanelPropsMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

jest.mock('@/components/layout/Navigation', () => ({
  __esModule: true,
  default: () => <nav>Navigation</nav>,
}));

jest.mock('@/components/schedule/ScheduleCalendarPanel', () => ({
  __esModule: true,
  default: (props: { title?: string; staticEmpty?: boolean }) => {
    scheduleCalendarPanelPropsMock(props);
    return <div>{props.title}</div>;
  },
}));

describe('MySchedulePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isGuest: true,
      loading: false,
    });
  });

  it('renders an empty calendar for guests without redirecting to login', () => {
    renderWithMantine(<MySchedulePage />);

    expect(screen.getByText('My Schedule')).toBeInTheDocument();
    expect(scheduleCalendarPanelPropsMock).toHaveBeenLastCalledWith(expect.objectContaining({
      endpoint: '/api/profile/schedule?limit=200',
      staticEmpty: true,
    }));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
