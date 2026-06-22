import {
    Alert,
    Button,
    Group,
    Text,
} from '@mantine/core';

type DivisionEditorActionsAndErrorsProps = {
    isEditing: boolean;
    disabled: boolean;
    editorError?: string | null;
    divisionsError?: string | null;
    divisionDetailsError?: string | null;
    playoffDivisionDetailsError?: string | null;
    showMissingPlayoffDivisionWarning: boolean;
    onSave: () => void;
    onCancelEdit: () => void;
};

export const DivisionEditorActionsAndErrors = ({
    isEditing,
    disabled,
    editorError,
    divisionsError,
    divisionDetailsError,
    playoffDivisionDetailsError,
    showMissingPlayoffDivisionWarning,
    onSave,
    onCancelEdit,
}: DivisionEditorActionsAndErrorsProps) => (
    <>
        <Group justify="space-between" align="center">
            <Button
                variant="light"
                onClick={onSave}
                disabled={disabled}
            >
                {isEditing ? 'Update Division' : 'Add Division'}
            </Button>
            {isEditing ? (
                <Button variant="subtle" color="gray" onClick={onCancelEdit}>
                    Cancel Edit
                </Button>
            ) : null}
        </Group>
        {editorError ? (
            <Text size="sm" c="red">
                {editorError}
            </Text>
        ) : null}
        {divisionsError ? (
            <Text size="sm" c="red">
                {divisionsError}
            </Text>
        ) : null}
        {divisionDetailsError ? (
            <Text size="sm" c="red">
                {divisionDetailsError}
            </Text>
        ) : null}
        {showMissingPlayoffDivisionWarning ? (
            <Alert color="yellow" radius="md">
                Add at least one playoff division before saving split league/playoff divisions.
            </Alert>
        ) : null}
        {playoffDivisionDetailsError ? (
            <Text size="sm" c="red">
                {playoffDivisionDetailsError}
            </Text>
        ) : null}
    </>
);
