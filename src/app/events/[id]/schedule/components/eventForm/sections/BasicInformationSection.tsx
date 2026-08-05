import type { ComponentProps } from 'react';
import { Controller, type Control, type FieldErrors, type UseFormSetValue } from 'react-hook-form';
import {
    Alert,
    Loader,
    MultiSelect,
    Select as MantineSelect,
    TextInput,
    Textarea,
} from '@mantine/core';
import type { Event, EventTag, Sport } from '@/types';
import { ImageUploader } from '@/components/ui/ImageUploader';

import { CollapsibleEventFormSection } from '../components/CollapsibleEventFormSection';
import type { EventFormValues } from '../formTypes';
import { EventTagsInput } from '../EventTagsInput';

type BasicInformationSectionProps = {
    collapsed: boolean;
    control: Control<EventFormValues>;
    errors: FieldErrors<EventFormValues>;
    selectedImageUrl: string;
    allowImageEdit: boolean;
    sportsLoading: boolean;
    sportOptions: Array<{ value: string; label: string }>;
    eventType: Event['eventType'];
    sportsById: Map<string, Sport>;
    sportsError?: unknown;
    eventTagOptions: EventTag[];
    lockedTagSlugs?: string[];
    comboboxProps?: ComponentProps<typeof MantineSelect>['comboboxProps'];
    maxEventNameLength: number;
    maxDescriptionLength: number;
    isImmutableField: (key: keyof Event) => boolean;
    setValue: UseFormSetValue<EventFormValues>;
    onToggle: () => void;
    onImageChange: (fileId: string, url: string) => void;
    errorCount?: number;
    firstErrorMessage?: string;
};

export const BasicInformationSection = ({
    collapsed,
    control,
    errors,
    selectedImageUrl,
    allowImageEdit,
    sportsLoading,
    sportOptions,
    eventType,
    sportsById,
    sportsError,
    eventTagOptions,
    lockedTagSlugs,
    comboboxProps,
    maxEventNameLength,
    maxDescriptionLength,
    isImmutableField,
    setValue,
    onToggle,
    onImageChange,
    errorCount,
    firstErrorMessage,
}: BasicInformationSectionProps) => (
    <CollapsibleEventFormSection
        id="section-basic-information"
        title="Basic Information"
        collapsed={collapsed}
        onToggle={onToggle}
        errorCount={errorCount}
        firstErrorMessage={firstErrorMessage}
    >
        <div>
            <div className="mt-4 mb-6">
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
                            className="md:col-span-4"
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

                <Controller
                    name="tags"
                    control={control}
                    render={({ field, fieldState }) => (
                        <div className="md:col-span-4">
                            <EventTagsInput
                                value={Array.isArray(field.value) ? field.value : []}
                                options={eventTagOptions}
                                disabled={isImmutableField('name')}
                                error={fieldState.error?.message as string | undefined}
                                lockedTagSlugs={lockedTagSlugs}
                                onChange={(nextTags) => {
                                    setValue('tags', nextTags, { shouldDirty: true, shouldValidate: true });
                                }}
                            />
                        </div>
                    )}
                />

                <div className="md:col-span-4">
                    {eventType === 'EVENT' || eventType === 'WEEKLY_EVENT' ? (
                        <Controller
                            name="sportIds"
                            control={control}
                            rules={{ validate: (value) => value.length > 0 || 'Sport is required' }}
                            render={({ field, fieldState }) => (
                                <MultiSelect
                                    label="Sports"
                                    placeholder={sportsLoading ? 'Loading sports...' : 'Select one or more sports'}
                                    data={sportOptions}
                                    value={Array.isArray(field.value) ? field.value : []}
                                    comboboxProps={comboboxProps}
                                    disabled={isImmutableField('sport') || sportsLoading}
                                    onChange={(value) => {
                                        if (isImmutableField('sport')) return;
                                        const next = Array.from(new Set(value.map((entry) => entry.trim()).filter(Boolean)));
                                        setValue('sportIds', next, { shouldDirty: true, shouldValidate: true });
                                        const primary = next[0] ?? '';
                                        setValue('sportConfig', primary ? (sportsById.get(primary) ?? null) : null, {
                                            shouldDirty: false,
                                            shouldValidate: false,
                                        });
                                        setValue('matchRulesOverride', null, { shouldDirty: true, shouldValidate: false });
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
                    ) : (
                        <Controller
                            name="sportIds"
                            control={control}
                            rules={{ validate: (value) => value.length > 0 || 'Sport is required' }}
                            render={({ field, fieldState }) => (
                                <MantineSelect
                                    label="Sport"
                                    placeholder={sportsLoading ? 'Loading sports...' : 'Select a sport'}
                                    data={sportOptions}
                                    value={Array.isArray(field.value) ? field.value[0] || null : null}
                                    comboboxProps={comboboxProps}
                                    disabled={isImmutableField('sport') || sportsLoading}
                                    onChange={(value) => {
                                        if (isImmutableField('sport')) return;
                                        const next = (value || '').trim();
                                        field.onChange(next ? [next] : []);
                                        setValue('sportConfig', next ? (sportsById.get(next) ?? null) : null, { shouldDirty: false, shouldValidate: false });
                                        setValue('matchRulesOverride', null, { shouldDirty: true, shouldValidate: false });
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
                    )}
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
        </div>
    </CollapsibleEventFormSection>
);
