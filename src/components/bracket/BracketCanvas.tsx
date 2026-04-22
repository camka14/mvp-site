import type { CSSProperties, ReactNode } from 'react';

import type {
  BracketCanvasConnection,
  BracketCanvasMetrics,
  BracketCanvasPosition,
} from '@/lib/bracketCanvasLayout';

type BracketCanvasLayoutInput = {
  metrics: BracketCanvasMetrics;
  positionById: Record<string, BracketCanvasPosition>;
  contentSize: {
    width: number;
    height: number;
  };
  connections: BracketCanvasConnection[];
};

type BracketCanvasProps = {
  layout: BracketCanvasLayoutInput;
  renderCard: (matchId: string) => ReactNode;
  matchIds?: string[];
  markerId?: string;
  className?: string;
  svgClassName?: string;
  cardWrapperClassName?: string;
  connectionStroke?: string;
  arrowFill?: string;
  strokeWidth?: number;
  emptyState?: ReactNode;
};

const sortMatchIds = (
  positionById: Record<string, BracketCanvasPosition>,
): string[] => (
  Object.entries(positionById)
    .sort((left, right) => {
      if (left[1].x !== right[1].x) {
        return left[1].x - right[1].x;
      }
      if (left[1].y !== right[1].y) {
        return left[1].y - right[1].y;
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([matchId]) => matchId)
);

export default function BracketCanvas({
  layout,
  renderCard,
  matchIds,
  markerId = 'arrowhead',
  className = '',
  svgClassName = '',
  cardWrapperClassName = '',
  connectionStroke = 'var(--mvp-neutral-400, #94a3b8)',
  arrowFill = 'var(--mvp-neutral-400, #94a3b8)',
  strokeWidth = 2,
  emptyState = null,
}: BracketCanvasProps) {
  const ids = (matchIds ?? sortMatchIds(layout.positionById))
    .filter((matchId) => Boolean(layout.positionById[matchId]));

  if (!ids.length) {
    return <>{emptyState}</>;
  }

  const wrapperStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    width: layout.contentSize.width,
    height: layout.contentSize.height,
  };

  return (
    <div className={className} style={wrapperStyle}>
      {ids.map((matchId) => {
        const position = layout.positionById[matchId];
        if (!position) {
          return null;
        }

        const cardStyle: CSSProperties = {
          position: 'absolute',
          left: layout.metrics.paddingLeft + position.x,
          top: layout.metrics.paddingTop + position.y,
          width: layout.metrics.cardWidth,
          height: layout.metrics.cardHeight,
        };

        return (
          <div
            key={matchId}
            className={`absolute ${cardWrapperClassName}`.trim()}
            style={cardStyle}
            data-bracket-match-id={matchId}
          >
            {renderCard(matchId)}
          </div>
        );
      })}

      <svg
        className={svgClassName}
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <defs>
          <marker id={markerId} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={arrowFill} />
          </marker>
        </defs>
        {layout.connections.map((connection) => {
          const midX = (connection.x1 + connection.x2) / 2;
          const d = `M ${connection.x1} ${connection.y1} L ${midX} ${connection.y1} L ${midX} ${connection.y2} L ${connection.x2} ${connection.y2}`;
          return (
            <path
              key={`${connection.fromId}-${connection.toId}`}
              d={d}
              stroke={connectionStroke}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="square"
              markerEnd={`url(#${markerId})`}
            />
          );
        })}
      </svg>
    </div>
  );
}
