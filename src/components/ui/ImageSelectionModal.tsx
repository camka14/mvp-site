import React, { useState, useRef } from 'react';
import { storage } from '@/app/appwrite';
import { ID } from 'appwrite';
import { UserData } from '@/types';
import { userService } from '@/lib/userService';
import { useApp } from '@/app/providers';
import { Modal, Button, SimpleGrid, Image, Alert, Group, Stack, FileButton, Loader, Text, Box } from '@mantine/core';

interface ImageSelectionModalProps {
    bucketId: string;
    onSelect: (fileId: string, url: string) => void; // ✅ Pass both ID and URL
    onClose: () => void;
    isOpen: boolean;
}

export function ImageSelectionModal({
    bucketId,
    onSelect,
    onClose,
    isOpen
}: ImageSelectionModalProps) {
    const { refreshUser, user } = useApp();
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ✅ Create image data with both ID and URL
    const uploadedImages = (user?.uploadedImages || []).map(imgId => ({
        id: imgId,
        url: storage.getFilePreview({
            bucketId,
            fileId: imgId,
            width: 400,
            height: 400
        }).toString()
    })) || [];

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file
        if (file.size > 5 * 1024 * 1024) {
            setError('File size must be less than 5MB');
            return;
        }

        if (!file.type.startsWith('image/')) {
            setError('Please select a valid image file');
            return;
        }

        setUploading(true);
        setError(null);

        try {
            const fileId = ID.unique();

            // Upload to Appwrite Storage
            await storage.createFile({ bucketId, fileId, file });

            await userService.updateUser(user!.$id, {
                uploadedImages: [...(user?.uploadedImages || []), fileId]
            });
            // Refresh user in context so other components see the new list
            try { await refreshUser(); } catch {}

            // Get preview URL
            const url = storage.getFilePreview({
                bucketId,
                fileId,
                width: 400,
                height: 400
            }).toString();

            onSelect(fileId, url);
            onClose();
        } catch (error) {
            console.error('Upload failed:', error);
            setError('Failed to upload image. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return (
        <Modal opened={isOpen} onClose={onClose} title="Select image" size="xl" centered>
            <Stack gap="md">
                {error && (
                    <Alert color="red" variant="light">{error}</Alert>
                )}

                {/* Upload New */}
                {uploading ? (
                    <Group justify="center" h={160} style={{ borderRadius: 8, background: 'var(--mantine-color-gray-1)' }}>
                        <Loader size="sm" />
                        <Text c="dimmed">Uploading…</Text>
                    </Group>
                ) : (
                    <Group justify="space-between">
                        <FileButton
                            onChange={(file) => {
                                if (!file) return;
                                // create a synthetic event to reuse handler
                                handleFileUpload({ target: { files: [file] } } as any);
                            }}
                            accept="image/*"
                        >
                            {(props) => (
                                <Button {...props} variant="light" leftSection={<span>📸</span>}>
                                    Upload new image
                                </Button>
                            )}
                        </FileButton>
                        <Text c="dimmed" size="sm">Max 5MB, images only</Text>
                    </Group>
                )}

                {/* Existing Images */}
                <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="md">
                    {uploadedImages.map((image) => (
                        <Box key={image.id} style={{ aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--mantine-color-default-border)' }}
                             onClick={() => { onSelect(image.id, image.url); onClose(); }}>
                            <Image src={image.url} alt="Uploaded" fit="cover" height="100%" width="100%"
                                   fallbackSrc="https://via.placeholder.com/400x400?text=Image" />
                        </Box>
                    ))}
                </SimpleGrid>
                {uploadedImages.length === 0 && (
                    <Text ta="center" c="dimmed">No images uploaded yet. Upload your first image!</Text>
                )}

                <Group justify="end" mt="sm">
                    <Button variant="subtle" onClick={onClose}>Close</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
