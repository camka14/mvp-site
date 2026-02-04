import React, { useState } from 'react';
import { Modal, Select, Button, Group, Paper, Text } from '@mantine/core';

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

    const data = availableDivisions.map((d) => ({
        value: d.id,
        label: `${d.name} (${d.currentParticipants}/${d.maxParticipants})`,
        disabled: d.currentParticipants >= d.maxParticipants,
    }));

    return (
        <Modal opened={isOpen} onClose={onClose} title="Join Event" centered>
            <Select
                label="Select Division"
                placeholder="Choose your division"
                value={selectedDivision}
                onChange={(value) => setSelectedDivision(value || '')}
                data={data}
                searchable={false}
                clearable={false}
            />

            {selectedDivision && (
                <Paper p="sm" mt="md" radius="sm" withBorder>
                    <Text size="sm">
                        {"You're joining the "}
                        {availableDivisions.find((d) => d.id === selectedDivision)?.name} division
                    </Text>
                </Paper>
            )}

            <Group justify="flex-end" mt="lg">
                <Button variant="default" onClick={onClose} type="button">
                    Cancel
                </Button>
                <Button onClick={handleJoin} disabled={!selectedDivision || isJoining}>
                    {isJoining ? 'Joining...' : 'Join Event'}
                </Button>
            </Group>
        </Modal>
    );
};

export default EventJoinModal;
