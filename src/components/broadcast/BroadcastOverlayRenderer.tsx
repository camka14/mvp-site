'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type {
  BroadcastOverlayConfigV1,
  BroadcastOverlayRealtimeEvent,
  MatchPresentationStateV1,
} from '@/server/broadcast/types';
import styles from './broadcastOverlay.module.css';

export type BroadcastOverlayRendererProps = {
  config: BroadcastOverlayConfigV1;
  state: MatchPresentationStateV1;
  event?: BroadcastOverlayRealtimeEvent | null;
  preview?: boolean;
};

const anchorStyle = (config: BroadcastOverlayConfigV1): React.CSSProperties => {
  const anchor = config.transform.anchor;
  const vertical = anchor.startsWith('TOP') ? 'top' : anchor.startsWith('BOTTOM') ? 'bottom' : 'top';
  const horizontal = anchor.endsWith('LEFT') ? 'left' : anchor.endsWith('RIGHT') ? 'right' : 'left';
  const transformBase = anchor.includes('CENTER') && !anchor.startsWith('CENTER')
    ? 'translateX(-50%)'
    : anchor.startsWith('CENTER') && anchor.endsWith('CENTER')
      ? 'translate(-50%, -50%)'
      : anchor.startsWith('CENTER')
        ? 'translateY(-50%)'
        : '';
  const isVerticalCenter = anchor.startsWith('CENTER');
  const isHorizontalCenter = anchor.endsWith('CENTER');
  const safe = config.transform.safeArea * 100;
  const x = config.transform.x * 100;
  const y = config.transform.y * 100;
  const style: React.CSSProperties = {
    transform: `${transformBase} scale(${config.transform.scale})`.trim(),
    transformOrigin: anchor.replace('_', ' ').toLowerCase(),
    maxWidth: `min(${config.transform.maxWidth}px, calc(100vw - ${safe * 2}vw))`,
  };
  if (vertical === 'top') style.top = isVerticalCenter ? `calc(50% + ${y}%)` : `calc(${safe}% + ${y}%)`;
  if (vertical === 'bottom') style.bottom = `calc(${safe}% - ${y}%)`;
  if (horizontal === 'left') style.left = isHorizontalCenter ? `calc(50% + ${x}%)` : `calc(${safe}% + ${x}%)`;
  if (horizontal === 'right') style.right = `calc(${safe}% - ${x}%)`;
  return style;
};

const formatClock = (state: MatchPresentationStateV1, now: number): string | null => {
  if (state.clock.mode === 'STOPPED' && state.clock.elapsedBeforePauseMs === 0) return null;
  const startedAt = state.clock.startedAt ? new Date(state.clock.startedAt).getTime() : null;
  const pausedAt = state.clock.pausedAt ? new Date(state.clock.pausedAt).getTime() : null;
  const elapsed = state.clock.mode === 'RUNNING' && startedAt
    ? now - startedAt
    : state.clock.mode === 'PAUSED' && startedAt && pausedAt
      ? state.clock.elapsedBeforePauseMs + Math.max(0, pausedAt - startedAt)
      : state.clock.elapsedBeforePauseMs;
  const totalSeconds = Math.max(0, Math.floor(elapsed / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const TeamMark = ({
  team,
  side,
  state,
  config,
}: {
  team: MatchPresentationStateV1['teams'][number];
  side: 'left' | 'right';
  state: MatchPresentationStateV1;
  config: BroadcastOverlayConfigV1;
}) => {
  const serving = state.score.servingTeamId === team.id;
  const score = side === 'left' ? state.score.points[0] : state.score.points[1];
  const sets = side === 'left' ? state.score.setsWon[0] : state.score.setsWon[1];
  return (
    <section className={`${styles.team} ${side === 'right' ? styles.teamRight : ''}`} aria-label={`${team.displayName} score`}>
      <div className={styles.teamIdentity}>
        {config.display.showTeamLogos && team.logoUrl ? (
          <img className={styles.logo} src={team.logoUrl} alt="" />
        ) : null}
        <div className={styles.teamCopy}>
          <div className={styles.teamNameRow}>
            {serving ? <span className={styles.servingIndicator} aria-label="Serving" /> : null}
            {config.display.showSeeds && team.seed ? <span className={styles.seed}>#{team.seed}</span> : null}
            <span className={styles.teamName} title={team.displayName}>{team.shortName || team.displayName}</span>
          </div>
          {config.display.showPlayerNames && team.playerNames.length ? (
            <span className={styles.playerNames}>{team.playerNames.join(' · ')}</span>
          ) : null}
        </div>
      </div>
      <div className={styles.teamScore} style={{ '--team-accent': team.accentColor, '--team-foreground': team.foregroundColor } as React.CSSProperties}>
        <span className={styles.setsWon}>{sets}</span>
        <span className={styles.points}>{score}</span>
      </div>
    </section>
  );
};

const SetRow = ({ state }: { state: MatchPresentationStateV1 }) => (
  <div className={styles.setRow} aria-label="Set scores">
    {state.score.sets.slice(0, 3).map((set, index) => (
      <span
        className={`${styles.setScore} ${!set.complete && index + 1 === state.score.currentSet ? styles.currentSet : ''}`}
        key={set.sequence}
      >
        <small>S{set.sequence}</small>
        <b>{set.team1Points}–{set.team2Points}</b>
      </span>
    ))}
  </div>
);

export default function BroadcastOverlayRenderer({ config, state, event, preview = false }: BroadcastOverlayRendererProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!config.display.showTimer || state.clock.mode !== 'RUNNING') return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [config.display.showTimer, state.clock.mode, state.clock.startedAt]);

  const clock = formatClock(state, now);
  const shouldAnimateScore = event?.type === 'POINT_AWARDED' && event.animate && !config.motion.reducedMotion;
  const surfaceClass = config.style.surface === 'LIGHT'
    ? styles.surfaceLight
    : config.style.surface === 'GLASS'
      ? styles.surfaceGlass
      : styles.surfaceDark;
  const visible = state.presentation.scoreboardVisible || preview;

  return (
    <main className={styles.canvas} data-testid="broadcast-overlay-canvas" data-preview={preview ? 'true' : 'false'}>
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            className={`${styles.scorebug} ${surfaceClass}`}
            data-testid="compact-scorebug"
            style={anchorStyle(config)}
            initial={config.motion.entrance === 'NONE' || config.motion.reducedMotion ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0, scale: shouldAnimateScore ? [1, 1.028, 1] : 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: shouldAnimateScore ? 0.34 : 0.18, ease: 'easeOut' }}
          >
            <div className={styles.contextBar}>
              <span>{state.event.court || state.event.venue || 'BracketIQ'}</span>
              <span>{state.competition.roundLabel || state.competition.sport}</span>
              {config.display.showTimer && clock ? <time>{clock}</time> : null}
            </div>
            <div className={styles.scoreRow}>
              <TeamMark team={state.teams[0]} side="left" state={state} config={config} />
              <div className={styles.middleRail}>
                <span className={styles.currentSetLabel}>SET {state.score.currentSet || 1}</span>
                <SetRow state={state} />
              </div>
              <TeamMark team={state.teams[1]} side="right" state={state} config={config} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {state.presentation.activeStinger ? (
          <motion.div
            className={styles.stinger}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
          >
            <span>{state.presentation.activeStinger.replace('_', ' ')}</span>
            <strong>{state.event.name}</strong>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
