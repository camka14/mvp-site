import { UserData, getUserAvatarUrl } from '@/types';
import { Card, Group, Avatar, Text, Badge } from '@mantine/core';

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
        <Card withBorder p="md" onClick={onClick} className={className} style={{ cursor: onClick ? 'pointer' : 'default' }}>
            <Group wrap="nowrap" gap="sm">
                <Avatar src={getUserAvatarUrl(user, 48)} radius="xl" size={48} alt={user.fullName || user.userName} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={500} size="sm" truncate>
                        {user.fullName || `${user.firstName} ${user.lastName}`.trim() || user.userName}
                    </Text>
                    <Text size="sm" c="dimmed" truncate>@{user.userName}</Text>
                    {showRole && role && (
                        <Text size="xs" c="blue" fw={600} mt={4}>{role}</Text>
                    )}
                </div>
                {actions}
            </Group>
        </Card>
    );
}
