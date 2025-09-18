'use client';

import React, { useState, useEffect } from 'react';
import { userService } from '@/lib/userService';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';
import { Modal, TextInput, Button, Group, Paper, Avatar, Text, Alert, ScrollArea } from '@mantine/core';

interface User {
    $id: string;
    firstName: string;
    lastName: string;
    userName: string;
    profileImageId?: string;
}

export function InviteUsersModal() {
    const { isInviteModalOpen, setInviteModalOpen } = useChatUI();
    const { createChatGroup } = useChat();

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);

    // Search users with debounce
    useEffect(() => {
        if (searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }

        const searchUsers = async () => {
            setSearching(true);
            try {
                const results = await userService.searchUsers(searchQuery);
                const filteredResults = results.filter(user =>
                    !selectedUsers.some(selected => selected.$id === user.$id)
                );
                setSearchResults(filteredResults);
            } catch (error) {
                console.error('Failed to search users:', error);
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        };

        const timeoutId = setTimeout(searchUsers, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery, selectedUsers]);

    const handleAddUser = (user: User) => {
        setSelectedUsers(prev => [...prev, user]);
        setSearchResults(prev => prev.filter(u => u.$id !== user.$id));
    };

    const handleRemoveUser = (userId: string) => {
        setSelectedUsers(prev => prev.filter(u => u.$id !== userId));
    };

    const handleClose = () => {
        setInviteModalOpen(false);
        setSelectedUsers([]);
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleSubmit = async () => {
        if (selectedUsers.length === 0) return;

        setLoading(true);
        try {
            const defaultName = selectedUsers.length === 1
                ? `Chat with ${selectedUsers[0].firstName} ${selectedUsers[0].lastName}`
                : `Group Chat`;

            const userIds = selectedUsers.map(u => u.$id);
            await createChatGroup(defaultName, userIds);
            handleClose();
        } catch (error) {
            console.error('Failed to create chat:', error);
        } finally {
            setLoading(false);
        }
    };

    const getUserAvatar = (user: User) => {
        if (user.profileImageId) return user.profileImageId;

        const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
        return `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <rect width="40" height="40" fill="#3B82F6"/>
        <text x="20" y="26" font-family="Arial" font-size="16" fill="white" text-anchor="middle">${initials}</text>
      </svg>`
        )}`;
    };

    if (!isInviteModalOpen) return null;

    return (
        <Modal opened={isInviteModalOpen} onClose={handleClose} title={<div><Text fw={600}>Create New Chat</Text><Text size="sm" c="dimmed">Search and select users to start a conversation</Text></div>} size="md" centered>
            <div className="flex flex-col">
                {/* Search Section */}
                    <div className="pb-4 pt-4" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                        <TextInput value={searchQuery} onChange={(e) => setSearchQuery(e.currentTarget.value)} placeholder="Search by name or username..." autoFocus />
                        {searchQuery.length > 0 && searchQuery.length < 2 && (
                            <Text size="sm" c="dimmed" mt={6}>Type at least 2 characters to search for users</Text>
                        )}
                    </div>

                    {/* Selected Users */}
                    {selectedUsers.length > 0 && (
                        <div className="py-4" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                            <Text size="sm" fw={600} mb={8}>Selected Users ({selectedUsers.length})</Text>
                            <ScrollArea.Autosize mah={120}>
                                <div className="space-y-2">
                                    {selectedUsers.map((user) => (
                                        <Paper key={user.$id} withBorder p="sm" radius="md" bg={'blue.0'}>
                                            <Group justify="space-between">
                                                <Group>
                                                    <Avatar src={getUserAvatar(user)} alt={`${user.firstName} ${user.lastName}`} size={32} radius="xl" />
                                                    <div>
                                                        <Text fw={500} size="sm">{user.firstName} {user.lastName}</Text>
                                                        <Text size="xs" c="dimmed">@{user.userName}</Text>
                                                    </div>
                                                </Group>
                                                <Button size="xs" variant="subtle" onClick={() => handleRemoveUser(user.$id)}>Remove</Button>
                                            </Group>
                                        </Paper>
                                    ))}
                                </div>
                            </ScrollArea.Autosize>
                        </div>
                    )}

                    {/* Search Results */}
                    <div className="flex-1 py-4" style={{ maxHeight: 360 }}>
                        {searching && (
                            <Group justify="center" py="sm">
                                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <Text c="dimmed" size="sm">Searching...</Text>
                            </Group>
                        )}

                        {searchResults.length > 0 && (
                            <ScrollArea.Autosize mah={320} type="auto">
                                <div className="p-2 space-y-2">
                                    {searchResults.map((user) => (
                                        <Paper key={user.$id} withBorder p="sm" radius="md" onClick={() => handleAddUser(user)} style={{ cursor: 'pointer' }}>
                                            <Group>
                                                <Avatar src={getUserAvatar(user)} alt={`${user.firstName} ${user.lastName}`} radius="xl" />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <Text fw={500} truncate>{user.firstName} {user.lastName}</Text>
                                                    <Text size="sm" c="dimmed" truncate>@{user.userName}</Text>
                                                </div>
                                                <Text c="blue" fw={700}>+</Text>
                                            </Group>
                                        </Paper>
                                    ))}
                                </div>
                            </ScrollArea.Autosize>
                        )}

                        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                            <Paper withBorder p="md" radius="md" ta="center"><Text c="dimmed" size="sm">No users found matching "{searchQuery}"</Text></Paper>
                        )}
                    </div>

                {/* Footer */}
                <Group justify="end" pt="sm" gap="sm">
                    <Button variant="default" onClick={handleClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={selectedUsers.length === 0 || loading}>
                        {loading ? 'Creating...' : `Create Chat ${selectedUsers.length > 0 ? `(${selectedUsers.length})` : ''}`}
                    </Button>
                </Group>
            </div>
        </Modal>
    );
}
