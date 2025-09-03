import Link from 'next/link';
import { Team, UserData, getUserAvatarUrl, getTeamAvatarUrl } from '@/types';

interface TeamCardProps {
  team: Team;
  showStats?: boolean;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export default function TeamCard({
  team,
  showStats = true,
  actions,
  onClick,
  className = ''
}: TeamCardProps) {

  return (
    <div
      className={`card group ${onClick ? 'cursor-pointer hover:elevation-3' : ''} transition-all duration-200 ${className}`}
      onClick={onClick}
    >
      <div className="card-content">
        {/* Team Header with Profile Image */}
        <div className="flex items-start space-x-3 mb-4">
          <div className="flex-shrink-0">
            <img
              src={getTeamAvatarUrl(team, 56)}
              alt={team.name || 'Team'}
              className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 group-hover:border-blue-300 transition-colors"
              onError={(e) => {
                // Fallback to initials if image fails
                const target = e.target as HTMLImageElement;
                target.src = getTeamAvatarUrl({ ...team, profileImage: undefined }, 56);
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors truncate">
              {team.name || 'Unnamed Team'}
            </h3>
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-sm text-gray-600">{team.division} Division</span>
              {team.sport && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                  {team.sport}
                </span>
              )}
              {team.isFull && (
                <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800">
                  Full
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {team.wins > 0 || team.losses > 0 ? (
                <span className={`text-xs px-2 py-1 rounded-full ${team.winRate >= 75 ? 'bg-green-100 text-green-800' :
                    team.winRate >= 50 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                  }`}>
                  {team.winRate}% win rate
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                  New Team
                </span>
              )}
            </div>
          </div>

          {actions && (
            <div className="flex-shrink-0">
              {actions}
            </div>
          )}
        </div>

        {/* Team Stats */}
        {showStats && (
          <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{team.wins}</div>
              <div className="text-xs text-gray-600">Wins</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{team.losses}</div>
              <div className="text-xs text-gray-600">Losses</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">
                {team.currentSize}/{team.teamSize}
              </div>
              <div className="text-xs text-gray-600">Players</div>
            </div>
          </div>
        )}

        {/* Player Avatars */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Members:</span>
            <div className="flex -space-x-2">
              {team.players?.slice(0, 5).map((player, index) => (
                <img
                  key={player.$id}
                  src={getUserAvatarUrl(player, 32)}
                  alt={player.fullName}
                  className="w-8 h-8 rounded-full border-2 border-white object-cover"
                  style={{ zIndex: 5 - index }}
                  title={player.fullName}
                />
              ))}
              {team.currentSize > 5 && (
                <div
                  className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
                  title={`+${team.currentSize - 5} more players`}
                  style={{ zIndex: 0 }}
                >
                  +{team.currentSize - 5}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Team Status */}
        <div className="pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3">
              {team.pending && team.pending.length > 0 && (
                <span className="text-orange-600 font-medium flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {team.pending.length} pending
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {team.isFull ? (
                <span className="text-red-600 font-medium">Team Full</span>
              ) : (
                <span className="text-green-600 font-medium">
                  {team.teamSize - team.currentSize} spots left
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
