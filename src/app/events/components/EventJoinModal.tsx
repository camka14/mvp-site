import React, { useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Division {
    id: string;
    name: string;
    skillLevel: string;
    currentParticipants: number;
    maxParticipants: number;
}

interface EventJoinModalProps {
    isOpen: boolean;
    onClose: () => void;
    onJoin: (divisionId: string) => void;
    availableDivisions: Division[];
    currentUser?: any;
}

const EventJoinModal: React.FC<EventJoinModalProps> = ({
    isOpen,
    onClose,
    onJoin,
    availableDivisions,
    currentUser,
}) => {
    const [selectedDivision, setSelectedDivision] = useState<string>('');
    const [isJoining, setIsJoining] = useState(false);

    const handleJoin = async () => {
        if (!selectedDivision) return;

        setIsJoining(true);
        try {
            await onJoin(selectedDivision);
            onClose();
        } catch (error) {
            console.error('Failed to join event:', error);
        } finally {
            setIsJoining(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Join Event</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-xl"
                    >
                        ×
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Select Division</Label>
                        <Select
                            value={selectedDivision}
                            onValueChange={setSelectedDivision}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Choose your division" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableDivisions.map(division => (
                                    <SelectItem
                                        key={division.id}
                                        value={division.id}
                                        disabled={division.currentParticipants >= division.maxParticipants}
                                    >
                                        <div className="flex flex-col">
                                            <span>{division.name}</span>
                                            <span className="text-sm text-gray-500">
                                                {division.currentParticipants}/{division.maxParticipants} participants
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedDivision && (
                        <div className="p-3 bg-blue-50 rounded-md">
                            <p className="text-sm text-blue-800">
                                You're joining the{' '}
                                {availableDivisions.find(d => d.id === selectedDivision)?.name} division
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleJoin}
                        disabled={!selectedDivision || isJoining}
                    >
                        {isJoining ? 'Joining...' : 'Join Event'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default EventJoinModal;
