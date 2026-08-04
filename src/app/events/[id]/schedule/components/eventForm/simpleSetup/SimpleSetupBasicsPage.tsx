'use client';

import type { ComponentProps } from 'react';
import { Controller } from 'react-hook-form';
import {
    Alert,
    Loader,
    Select as MantineSelect,
    Stack,
    Text,
    TextInput,
    Textarea,
    Title,
} from '@mantine/core';

import { ImageUploader } from '@/components/ui/ImageUploader';

import { EventTagsInput } from '../EventTagsInput';
import type { EventFormSectionsProps } from '../sections/EventFormSections';

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedComboboxProps: ComponentProps<typeof MantineSelect>['comboboxProps'] = {
    withinPortal: true,
    zIndex: SHEET_POPOVER_Z_INDEX,
};
const MAX_EVENT_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;

type SimpleSetupBasicsPageProps = {
    model: EventFormSectionsProps;
};

export const SimpleSetupBasicsPage = ({
    model,
}: SimpleSetupBasicsPageProps) => {
    const {
        catalog,
        control,
        errors,
        isImmutableField,
        presentation,
        setValue,
    } = model;

    return (
        <Stack gap="lg">
            <div>
                <Title order={4}>Basic Information</Title>
                <Text size="sm" c="dimmed">
                    Add the event image and public details participants will see.
                </Text>
            </div>

            <div
                data-testid="simple-setup-basics-layout"
                className="flex flex-col gap-6 lg:flex-row lg:items-start"
            >
                <div className="lg:flex-none">
                    <Text size="sm" fw={500} mb={8}>Event Image</Text>
                    <ImageUploader
                        currentImageUrl={presentation.selectedImageUrl}
                        className="w-full max-w-[20rem] lg:w-80 lg:max-w-none"
                        previewHeight={176}
                        placeholder="Select event image"
                        onChange={presentation.allowImageEdit
                            ? (fileId) => setValue('imageId', fileId, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                            : undefined}
                        readOnly={!presentation.allowImageEdit}
                    />
                    {errors.imageId ? (
                        <Text c="red" size="sm" mt={4}>{errors.imageId.message as string}</Text>
                    ) : null}
                </div>

                <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                                maxLength={MAX_EVENT_NAME_LENGTH}
                                value={field.value ?? ''}
                                name={field.name}
                                onBlur={field.onBlur}
                                ref={field.ref}
                                onChange={(event) => {
                                    if (isImmutableField('name')) return;
                                    setValue('name', event.currentTarget.value, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                    });
                                }}
                            />
                        )}
                    />

                    <Controller
                        name="tags"
                        control={control}
                        render={({ field, fieldState }) => (
                            <EventTagsInput
                                value={Array.isArray(field.value) ? field.value : []}
                                options={catalog.eventTagOptions}
                                disabled={isImmutableField('name')}
                                error={fieldState.error?.message as string | undefined}
                                lockedTagSlugs={presentation.lockedEventTypeTagSlugs}
                                onChange={(nextTags) => {
                                    setValue('tags', nextTags, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                    });
                                }}
                            />
                        )}
                    />

                    <Controller
                        name="sportId"
                        control={control}
                        rules={{ required: 'Sport is required' }}
                        render={({ field, fieldState }) => (
                            <MantineSelect
                                label="Sport"
                                placeholder={catalog.sportsLoading ? 'Loading sports...' : 'Select a sport'}
                                data={catalog.sportOptions}
                                value={field.value || null}
                                comboboxProps={sharedComboboxProps}
                                disabled={isImmutableField('sport') || catalog.sportsLoading}
                                onChange={(value) => {
                                    if (isImmutableField('sport')) return;
                                    const next = (value || '').trim();
                                    if (next === (field.value || '').trim()) return;
                                    setValue(
                                        'sportConfig',
                                        next ? (catalog.sportsById.get(next) ?? null) : null,
                                        { shouldDirty: false, shouldValidate: false },
                                    );
                                    setValue('matchRulesOverride', null, {
                                        shouldDirty: true,
                                        shouldValidate: false,
                                    });
                                    field.onChange(next);
                                }}
                                searchable
                                nothingFoundMessage={catalog.sportsLoading ? 'Loading sports...' : 'No sports found'}
                                rightSection={catalog.sportsLoading ? <Loader size="xs" /> : undefined}
                                error={fieldState.error?.message}
                                withAsterisk
                            />
                        )}
                    />

                    {catalog.sportsError ? (
                        <Alert className="sm:col-span-2 xl:col-span-3" color="red" radius="md">
                            Unable to load sports at the moment. Please refresh the page and try again.
                        </Alert>
                    ) : null}

                    {model.isAffiliateEvent ? (
                        <Controller
                            name="affiliateUrl"
                            control={control}
                            render={({ field, fieldState }) => (
                                <TextInput
                                    className="sm:col-span-2 xl:col-span-3"
                                    label="External registration link"
                                    withAsterisk
                                    disabled={isImmutableField('affiliateUrl')}
                                    placeholder="https://example.com/event"
                                    value={field.value ?? ''}
                                    name={field.name}
                                    onBlur={field.onBlur}
                                    ref={field.ref}
                                    error={fieldState.error?.message as string | undefined}
                                    onChange={(event) => {
                                        if (isImmutableField('affiliateUrl')) return;
                                        field.onChange(event.currentTarget.value);
                                    }}
                                />
                            )}
                        />
                    ) : null}

                    <Controller
                        name="description"
                        control={control}
                        render={({ field }) => (
                            <Textarea
                                className="sm:col-span-2 xl:col-span-3"
                                label="Description"
                                disabled={isImmutableField('description')}
                                placeholder="Describe your event..."
                                autosize
                                minRows={3}
                                maxLength={MAX_DESCRIPTION_LENGTH}
                                value={field.value ?? ''}
                                name={field.name}
                                onBlur={field.onBlur}
                                ref={field.ref}
                                onChange={(event) => {
                                    if (isImmutableField('description')) return;
                                    setValue('description', event.currentTarget.value, {
                                        shouldDirty: true,
                                        shouldValidate: false,
                                    });
                                }}
                            />
                        )}
                    />
                </div>
            </div>
        </Stack>
    );
};
