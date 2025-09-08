'use client';

import React, { useState, useRef } from 'react';
import { storage } from '@/app/appwrite';
import { ID } from 'appwrite';

interface ImageUploaderProps {
    currentImageUrl?: string;
    onImageUploaded: (fileId: string, imageUrl: string) => void;
    bucketId: string;
    accept?: string;
    maxSizeMB?: number;
    className?: string;
    placeholder?: string;
}

export function ImageUploader({
    currentImageUrl,
    onImageUploaded,
    bucketId,
    accept = "image/*",
    maxSizeMB = 5,
    className = "",
    placeholder = "Click to upload image"
}: ImageUploaderProps) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file size
        if (file.size > maxSizeMB * 1024 * 1024) {
            setError(`File size must be less than ${maxSizeMB}MB`);
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setError('Please select a valid image file');
            return;
        }

        setError(null);
        setUploading(true);
        setProgress(0);

        // Create preview
        const reader = new FileReader();
        reader.onload = () => setPreview(reader.result as string);
        reader.readAsDataURL(file);

        try {
            const fileId = ID.unique();

            // Upload file to Appwrite Storage
            const response = await storage.createFile(
                bucketId,
                fileId,
                file
            );

            // Get file preview URL
            const imageUrl = storage.getFilePreview({bucketId, fileId, width: 400, height: 400});

            onImageUploaded(fileId, imageUrl.toString());
            setProgress(100);
        } catch (error) {
            console.error('Upload error:', error);
            setError('Failed to upload image. Please try again.');
            setPreview(currentImageUrl || null);
        } finally {
            setUploading(false);
        }
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleRemove = () => {
        setPreview(null);
        onImageUploaded('', '');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Upload Area */}
            <div
                onClick={handleClick}
                className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-colors ${preview
                        ? 'border-gray-300 bg-gray-50'
                        : 'border-blue-300 bg-blue-50 hover:bg-blue-100'
                    } ${uploading ? 'pointer-events-none' : ''}`}
            >
                {preview ? (
                    <div className="relative">
                        <img
                            src={preview}
                            alt="Preview"
                            className="w-full h-48 object-cover rounded-xl"
                        />
                        {!uploading && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemove();
                                }}
                                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-8">
                        <svg className="w-12 h-12 text-blue-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <p className="text-gray-600 text-center">
                            {placeholder}
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                            Max size: {maxSizeMB}MB
                        </p>
                    </div>
                )}

                {/* Upload Progress */}
                {uploading && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-xl">
                        <div className="text-white text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                            <p className="text-sm">Uploading...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Error message */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-800 text-sm">{error}</p>
                </div>
            )}
        </div>
    );
}
