'use client';

import { ChangeEvent, useEffect, useId, useRef, useState } from 'react';
import { IMAGE_UPLOAD_ACCEPT, isSupportedImageUpload } from '@/lib/imageUploadPolicy';

interface ProfileImageUploadFieldProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  currentImageUrl?: string;
  label?: string;
  disabled?: boolean;
  onError?: (message: string) => void;
}

const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;

export function ProfileImageUploadField({
  file,
  onFileChange,
  currentImageUrl = '',
  label = 'Profile photo (optional)',
  disabled = false,
  onError,
}: ProfileImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const selectedImageUrl = previewUrl || currentImageUrl;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.currentTarget.files?.[0] ?? null;
    if (!selectedFile) {
      return;
    }

    if (selectedFile.size > MAX_PROFILE_IMAGE_BYTES) {
      onError?.('Profile photo must be 10MB or less.');
      event.currentTarget.value = '';
      return;
    }

    if (!isSupportedImageUpload(selectedFile.type, selectedFile.name)) {
      onError?.('Please select a PNG, JPEG, WebP, AVIF, or SVG image.');
      event.currentTarget.value = '';
      return;
    }

    onFileChange(selectedFile);
  };

  const handleRemove = () => {
    onFileChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-500">
          {selectedImageUrl ? (
            <img
              src={selectedImageUrl}
              alt="Profile preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <span>Photo</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
            {label}
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            PNG, JPEG, WebP, AVIF, or SVG up to 10MB.
          </p>
          {file ? (
            <p className="mt-1 truncate text-xs font-medium text-slate-700">{file.name}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <label
              htmlFor={inputId}
              className={`inline-flex cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 ${
                disabled ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              {selectedImageUrl ? 'Change Photo' : 'Upload Photo'}
            </label>
            {selectedImageUrl ? (
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Remove
              </button>
            ) : null}
          </div>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={IMAGE_UPLOAD_ACCEPT}
            onChange={handleFileChange}
            disabled={disabled}
            className="sr-only"
          />
        </div>
      </div>
    </div>
  );
}
