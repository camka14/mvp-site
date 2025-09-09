'use client';

import React, { useState } from 'react';
import ModalShell from './ModalShell';
import { Team, UserData } from '@/types';
import UserCard from './UserCard';
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
      const success = await teamService.invitePlayerToTeam(team.$id, playerId);
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
    <ModalShell isOpen={isOpen} onClose={onClose} title={`Invite Players to ${team?.name ?? 'Team'}`} maxWidth="lg">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">{error}</div>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchUsers(e.target.value)}
          className="form-input"
          placeholder="Search players by name or username..."
        />
      </div>

      <div className="max-h-64 overflow-y-auto">
        {searchQuery.length < 2 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Type at least 2 characters to search for players</p>
          </div>
        ) : searchResults.length > 0 ? (
          <div className="space-y-2">
            {searchResults.map((searchUser) => (
              <div key={searchUser.$id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                <UserCard user={searchUser} className="!p-0 !shadow-none flex-1" />
                <button
                  onClick={() => handleInvitePlayer(searchUser.$id)}
                  disabled={inviting === searchUser.$id}
                  className="btn-primary text-sm py-2 px-4 ml-3"
                >
                  {inviting === searchUser.$id ? 'Inviting...' : 'Invite'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No players found matching "{searchQuery}"</p>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

