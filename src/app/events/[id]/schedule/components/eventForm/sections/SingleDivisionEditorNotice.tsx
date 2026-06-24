import { Text } from '@mantine/core';

import type { Event } from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';
import { getSingleDivisionEditorNotice } from '../divisionForm';

type SingleDivisionEditorNoticeProps = {
    visible: boolean;
    eventType?: Event['eventType'] | null;
};

export const SingleDivisionEditorNotice = ({
    visible,
    eventType,
}: SingleDivisionEditorNoticeProps) => (
    <AnimatedLayoutSection in={visible}>
        <Text size="xs" c="dimmed">
            {getSingleDivisionEditorNotice(eventType)}
        </Text>
    </AnimatedLayoutSection>
);
