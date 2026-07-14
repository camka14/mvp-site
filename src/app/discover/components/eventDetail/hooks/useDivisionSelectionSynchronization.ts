import { useEffect, type Dispatch, type SetStateAction } from 'react';

type DivisionSelectionOption = {
    id: string;
    divisionTypeKey: string;
};

type UseDivisionSelectionSynchronizationInput = {
    options: readonly DivisionSelectionOption[];
    setSelectedDivisionId: Dispatch<SetStateAction<string>>;
    setSelectedDivisionTypeKey: Dispatch<SetStateAction<string>>;
};

export function useDivisionSelectionSynchronization({
    options,
    setSelectedDivisionId,
    setSelectedDivisionTypeKey,
}: UseDivisionSelectionSynchronizationInput) {
    useEffect(() => {
        if (!options.length) {
            setSelectedDivisionId('');
            setSelectedDivisionTypeKey('');
            return;
        }

        setSelectedDivisionId((previous) => (
            previous && options.some((option) => option.id === previous)
                ? previous
                : options[0].id
        ));
        setSelectedDivisionTypeKey((previous) => (
            previous && options.some((option) => option.divisionTypeKey === previous)
                ? previous
                : options[0].divisionTypeKey
        ));
    }, [options, setSelectedDivisionId, setSelectedDivisionTypeKey]);
}
