'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Sport } from '@/types';
import { sportsService } from '@/lib/sportsService';

export const useSports = () => {
  const initialSports = useMemo(() => sportsService.getCached({ allowStale: true }) ?? [], []);
  const [sports, setSports] = useState<Sport[]>(initialSports);
  const [loading, setLoading] = useState<boolean>(initialSports.length === 0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        if (!initialSports.length) {
          setLoading(true);
        }
        const data = await sportsService.getAll();
        if (!active) return;
        setSports(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err : new Error('Failed to load sports'));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const sportsById = useMemo(() => {
    const map = new Map<string, Sport>();
    sports.forEach((sport) => {
      if (sport.$id) {
        map.set(sport.$id, sport);
      }
    });
    return map;
  }, [sports]);

  const sportsByName = useMemo(() => {
    const map = new Map<string, Sport>();
    sports.forEach((sport) => {
      map.set(sport.name.toLowerCase(), sport);
    });
    return map;
  }, [sports]);

  return {
    sports,
    sportsById,
    sportsByName,
    loading,
    error,
  };
};
