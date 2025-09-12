import React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TournamentData {
    doubleElimination: boolean;
    winnerSetCount: number;
    loserSetCount: number;
    winnerBracketPointsToVictory: number[];
    loserBracketPointsToVictory: number[];
    prize: string;
    fieldCount: number;
}

interface TournamentFieldsProps {
    tournamentData: TournamentData;
    setTournamentData: React.Dispatch<React.SetStateAction<TournamentData>>;
}

const TournamentFields: React.FC<TournamentFieldsProps> = ({
    tournamentData,
    setTournamentData,
}) => {
    return (
        <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Tournament Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tournament Format */}
                <div className="space-y-2">
                    <Label>Tournament Format</Label>
                    <Select
                        value={tournamentData.doubleElimination ? 'double' : 'single'}
                        onValueChange={(value) =>
                            setTournamentData(prev => ({
                                ...prev,
                                doubleElimination: value === 'double'
                            }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="single">Single Elimination</SelectItem>
                            <SelectItem value="double">Double Elimination</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Winner Set Count */}
                <div className="space-y-2">
                    <Label>Winner Set Count</Label>
                    <Select
                        value={tournamentData.winnerSetCount.toString()}
                        onValueChange={(value) =>
                            setTournamentData(prev => ({
                                ...prev,
                                winnerSetCount: parseInt(value)
                            }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">Best of 1</SelectItem>
                            <SelectItem value="3">Best of 3</SelectItem>
                            <SelectItem value="5">Best of 5</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Loser Set Count (only for double elimination) */}
                {tournamentData.doubleElimination && (
                    <div className="space-y-2">
                        <Label>Loser Set Count</Label>
                        <Select
                            value={tournamentData.loserSetCount.toString()}
                            onValueChange={(value) =>
                                setTournamentData(prev => ({
                                    ...prev,
                                    loserSetCount: parseInt(value)
                                }))
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">Best of 1</SelectItem>
                                <SelectItem value="3">Best of 3</SelectItem>
                                <SelectItem value="5">Best of 5</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Field Count */}
                <div className="space-y-2">
                    <Label>Field Count</Label>
                    <Select
                        value={tournamentData.fieldCount.toString()}
                        onValueChange={(value) =>
                            setTournamentData(prev => ({
                                ...prev,
                                fieldCount: parseInt(value)
                            }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(count => (
                                <SelectItem key={count} value={count.toString()}>
                                    {count} {count === 1 ? 'Field' : 'Fields'}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Points to Victory */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                    <Label htmlFor="winnerPoints">Winner Bracket Points to Victory</Label>
                    <Input
                        id="winnerPoints"
                        type="number"
                        min="1"
                        value={tournamentData.winnerBracketPointsToVictory[0] || 21}
                        onChange={(e) =>
                            setTournamentData(prev => ({
                                ...prev,
                                winnerBracketPointsToVictory: [parseInt(e.target.value) || 21]
                            }))
                        }
                    />
                </div>

                {tournamentData.doubleElimination && (
                    <div className="space-y-2">
                        <Label htmlFor="loserPoints">Loser Bracket Points to Victory</Label>
                        <Input
                            id="loserPoints"
                            type="number"
                            min="1"
                            value={tournamentData.loserBracketPointsToVictory[0] || 21}
                            onChange={(e) =>
                                setTournamentData(prev => ({
                                    ...prev,
                                    loserBracketPointsToVictory: [parseInt(e.target.value) || 21]
                                }))
                            }
                        />
                    </div>
                )}
            </div>

            {/* Prize */}
            <div className="mt-4 space-y-2">
                <Label htmlFor="prize">Prize (Optional)</Label>
                <Input
                    id="prize"
                    type="text"
                    value={tournamentData.prize}
                    onChange={(e) =>
                        setTournamentData(prev => ({
                            ...prev,
                            prize: e.target.value
                        }))
                    }
                    placeholder="Enter tournament prize"
                />
            </div>
        </div>
    );
};

export default TournamentFields;
