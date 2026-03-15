import { UserData, getUserAvatarUrl, getUserFullName, getUserHandle } from '@/types';
import { Card, Group, Avatar, Text } from '@mantine/core';

interface UserCardProps {
    user: UserData;
    showRole?: boolean;
    role?: string;
    actions?: React.ReactNode;
    onClick?: () => void;
    className?: string;
    hideHandle?: boolean;
}

export default function UserCard({
    user,
    showRole = false,
    role,
    actions,
    onClick,
    className = '',
    hideHandle = false,
}: UserCardProps) {
    const displayName = getUserFullName(user);
    const userHandle = getUserHandle(user);

    return (
        <Card p="md" onClick={onClick} className={className} style={{ cursor: onClick ? 'pointer' : 'default' }}>
            <Group wrap="nowrap" gap="sm">
                <Avatar src={getUserAvatarUrl(user, 48)} radius="xl" size={48} alt={displayName} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={500} size="sm" truncate>
                        {displayName}
                    </Text>
                    {!hideHandle && userHandle && <Text size="sm" c="dimmed" truncate>{userHandle}</Text>}
                    {showRole && role && (
                        <Text size="xs" c="blue" fw={600} mt={4}>
                            {role
                                .split(/\s+/)
                                .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                                .join(' ')}
                        </Text>
                    )}
                </div>
                {actions}
            </Group>
        </Card>
    );
}
