'use client';

import React from 'react';

type MaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  header?: React.ReactNode; // custom header; overrides title rendering
  footer?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: MaxWidth;
  showCloseButton?: boolean;
  className?: string; // extra classes for container
  contentClassName?: string; // extra classes for content area
}

const maxWidthClass: Record<MaxWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  full: 'max-w-full',
};

export function ModalShell({
  isOpen,
  onClose,
  title,
  header,
  footer,
  children,
  maxWidth = 'md',
  showCloseButton = true,
  className = '',
  contentClassName = '',
}: ModalShellProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`relative bg-white rounded-xl w-full ${maxWidthClass[maxWidth]} max-h-[90vh] overflow-hidden shadow-2xl flex flex-col ${className}`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6">
          {header ? (
            header
          ) : (
            <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          )}
          {showCloseButton && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto p-6 ${contentClassName}`}>{children}</div>

        {/* Footer */}
        {footer && <div className="border-t p-6">{footer}</div>}
      </div>
    </div>
  );
}

export default ModalShell;

