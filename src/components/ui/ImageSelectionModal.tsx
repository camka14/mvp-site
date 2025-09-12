import React, { useState, useRef } from 'react';
import { storage } from '@/app/appwrite';
import { ID } from 'appwrite';
import { UserData } from '@/types';
import { userService } from '@/lib/userService';
import { useApp } from '@/app/providers';

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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Select Image</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-xl"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-96">
                    {error && (
                        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                            {error}
                        </div>
                    )}

                    {/* Upload New Button */}
                    {uploading ? (
                        <div className="w-full h-40 bg-gray-100 rounded-lg flex items-center justify-center">
                            <div className="text-gray-600">Uploading...</div>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={triggerFileInput}
                                className="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors duration-200 mb-6"
                            >
                                <span className="text-4xl mb-2">📸</span>
                                <span>Upload New Image</span>
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                        </>
                    )}

                    {/* Existing Images from user.uploadedImages */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {uploadedImages.map((image) => (
                            <button
                                key={image.id}
                                onClick={() => {
                                    onSelect(image.id, image.url); // ✅ Pass both ID and URL
                                    onClose();
                                }}
                                className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <img
                                    src={image.url}
                                    alt="Uploaded image"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.src = 'https://via.placeholder.com/400x400?text=Error+Loading+Image';
                                    }}
                                />
                            </button>
                        ))}
                    </div>

                    {uploadedImages.length === 0 && (
                        <div className="text-center text-gray-500 py-8">
                            No images uploaded yet. Upload your first image!
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
