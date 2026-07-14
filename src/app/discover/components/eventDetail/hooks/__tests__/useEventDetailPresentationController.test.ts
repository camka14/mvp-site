import { act, renderHook } from '@testing-library/react';

import { buildUser } from '../../../../../../../test/factories';
import { useEventDetailPresentationController } from '../useEventDetailPresentationController';

describe('useEventDetailPresentationController', () => {
    it('owns participant dropdown visibility independently', () => {
        const { result } = renderHook(() => useEventDetailPresentationController());

        act(() => {
            result.current.openPlayersDropdown();
            result.current.openTeamsDropdown();
            result.current.openFreeAgentsDropdown();
        });
        expect(result.current.playersDropdownOpened).toBe(true);
        expect(result.current.teamsDropdownOpened).toBe(true);
        expect(result.current.freeAgentsDropdownOpened).toBe(true);

        act(() => {
            result.current.closePlayersDropdown();
            result.current.closeTeamsDropdown();
            result.current.closeFreeAgentsDropdown();
        });
        expect(result.current.playersDropdownOpened).toBe(false);
        expect(result.current.teamsDropdownOpened).toBe(false);
        expect(result.current.freeAgentsDropdownOpened).toBe(false);
    });

    it('owns free-agent action selection and dismissal', () => {
        const agent = buildUser({ $id: 'free-agent-one' });
        const { result } = renderHook(() => useEventDetailPresentationController());

        act(() => result.current.openFreeAgentActions(agent));
        expect(result.current.selectedFreeAgentActionUser).toBe(agent);

        act(() => result.current.closeFreeAgentActions());
        expect(result.current.selectedFreeAgentActionUser).toBeNull();
    });

    it('toggles capacity, team, and mobile presentation independently', () => {
        const { result } = renderHook(() => useEventDetailPresentationController());

        act(() => {
            result.current.toggleCapacityBreakdown();
            result.current.toggleTeamJoinOptions();
            result.current.toggleMobileJoin();
        });
        expect(result.current.capacityBreakdownOpened).toBe(true);
        expect(result.current.teamJoinOptionsOpened).toBe(true);
        expect(result.current.mobileJoinExpanded).toBe(true);

        act(() => result.current.toggleCapacityBreakdown());
        expect(result.current.capacityBreakdownOpened).toBe(false);
        expect(result.current.teamJoinOptionsOpened).toBe(true);
        expect(result.current.mobileJoinExpanded).toBe(true);
    });

    it('owns the QR modal lifecycle', () => {
        const { result } = renderHook(() => useEventDetailPresentationController());

        act(() => result.current.openQrCode());
        expect(result.current.qrCodeOpened).toBe(true);

        act(() => result.current.closeQrCode());
        expect(result.current.qrCodeOpened).toBe(false);
    });
});
