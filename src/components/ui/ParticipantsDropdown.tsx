import React from 'react';
import { Modal, Loader, Text, ScrollArea } from '@mantine/core';

interface ParticipantsDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    participants: any[];
    isLoading: boolean;
    renderParticipant: (participant: any) => React.ReactNode;
    emptyMessage: string;
}

export default function ParticipantsDropdown({
    isOpen,
    onClose,
    title,
    participants,
    isLoading,
    renderParticipant,
    emptyMessage
}: ParticipantsDropdownProps) {
    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={title}
            size="md"
            centered
            zIndex={2000}
            overlayProps={{ zIndex: 1999 }}
        >
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed" ml={8}>Loading participants…</Text>
                </div>
            ) : participants.length > 0 ? (
                <ScrollArea.Autosize mah={400} type="auto" offsetScrollbars>
                    <div className="p-2">
                        {participants.map((participant) => (
                            <div key={participant.$id}>
                                {renderParticipant(participant)}
                            </div>
                        ))}
                    </div>
                </ScrollArea.Autosize>
            ) : (
                <div className="text-center py-8">
                    <Text c="dimmed">{emptyMessage}</Text>
                </div>
            )}
        </Modal>
    );
}
