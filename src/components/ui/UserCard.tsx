import { UserData, getUserAvatarUrl } from '@/types';

interface UserCardProps {
    user: UserData;
    showRole?: boolean;
    role?: string;
    actions?: React.ReactNode;
    onClick?: () => void;
    className?: string;
}

export default function UserCard({
    user,
    showRole = false,
    role,
    actions,
    onClick,
    className = ''
}: UserCardProps) {

    return (
        <div
            className={`card p-4 ${onClick ? 'cursor-pointer hover:elevation-3' : ''} transition-shadow duration-200 ${className}`}
            onClick={onClick}
        >
            <div className="flex items-center space-x-3">
                {/* Avatar */}
                <div className="flex-shrink-0">
                    <img
                        src={getUserAvatarUrl(user, 48)}
                        alt={user.fullName || user.userName}
                        className="w-12 h-12 rounded-full object-cover"
                        onError={(e) => {
                            // Fallback to initials if image fails
                            const target = e.target as HTMLImageElement;
                            target.src = getUserAvatarUrl({ ...user, profileImageId: undefined }, 48);
                        }}
                    />
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                        {user.fullName || `${user.firstName} ${user.lastName}`.trim() || user.userName}
                    </h3>
                    <p className="text-sm text-gray-500 truncate">
                        @{user.userName}
                    </p>
                    {showRole && role && (
                        <p className="text-xs text-blue-600 font-medium mt-1">
                            {role}
                        </p>
                    )}
                </div>

                {/* Actions */}
                {actions && (
                    <div className="flex-shrink-0">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}
