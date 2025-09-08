'use client';

import React, { useState } from 'react';
import { ImageSelectionModal } from './ImageSelectionModal';
import { UserData } from '@/types';

interface ImageUploaderProps {
    currentImageUrl?: string;
    currentUser: UserData; // Serializable array of URLs
    bucketId: string;
    className?: string;
    placeholder?: string;
    onChange?: (url: string) => void; // Optional callback for parent updates
}

export function ImageUploader({
    currentImageUrl,
    currentUser,
    bucketId,
    className = "",
    placeholder = "Click to select image",
    onChange
}: ImageUploaderProps) {
    const [showModal, setShowModal] = useState(false);
    const [selectedImageUrl, setSelectedImageUrl] = useState<string>(currentImageUrl || '');

    const handleImageSelect = (url: string) => {
        setSelectedImageUrl(url);
        onChange?.(url);
    };

    const handleRemove = () => {
        setSelectedImageUrl('');
        onChange?.('');
    };

    return (
        <>
            <div className={`relative ${className}`}>
                {selectedImageUrl ? (
                    <div className="relative">
                        <img
                            src={selectedImageUrl}
                            alt="Selected"
                            className="w-full h-40 object-cover rounded-lg border border-gray-200"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                            <button
                                onClick={() => setShowModal(true)}
                                className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-lg"
                                title="Change image"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                            </button>
                            <button
                                onClick={handleRemove}
                                className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                                title="Remove image"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowModal(true)}
                        className="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors duration-200"
                    >
                        <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm font-medium">{placeholder}</span>
                        <span className="text-xs text-gray-400 mt-1">Select from gallery or upload new</span>
                    </button>
                )}
            </div>

            <ImageSelectionModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSelect={handleImageSelect}
                bucketId={bucketId}
                currentUser={currentUser}
            />
        </>
    );
}
