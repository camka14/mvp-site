'use client';

import React, { useState } from 'react';
import { Modal, TextInput, Button, Paper, Group, Alert } from '@mantine/core';
import { Team, UserData } from '@/types';
import UserCard from '@/components/ui/UserCard';
import { userService } from '@/lib/userService';
import { teamService } from '@/lib/teamService';

interface InvitePlayersModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team;
  onInvitesSent?: () => void;
}

export default function InvitePlayersModal({ isOpen, onClose, team, onInvitesSent }: InvitePlayersModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserData[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await userService.searchUsers(query);
      const filteredResults = results.filter(searchUser =>
        !team.playerIds.includes(searchUser.$id) &&
        !team.pending.includes(searchUser.$id)
      );
      setSearchResults(filteredResults);
    } catch (err) {
      console.error('Failed to search users:', err);
      setError('Failed to search users');
    }
  };

  const handleInvitePlayer = async (playerId: string) => {
    if (inviting) return;
    setInviting(playerId);
    try {
      const player = searchResults.find(u => u.$id === playerId) || await userService.getUserById(playerId);
      if (!player) {
        throw new Error('Player not found');
      }

      const success = await teamService.invitePlayerToTeam(team, player);
      if (success) {
        setSearchResults(prev => prev.filter(u => u.$id !== playerId));
        onInvitesSent?.();
        onClose();
      }
    } catch (err) {
      console.error('Failed to invite player:', err);
      setError('Failed to invite player');
    } finally {
      setInviting(null);
    }
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title={`Invite Players to ${team?.name ?? 'Team'}`} size="lg" centered>
      {error && (<Alert color="red" variant="light" mb="sm">{error}</Alert>)}
      <TextInput
        value={searchQuery}
        onChange={(e) => handleSearchUsers(e.currentTarget.value)}
        placeholder="Search players by name or username..."
        mb="sm"
        autoFocus
      />
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {searchQuery.length < 2 ? (
          <Paper withBorder p="md" radius="md"><span>Type at least 2 characters to search for players</span></Paper>
        ) : searchResults.length > 0 ? (
          <div className="space-y-2">
            {searchResults.map((searchUser) => (
              <Paper key={searchUser.$id} withBorder p="sm" radius="md">
                <Group justify="space-between" align="center">
                  <UserCard user={searchUser} className="!p-0 !shadow-none flex-1" />
                  <Button onClick={() => handleInvitePlayer(searchUser.$id)} disabled={inviting === searchUser.$id}>
                    {inviting === searchUser.$id ? 'Inviting...' : 'Invite'}
                  </Button>
                </Group>
              </Paper>
            ))}
          </div>
        ) : (
          <Paper withBorder p="md" radius="md">
            <span>{`No players found matching "${searchQuery}"`}</span>
          </Paper>
        )}
      </div>
    </Modal>
  );
}
