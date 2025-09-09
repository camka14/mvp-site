'use client';

import React, { useEffect, useState } from 'react';
import ModalShell from './ModalShell';
import { Team, UserData } from '@/types';
import { teamService } from '@/lib/teamService';
import { ImageUploader } from './ImageUploader';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserData;
  onTeamCreated?: (team: Team) => void;
}

export default function CreateTeamModal({ isOpen, onClose, currentUser, onTeamCreated }: CreateTeamModalProps) {
  const [creating, setCreating] = useState(false);
  const [selectedTeamImageUrl, setSelectedTeamImageUrl] = useState('');
  const [form, setForm] = useState({
    name: '',
    division: 'Open',
    sport: 'Volleyball',
    playerCount: 6,
    profileImageId: ''
  });

  const sportPlayerCounts: Record<string, number> = {
    Volleyball: 6,
    Basketball: 5,
    Soccer: 11,
    Football: 11,
    Hockey: 11,
    Baseball: 9,
    Tennis: 2,
    Pickleball: 4,
    Swimming: 8,
    Other: 8
  };

  useEffect(() => {
    setForm(prev => ({ ...prev, playerCount: sportPlayerCounts[prev.sport] || 8 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sport]);

  const extractFileIdFromUrl = (url: string): string => {
    try {
      const match = url.match(/\/files\/([^/]+)\/preview/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const newTeam = await teamService.createTeam(
        form.name.trim(),
        currentUser.$id,
        form.division,
        form.sport,
        form.playerCount,
        form.profileImageId || undefined
      );
      if (newTeam) {
        onTeamCreated?.(newTeam);
        // reset
        setForm({ name: '', division: 'Open', sport: 'Volleyball', playerCount: 6, profileImageId: '' });
        setSelectedTeamImageUrl('');
        onClose();
      }
    } catch (err) {
      console.error('Failed to create team:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Create New Team" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="form-label">Team Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="form-input"
            placeholder="Enter team name"
            required
            maxLength={50}
          />
          <p className="text-xs text-gray-500 mt-1">Choose a unique name (max 50 chars)</p>
        </div>

        <div>
          <label className="form-label">Sport</label>
          <select
            value={form.sport}
            onChange={(e) => setForm(prev => ({ ...prev, sport: e.target.value }))}
            className="form-input"
          >
            {Object.keys(sportPlayerCounts).map((sport) => (
              <option key={sport} value={sport}>{sport}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Select the sport your team will play</p>
        </div>

        <div>
          <label className="form-label">Division</label>
          <select
            value={form.division}
            onChange={(e) => setForm(prev => ({ ...prev, division: e.target.value }))}
            className="form-input"
          >
            {['Open', 'Recreational', 'Competitive', 'Elite'].map((division) => (
              <option key={division} value={division}>{division}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label">Maximum Players</label>
          <div className="flex items-center space-x-3">
            <input
              type="number"
              min={2}
              max={50}
              value={form.playerCount}
              onChange={(e) => setForm(prev => ({ ...prev, playerCount: parseInt(e.target.value) || 2 }))}
              className="form-input flex-1"
              required
            />
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, playerCount: sportPlayerCounts[prev.sport] || 8 }))}
              className="btn-ghost text-sm py-2 px-3 whitespace-nowrap"
            >
              Use Default ({sportPlayerCounts[form.sport]})
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Typical size for {form.sport}: {sportPlayerCounts[form.sport]}</p>
        </div>

        <div>
          <label className="form-label">Team Logo (Optional)</label>
          <ImageUploader
            currentImageUrl={selectedTeamImageUrl}
            currentUser={currentUser}
            bucketId={process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID as string}
            className="w-full"
            placeholder="Select team logo"
            onChange={(url) => {
              setSelectedTeamImageUrl(url);
              const fileId = extractFileIdFromUrl(url);
              setForm(prev => ({ ...prev, profileImageId: fileId }));
            }}
          />
          <p className="text-xs text-gray-500 mt-1">Upload or select a logo; otherwise initials are used</p>
        </div>

        <div className="flex space-x-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={creating}>Cancel</button>
          <button type="submit" className="btn-primary flex-1" disabled={creating || !form.name.trim()}>
            {creating ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

