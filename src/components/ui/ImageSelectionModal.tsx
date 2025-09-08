import React, { useState, useRef } from 'react';
import { storage } from '@/app/appwrite';
import { ID } from 'appwrite';
import { UserData } from '@/types';

interface ImageSelectionModalProps {
    bucketId: string;
    currentUser: UserData;
    onSelect: (url: string) => void;
    onClose: () => void;
    isOpen: boolean;
}

export function ImageSelectionModal({
    bucketId,
    currentUser,
    onSelect,
    onClose,
    isOpen
}: ImageSelectionModalProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const uploadedImages = currentUser.uploadedImages.map(imgId =>
        storage.getFilePreview({ bucketId, fileId: imgId, width: 400, height: 400 })
    );

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

            // Get preview URL
            const url = storage.getFilePreview({
                bucketId,
                fileId,
                width: 400,
                height: 400
            }).toString();

            onSelect(url);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-xl font-semibold text-gray-900">Select Image</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-8rem)]">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-red-600 text-sm">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                        {/* Upload New Button */}
                        <button
                            onClick={triggerFileInput}
                            disabled={uploading}
                            className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors duration-200 disabled:opacity-50"
                        >
                            {uploading ? (
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            ) : (
                                <>
                                    <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    <span className="text-xs font-medium">Upload New</span>
                                </>
                            )}
                        </button>

                        {/* Existing Images from user.uploadedImages */}
                        {uploadedImages.map((imageUrl, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    onSelect(imageUrl);
                                    onClose();
                                }}
                                className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <img
                                    src={imageUrl}
                                    alt={`Uploaded image ${index + 1}`}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </button>
                        ))}
                    </div>

                    {uploadedImages.length === 0 && (
                        <div className="text-center py-12">
                            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2z" />
                            </svg>
                            <p className="text-gray-500 text-sm">No images uploaded yet. Upload your first image!</p>
                        </div>
                    )}
                </div>

                {/* Hidden file input */}
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    ref={fileInputRef}
                    className="hidden"
                />

                {/* Footer */}
                <div className="border-t p-6">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
