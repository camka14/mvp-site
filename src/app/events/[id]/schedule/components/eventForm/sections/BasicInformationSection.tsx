import type { ComponentProps } from 'react';
import { Controller, type Control, type FieldErrors, type UseFormSetValue } from 'react-hook-form';
import {
    Alert,
    Button,
    Collapse,
    Loader,
    Paper,
    Select as MantineSelect,
    TextInput,
    Textarea,
} from '@mantine/core';
import type { Event, Sport } from '@/types';
import { ImageUploader } from '@/components/ui/ImageUploader';

import type { EventFormValues } from '../../EventForm';
import { SECTION_ANIMATION_DURATION_MS } from '../constants';

type BasicInformationSectionProps = {
    collapsed: boolean;
    control: Control<EventFormValues>;
    errors: FieldErrors<EventFormValues>;
    selectedImageUrl: string;
    allowImageEdit: boolean;
    sportsLoading: boolean;
    sportOptions: Array<{ value: string; label: string }>;
    sportsById: Map<string, Sport>;
    sportsError?: unknown;
    comboboxProps?: ComponentProps<typeof MantineSelect>['comboboxProps'];
    maxEventNameLength: number;
    maxDescriptionLength: number;
    isImmutableField: (key: keyof Event) => boolean;
    setValue: UseFormSetValue<EventFormValues>;
    onToggle: () => void;
    onImageChange: (fileId: string, url: string) => void;
};

export const BasicInformationSection = ({
    collapsed,
    control,
    errors,
    selectedImageUrl,
    allowImageEdit,
    sportsLoading,
    sportOptions,
    sportsById,
    sportsError,
    comboboxProps,
    maxEventNameLength,
    maxDescriptionLength,
    isImmutableField,
    setValue,
    onToggle,
    onImageChange,
}: BasicInformationSectionProps) => (
    <Paper
        id="section-basic-information"
        shadow="xs"
        radius="md"
        withBorder
        p="lg"
        className="scroll-mt-20 bg-gray-50"
    >
        <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Basic Information</h3>
            <Button
                type="button"
                variant="subtle"
                size="xs"
                aria-expanded={!collapsed}
                aria-controls="section-basic-information-content"
                onClick={onToggle}
            >
                {collapsed ? 'Expand' : 'Collapse'}
            </Button>
        </div>
        <Collapse in={!collapsed} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
            <div id="section-basic-information-content" className="mt-4 mb-6">
                <div className="block text-sm font-medium mb-2">Event Image</div>
                <ImageUploader
                    currentImageUrl={selectedImageUrl}
                    className="w-full max-w-md"
                    placeholder="Select event image"
                    onChange={allowImageEdit ? onImageChange : undefined}
                    readOnly={!allowImageEdit}
                />
                {errors.imageId ? (
                    <p className="text-red-600 text-sm mt-1">{errors.imageId.message as string}</p>
                ) : null}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-end">
                <Controller
                    name="name"
                    control={control}
                    rules={{ required: 'Event name is required' }}
                    render={({ field, fieldState }) => (
                        <TextInput
                            label="Event Name"
                            withAsterisk
                            disabled={isImmutableField('name')}
                            placeholder="Enter event name"
                            error={fieldState.error?.message as string | undefined}
                            maw={520}
                            maxLength={maxEventNameLength}
                            className="md:col-span-6"
                            value={field.value ?? ''}
                            name={field.name}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            onChange={(event) => {
                                if (isImmutableField('name')) return;
                                setValue('name', event.currentTarget.value, { shouldDirty: true, shouldValidate: true });
                            }}
                        />
                    )}
                />

                <div className="md:col-span-6">
                    <Controller
                        name="sportId"
                        control={control}
                        rules={{ required: 'Sport is required' }}
                        render={({ field, fieldState }) => (
                            <MantineSelect
                                label="Sport"
                                placeholder={sportsLoading ? 'Loading sports...' : 'Select a sport'}
                                data={sportOptions}
                                value={field.value || null}
                                comboboxProps={comboboxProps}
                                disabled={isImmutableField('sport') || sportsLoading}
                                onChange={(value) => {
                                    if (isImmutableField('sport')) return;
                                    const next = (value || '').trim();
                                    if (next === (field.value || '').trim()) {
                                        return;
                                    }
                                    setValue(
                                        'sportConfig',
                                        next ? (sportsById.get(next) ?? null) : null,
                                        { shouldDirty: false, shouldValidate: false },
                                    );
                                    setValue('matchRulesOverride', null, { shouldDirty: true, shouldValidate: false });
                                    field.onChange(next);
                                }}
                                searchable
                                nothingFoundMessage={sportsLoading ? 'Loading sports...' : 'No sports found'}
                                rightSection={sportsLoading ? <Loader size="xs" /> : undefined}
                                error={fieldState.error?.message}
                                withAsterisk
                                maw={360}
                            />
                        )}
                    />
                </div>
            </div>

            {sportsError ? (
                <Alert color="red" radius="md" mt="sm">
                    Unable to load sports at the moment. Please refresh the page and try again.
                </Alert>
            ) : null}

            <Controller
                name="description"
                control={control}
                render={({ field }) => (
                    <Textarea
                        label="Description"
                        disabled={isImmutableField('description')}
                        placeholder="Describe your event..."
                        autosize
                        minRows={3}
                        className="mt-4"
                        maxLength={maxDescriptionLength}
                        value={field.value ?? ''}
                        name={field.name}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        onChange={(event) => {
                            if (isImmutableField('description')) return;
                            setValue('description', event.currentTarget.value, { shouldDirty: true, shouldValidate: false });
                        }}
                    />
                )}
            />
        </Collapse>
    </Paper>
);
