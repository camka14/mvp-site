
import React from 'react';

interface TournamentFieldsProps {
    tournamentData: {
        doubleElimination: boolean;
        winnerSetCount: number;
        loserSetCount: number;
        winnerBracketPointsToVictory: number[];
        loserBracketPointsToVictory: number[];
        prize: string;
        fieldCount: number;
    };
    onChange: (data: any) => void;
}

const TournamentFields: React.FC<TournamentFieldsProps> = ({
    tournamentData,
    onChange
}) => {
    const updateTournamentData = (field: string, value: any) => {
        onChange((prev: any) => ({ ...prev, [field]: value }));
    };

    const updatePointsArray = (type: 'winner' | 'loser', index: number, value: number) => {
        const field = type === 'winner' ? 'winnerBracketPointsToVictory' : 'loserBracketPointsToVictory';
        const currentArray = tournamentData[field];
        const newArray = [...currentArray];
        newArray[index] = value;
        updateTournamentData(field, newArray);
    };

    const updateSetCount = (type: 'winner' | 'loser', count: number) => {
        const field = type === 'winner' ? 'winnerSetCount' : 'loserSetCount';
        const pointsField = type === 'winner' ? 'winnerBracketPointsToVictory' : 'loserBracketPointsToVictory';

        updateTournamentData(field, count);
        updateTournamentData(pointsField, Array(count).fill(21));
    };

    return (
        <div className="space-y-6 p-4 border border-gray-200 rounded-md bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900">Tournament Settings</h3>

            {/* Prize */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prize (Optional)
                </label>
                <input
                    type="text"
                    value={tournamentData.prize}
                    onChange={(e) => updateTournamentData('prize', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md"
                    placeholder="e.g., $500 cash prize"
                />
            </div>

            {/* Field Count */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Fields *
                </label>
                <input
                    type="number"
                    min="1"
                    value={tournamentData.fieldCount}
                    onChange={(e) => updateTournamentData('fieldCount', parseInt(e.target.value) || 1)}
                    className="w-full p-3 border border-gray-300 rounded-md"
                />
            </div>

            {/* Elimination Type */}
            <div className="flex items-center">
                <input
                    type="checkbox"
                    id="doubleElimination"
                    checked={tournamentData.doubleElimination}
                    onChange={(e) => updateTournamentData('doubleElimination', e.target.checked)}
                    className="mr-2"
                />
                <label htmlFor="doubleElimination" className="text-sm font-medium text-gray-700">
                    Double Elimination
                </label>
            </div>

            {/* Winner Bracket Settings */}
            <div>
                <h4 className="text-md font-medium text-gray-800 mb-3">Winner Bracket</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Sets to Win
                        </label>
                        <select
                            value={tournamentData.winnerSetCount}
                            onChange={(e) => updateSetCount('winner', parseInt(e.target.value))}
                            className="w-full p-3 border border-gray-300 rounded-md"
                        >
                            {[1, 2, 3, 4, 5].map(count => (
                                <option key={count} value={count}>{count}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                    {Array(tournamentData.winnerSetCount).fill(0).map((_, index) => (
                        <div key={index}>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Set {index + 1} Points
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={tournamentData.winnerBracketPointsToVictory[index] || 21}
                                onChange={(e) => updatePointsArray('winner', index, parseInt(e.target.value) || 21)}
                                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Loser Bracket Settings (if double elimination) */}
            {tournamentData.doubleElimination && (
                <div>
                    <h4 className="text-md font-medium text-gray-800 mb-3">Loser Bracket</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Sets to Win
                            </label>
                            <select
                                value={tournamentData.loserSetCount}
                                onChange={(e) => updateSetCount('loser', parseInt(e.target.value))}
                                className="w-full p-3 border border-gray-300 rounded-md"
                            >
                                {[1, 2, 3, 4, 5].map(count => (
                                    <option key={count} value={count}>{count}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                        {Array(tournamentData.loserSetCount).fill(0).map((_, index) => (
                            <div key={index}>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Set {index + 1} Points
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={tournamentData.loserBracketPointsToVictory[index] || 21}
                                    onChange={(e) => updatePointsArray('loser', index, parseInt(e.target.value) || 21)}
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TournamentFields;
