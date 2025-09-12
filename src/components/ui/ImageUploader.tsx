'use client';

import React, { useState } from 'react';
import { ImageSelectionModal } from './ImageSelectionModal';
import { UserData } from '@/types';

interface ImageUploaderProps {
    currentImageUrl?: string;
    bucketId: string;
    className?: string;
    placeholder?: string;
    onChange?: (fileId: string, url: string) => void; // ✅ Pass both ID and URL
}

export function ImageUploader({
    currentImageUrl,
    bucketId,
    placeholder = "Click to select image",
    onChange
}: ImageUploaderProps) {
    const [showModal, setShowModal] = useState(false);
    const [selectedImageUrl, setSelectedImageUrl] = useState(currentImageUrl || '');

    const handleImageSelect = (fileId: string, url: string) => {
        setSelectedImageUrl(url);
        onChange?.(fileId, url); // ✅ Pass both fileId and URL
    };

    const handleRemove = () => {
        setSelectedImageUrl('');
        onChange?.('', ''); // ✅ Clear both
    };

    return (
        <>
            {selectedImageUrl ? (
                <div className="relative">
                    <img
                        src={selectedImageUrl}
                        alt="Selected image"
                        className="w-full h-40 object-cover rounded-lg"
                    />
                    <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="absolute top-2 right-2 p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-lg"
                        title="Change image"
                    >
                        ✏️
                    </button>
                    <button
                        type="button"
                        onClick={handleRemove}
                        className="absolute top-2 left-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                        title="Remove image"
                    >
                        🗑️
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors duration-200"
                >
                    <span className="text-4xl mb-2">📸</span>
                    <span>{placeholder}</span>
                    <span className="text-sm">Select from gallery or upload new</span>
                </button>
            )}

            <ImageSelectionModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSelect={handleImageSelect}
                bucketId={bucketId}
            />
        </>
    );
}
