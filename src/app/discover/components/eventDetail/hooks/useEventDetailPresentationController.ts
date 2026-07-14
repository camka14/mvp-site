import { useCallback, useState } from 'react';

import type { UserData } from '@/types';

export function useEventDetailPresentationController() {
    const [playersDropdownOpened, setPlayersDropdownOpened] = useState(false);
    const [teamsDropdownOpened, setTeamsDropdownOpened] = useState(false);
    const [freeAgentsDropdownOpened, setFreeAgentsDropdownOpened] = useState(false);
    const [capacityBreakdownOpened, setCapacityBreakdownOpened] = useState(false);
    const [selectedFreeAgentActionUser, setSelectedFreeAgentActionUser] = useState<UserData | null>(null);
    const [qrCodeOpened, setQrCodeOpened] = useState(false);
    const [teamJoinOptionsOpened, setTeamJoinOptionsOpened] = useState(false);
    const [mobileJoinExpanded, setMobileJoinExpanded] = useState(false);

    const openPlayersDropdown = useCallback(() => setPlayersDropdownOpened(true), []);
    const closePlayersDropdown = useCallback(() => setPlayersDropdownOpened(false), []);
    const openTeamsDropdown = useCallback(() => setTeamsDropdownOpened(true), []);
    const closeTeamsDropdown = useCallback(() => setTeamsDropdownOpened(false), []);
    const openFreeAgentsDropdown = useCallback(() => setFreeAgentsDropdownOpened(true), []);
    const closeFreeAgentsDropdown = useCallback(() => setFreeAgentsDropdownOpened(false), []);
    const toggleCapacityBreakdown = useCallback(() => {
        setCapacityBreakdownOpened((opened) => !opened);
    }, []);
    const openFreeAgentActions = useCallback((agent: UserData) => {
        setSelectedFreeAgentActionUser(agent);
    }, []);
    const closeFreeAgentActions = useCallback(() => {
        setSelectedFreeAgentActionUser(null);
    }, []);
    const openQrCode = useCallback(() => setQrCodeOpened(true), []);
    const closeQrCode = useCallback(() => setQrCodeOpened(false), []);
    const toggleTeamJoinOptions = useCallback(() => {
        setTeamJoinOptionsOpened((opened) => !opened);
    }, []);
    const toggleMobileJoin = useCallback(() => {
        setMobileJoinExpanded((expanded) => !expanded);
    }, []);

    return {
        playersDropdownOpened,
        teamsDropdownOpened,
        freeAgentsDropdownOpened,
        capacityBreakdownOpened,
        selectedFreeAgentActionUser,
        qrCodeOpened,
        teamJoinOptionsOpened,
        mobileJoinExpanded,
        setCapacityBreakdownOpened,
        openPlayersDropdown,
        closePlayersDropdown,
        openTeamsDropdown,
        closeTeamsDropdown,
        openFreeAgentsDropdown,
        closeFreeAgentsDropdown,
        toggleCapacityBreakdown,
        openFreeAgentActions,
        closeFreeAgentActions,
        openQrCode,
        closeQrCode,
        toggleTeamJoinOptions,
        toggleMobileJoin,
    };
}
