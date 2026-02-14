'use client';

import React, { useState } from 'react';
import { ImageSelectionModal } from './ImageSelectionModal';
import { Box, Button, Group, ActionIcon, Paper, Stack, Text, Image } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

interface ImageUploaderProps {
    currentImageUrl?: string;
    className?: string;
    placeholder?: string;
    onChange?: (fileId: string, url: string) => void; // ✅ Pass both ID and URL
    readOnly?: boolean;
}

export function ImageUploader({
    currentImageUrl,
    placeholder = "Click to select image",
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
        onChange?.(fileId, url); // ✅ Pass both fileId and URL
    };

    const handleRemove = () => {
        if (readOnly) return;
        setInternalImageUrl('');
        onChange?.('', ''); // ✅ Clear both
    };

    return (
        <>
            {selectedImageUrl ? (
                <Box pos="relative">
                    <Image src={selectedImageUrl} alt="Selected image" h={160} radius="md" fit="cover" />
                    {!readOnly && (
                        <Group gap="xs" pos="absolute" top={8} right={8}>
                            <ActionIcon variant="filled" color="blue" onClick={handleOpen} title="Change image">
                                ✏️
                            </ActionIcon>
                            <ActionIcon variant="filled" color="red" onClick={handleRemove} title="Remove image">
                                🗑️
                            </ActionIcon>
                        </Group>
                    )}
                </Box>
            ) : (
                <Paper withBorder p="md" h={160} style={{ borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Stack gap={2} align="center">
                        <Text fz={32}>📸</Text>
                        <Button variant="light" onClick={handleOpen} disabled={readOnly}>Select image</Button>
                        <Text size="xs" c="dimmed">{placeholder}</Text>
                    </Stack>
                </Paper>
            )}

            <ImageSelectionModal
                isOpen={opened}
                onClose={close}
                onSelect={handleImageSelect}
            />
        </>
    );
}
