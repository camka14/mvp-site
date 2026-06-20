'use client';

import type { CSSProperties, PointerEventHandler, ReactNode } from 'react';

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
  resourceColorMatchKeys?: EntityColorReferenceValue[];
  colors?: EntityColorPair;
  compact?: boolean;
  muted?: boolean;
  selected?: boolean;
  conflict?: boolean;
  draggable?: boolean;
  className?: string;
  style?: CSSProperties;
  dataAttributes?: Record<string, string | number | undefined>;
  onClick?: () => void;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
  variant?: SharedCalendarEventVariant;
};

export type SharedCalendarEventVariant =
  | 'default'
  | 'availability'
  | 'unavailable'
  | 'reservation'
  | 'booked'
  | 'conflict'
  | 'selection'
  | 'staff-open'
  | 'staff-assigned'
  | 'official-open'
  | 'official-assigned';

const getTextLabel = (value: ReactNode): string => {
  return typeof value === 'string' ? value.trim() : '';
};

export default function SharedCalendarEvent({
  title,
  subtitle,
  meta,
  colorSeed,
  colorReferenceList,
  colorMatchKey,
  resourceColorMatchKeys,
  colors,
  compact = false,
  muted = false,
  selected = false,
  conflict = false,
  draggable = false,
  className = '',
  style,
  dataAttributes,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  variant = 'default',
}: SharedCalendarEventProps) {
  const normalizedResourceColorKeys = Array.isArray(resourceColorMatchKeys)
    ? Array.from(new Set(resourceColorMatchKeys
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)))
    : [];
  const primaryColorMatchKey = normalizedResourceColorKeys[0] ?? colorMatchKey;
  const hasColorMatchKey = typeof primaryColorMatchKey === 'string' && primaryColorMatchKey.trim().length > 0;
  const resolvedColors = colors
    ?? (
      colorReferenceList && hasColorMatchKey
        ? getOrderedEntityColorPair(colorReferenceList, primaryColorMatchKey)
        : getEntityColorPair(colorSeed ?? primaryColorMatchKey ?? (typeof title === 'string' ? title : null))
    );
  const stackedResourceColors = normalizedResourceColorKeys.length
    ? normalizedResourceColorKeys.map((key) => (
      colorReferenceList
        ? getOrderedEntityColorPair(colorReferenceList, key)
        : getEntityColorPair(key)
    ))
    : [resolvedColors];
  const visibleStackedResourceColors = stackedResourceColors.slice(1, 4);
  const primaryResourceColors = colors ?? stackedResourceColors[0] ?? resolvedColors;
  const usesDefaultEventColors = variant === 'default';
  const customProperties = {
    '--shared-calendar-resource-bg': primaryResourceColors.bg,
    '--shared-calendar-resource-text': primaryResourceColors.text,
    '--shared-calendar-resource-stack-count': visibleStackedResourceColors.length,
    ...(usesDefaultEventColors ? {
      '--shared-calendar-event-bg': resolvedColors.bg,
      '--shared-calendar-event-text': resolvedColors.text,
      '--shared-calendar-event-border': resolvedColors.bg,
    } : {}),
  } as CSSProperties;

  const classNames = [
    'shared-calendar-event',
    compact ? 'shared-calendar-event--compact' : '',
    muted ? 'shared-calendar-event--muted' : '',
    selected ? 'shared-calendar-event--selected' : '',
    conflict ? 'shared-calendar-event--conflict' : '',
    variant !== 'default' ? `shared-calendar-event--${variant}` : '',
    onClick ? 'shared-calendar-event--clickable' : '',
    draggable ? 'shared-calendar-event--draggable' : '',
    stackedResourceColors.length > 1 ? 'shared-calendar-event--resource-stack' : '',
    className,
  ].filter(Boolean).join(' ');
  const tooltipLabel = [title, subtitle, meta]
    .map(getTextLabel)
    .filter(Boolean)
    .join(' • ') || undefined;

  return (
    <div
      className={classNames}
      style={{ ...customProperties, ...style }}
      {...dataAttributes}
      title={tooltipLabel}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {visibleStackedResourceColors.length > 0 ? (
        <div className="shared-calendar-event__resource-stack" aria-hidden="true">
          {visibleStackedResourceColors.map((resourceColors, index) => (
            <span
              key={`${resourceColors.bg}-${index}`}
              className="shared-calendar-event__resource-stack-card"
              style={{
                '--shared-calendar-resource-stack-bg': resourceColors.bg,
                '--shared-calendar-resource-stack-text': resourceColors.text,
                '--shared-calendar-resource-stack-index': index + 1,
                zIndex: index + 1,
              } as CSSProperties}
            />
          ))}
        </div>
      ) : null}
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
