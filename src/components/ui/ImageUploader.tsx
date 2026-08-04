'use client';

import React, { useState } from 'react';
import { ImageSelectionModal } from './ImageSelectionModal';
import { Box, Button, Group, ActionIcon, Paper, Stack, Text, Image } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ImagePlus, Pencil, Trash2 } from 'lucide-react';

interface ImageUploaderProps {
    currentImageUrl?: string;
    className?: string;
    placeholder?: string;
    previewHeight?: number;
    onChange?: (fileId: string, url: string) => void;
    readOnly?: boolean;
}

export function ImageUploader({
    currentImageUrl,
    className,
    placeholder = "Click to select image",
    previewHeight = 160,
    onChange,
    readOnly = false,
}: ImageUploaderProps) {
    const [opened, { open, close }] = useDisclosure(false);
    const [internalImageUrl, setInternalImageUrl] = useState('');
    const selectedImageUrl = currentImageUrl ?? internalImageUrl;

    const handleOpen = () => {
        if (readOnly) return;
        open();
    };

    const handleImageSelect = (fileId: string, url: string) => {
        setInternalImageUrl(url);
        onChange?.(fileId, url);
    };

    const handleRemove = () => {
        if (readOnly) return;
        setInternalImageUrl('');
        onChange?.('', '');
    };

    return (
        <>
            <Box className={className}>
                {selectedImageUrl ? (
                    <Box pos="relative">
                        <Image
                            src={selectedImageUrl}
                            alt="Selected image"
                            h={previewHeight}
                            radius="md"
                            fit="cover"
                        />
                        {!readOnly ? (
                            <Group gap="xs" pos="absolute" top={8} right={8}>
                                <ActionIcon
                                    variant="filled"
                                    color="blue"
                                    aria-label="Change image"
                                    title="Change image"
                                    onClick={handleOpen}
                                >
                                    <Pencil aria-hidden="true" size={16} />
                                </ActionIcon>
                                <ActionIcon
                                    variant="filled"
                                    color="red"
                                    aria-label="Remove image"
                                    title="Remove image"
                                    onClick={handleRemove}
                                >
                                    <Trash2 aria-hidden="true" size={16} />
                                </ActionIcon>
                            </Group>
                        ) : null}
                    </Box>
                ) : (
                    <Paper
                        withBorder
                        p="md"
                        h={previewHeight}
                        style={{
                            alignItems: 'center',
                            borderStyle: 'dashed',
                            display: 'flex',
                            justifyContent: 'center',
                        }}
                    >
                        <Stack gap={2} align="center">
                            <ImagePlus aria-hidden="true" size={32} />
                            <Button variant="light" onClick={handleOpen} disabled={readOnly}>Select image</Button>
                            <Text size="xs" c="dimmed">{placeholder}</Text>
                        </Stack>
                    </Paper>
                )}
            </Box>

            <ImageSelectionModal
                isOpen={opened}
                onClose={close}
                onSelect={handleImageSelect}
            />
        </>
    );
}
