import React from 'react';
import { Paper, Group, Text, Avatar, Loader, Transition } from '@mantine/core';

interface ParticipantsPreviewProps {
    title: string;
    participants: any[];
    totalCount: number;
    isLoading: boolean;
    onClick: () => void;
    getAvatarUrl: (participant: any) => string;
    emptyMessage: string;
}

export default function ParticipantsPreview({
    title,
    participants,
    totalCount,
    isLoading,
    onClick,
    getAvatarUrl,
    emptyMessage
}: ParticipantsPreviewProps) {
    if (totalCount === 0 && !isLoading) {
        return (
            <Paper withBorder p="md" radius="md">
                <Text c="dimmed" ta="center" size="sm">{emptyMessage}</Text>
            </Paper>
        );
    }

    return (
        <Paper withBorder p="md" radius="md" onClick={onClick} style={{ cursor: 'pointer' }}>
            <Group justify="space-between" mb={8}>
                <Text fw={600}>{title}</Text>
                <Text size="sm" c="dimmed">
                    {totalCount} {totalCount === 1 ? title.slice(0, -1).toLowerCase() : title.toLowerCase()}
                </Text>
            </Group>

            {isLoading ? (
                <Group gap="xs">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">Loading…</Text>
                </Group>
            ) : (
                <Transition mounted={!isLoading} transition="slide-right" duration={180} timingFunction="ease-out">
                    {(styles) => (
                        <Group style={styles}>
                            <Group gap={-8} mr="sm">
                                {participants.slice(0, 3).map((p: any, index: number) => (
                                    <Avatar key={p.$id} src={getAvatarUrl(p)} radius="xl" size={32} style={{ zIndex: 3 - index }} />
                                ))}
                                {totalCount > 3 && (
                                    <Avatar radius="xl" size={32} color="gray">+{totalCount - 3}</Avatar>
                                )}
                            </Group>
                            <Text size="sm" c="blue">View all →</Text>
                        </Group>
                    )}
                </Transition>
            )}
        </Paper>
    );
}
