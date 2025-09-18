'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Button, Group, TextInput, Select as MantineSelect, NumberInput } from '@mantine/core';
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

  // No longer used: ImageUploader already returns fileId and url separately
  // const extractFileIdFromUrl = (url: string): string => {
  //   try {
  //     const match = url.match(/\/files\/([^/]+)\/preview/);
  //     return match ? match[1] : '';
  //   } catch {
  //     return '';
  //   }
  // };

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
    <Modal opened={isOpen} onClose={onClose} title="Create New Team" size="md" centered>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <TextInput
            label="Team Name"
            placeholder="Enter team name"
            value={form.name}
            onChange={(e) => setForm(prev => ({
              ...prev,
              // Guard against rare null target/currentTarget to avoid runtime error
              name: (e?.currentTarget?.value ?? (e as any)?.target?.value ?? '')
            }))}
            required
            maxLength={50}
          />
        </div>

        <div>
          <MantineSelect
            label="Sport"
            data={Object.keys(sportPlayerCounts)}
            value={form.sport}
            onChange={(value) => setForm(prev => ({ ...prev, sport: value || prev.sport }))}
          />
        </div>

        <div>
          <MantineSelect
            label="Division"
            data={['Open', 'Recreational', 'Competitive', 'Elite']}
            value={form.division}
            onChange={(value) => setForm(prev => ({ ...prev, division: value || prev.division }))}
          />
        </div>

        <div>
          <NumberInput
            label={`Maximum Players (default for ${form.sport}: ${sportPlayerCounts[form.sport]})`}
            min={2}
            max={50}
            value={form.playerCount}
            onChange={(val) => setForm(prev => ({ ...prev, playerCount: Number(val) || 2 }))}
          />
          <Button variant="subtle" mt="xs" onClick={() => setForm(prev => ({ ...prev, playerCount: sportPlayerCounts[prev.sport] || 8 }))}>
            Use Default
          </Button>
        </div>

        <div>
          <label className="form-label">Team Logo (Optional)</label>
          <ImageUploader
            currentImageUrl={selectedTeamImageUrl}
            bucketId={process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID as string}
            className="w-full"
            placeholder="Select team logo"
            onChange={(fileId, url) => {
              setSelectedTeamImageUrl(url);
              setForm(prev => ({ ...prev, profileImageId: fileId }));
            }}
          />
        </div>

        <Group justify="space-between" pt="sm">
          <Button variant="default" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button type="submit" disabled={creating || !form.name.trim()}>{creating ? 'Creating…' : 'Create Team'}</Button>
        </Group>
      </form>
    </Modal>
  );
}
