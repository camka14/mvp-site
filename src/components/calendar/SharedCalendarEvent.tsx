'use client';

import type { CSSProperties, ReactNode } from 'react';

import {
  getEntityColorPair,
  getOrderedEntityColorPair,
  type EntityColorPair,
  type EntityColorReferenceValue,
} from '@/lib/entityColors';
import { GripVertical } from 'lucide-react';

type SharedCalendarEventProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  colorSeed?: string | null;
  colorReferenceList?: EntityColorReferenceValue[];
  colorMatchKey?: string | null;
  colors?: EntityColorPair;
  compact?: boolean;
  muted?: boolean;
  selected?: boolean;
  conflict?: boolean;
  draggable?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
};

export default function SharedCalendarEvent({
  title,
  subtitle,
  meta,
  colorSeed,
  colorReferenceList,
  colorMatchKey,
  colors,
  compact = false,
  muted = false,
  selected = false,
  conflict = false,
  draggable = false,
  className = '',
  style,
  onClick,
}: SharedCalendarEventProps) {
  const hasColorMatchKey = typeof colorMatchKey === 'string' && colorMatchKey.trim().length > 0;
  const resolvedColors = colors
    ?? (
      colorReferenceList && hasColorMatchKey
        ? getOrderedEntityColorPair(colorReferenceList, colorMatchKey)
        : getEntityColorPair(colorSeed ?? (typeof title === 'string' ? title : null))
    );
  const customProperties = {
    '--shared-calendar-event-bg': resolvedColors.bg,
    '--shared-calendar-event-text': resolvedColors.text,
    '--shared-calendar-event-border': resolvedColors.bg,
  } as CSSProperties;

  const classNames = [
    'shared-calendar-event',
    compact ? 'shared-calendar-event--compact' : '',
    muted ? 'shared-calendar-event--muted' : '',
    selected ? 'shared-calendar-event--selected' : '',
    conflict ? 'shared-calendar-event--conflict' : '',
    onClick ? 'shared-calendar-event--clickable' : '',
    draggable ? 'shared-calendar-event--draggable' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      style={{ ...customProperties, ...style }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {draggable ? (
        <div className="shared-calendar-event__drag-handle" aria-hidden="true">
          <GripVertical size={14} strokeWidth={2.4} />
        </div>
      ) : null}
      <div className="shared-calendar-event__content">
        <div className="shared-calendar-event__title">{title}</div>
        {subtitle ? (
          <div className="shared-calendar-event__subtitle">{subtitle}</div>
        ) : null}
        {meta ? (
          <div className="shared-calendar-event__meta">{meta}</div>
        ) : null}
      </div>
    </div>
  );
}
