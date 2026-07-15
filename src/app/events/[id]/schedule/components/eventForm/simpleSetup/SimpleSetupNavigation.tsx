'use client';

import { useEffect, useRef } from 'react';
import { Check, LockKeyhole, Minus } from 'lucide-react';
import { SegmentedControl, Tooltip } from '@mantine/core';

import type {
    EventSetupMode,
    EventSetupPage,
    EventSetupPageId,
} from './types';

type SetupModeControlProps = {
    value: EventSetupMode;
    onChange: (value: EventSetupMode) => void;
};

export const SetupModeControl = ({ value, onChange }: SetupModeControlProps) => (
    <SegmentedControl
        aria-label="Event setup mode"
        value={value}
        data={[
            { value: 'SIMPLE', label: 'Simple Setup' },
            { value: 'ADVANCED', label: 'Advanced Setup' },
        ]}
        onChange={(nextValue) => onChange(nextValue as EventSetupMode)}
        radius="md"
        size="sm"
    />
);

type SimpleSetupProgressRailProps = {
    pages: EventSetupPage[];
    onSelectPage: (pageId: EventSetupPageId) => void;
};

const pageStatusIcon = (page: EventSetupPage) => {
    if (page.status === 'complete') {
        return <Check aria-hidden="true" size={14} strokeWidth={2.5} />;
    }
    if (page.status === 'locked') {
        return <LockKeyhole aria-hidden="true" size={13} />;
    }
    if (page.status === 'not-used') {
        return <Minus aria-hidden="true" size={14} />;
    }
    return <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />;
};

const pageStatusLabel = (page: EventSetupPage): string => {
    if (page.status === 'not-used') return 'Not used';
    if (page.status === 'locked') return 'Locked';
    if (page.status === 'complete') return 'Complete';
    if (page.status === 'current') return 'Current';
    return 'Available';
};

export const SimpleSetupProgressRail = ({
    pages,
    onSelectPage,
}: SimpleSetupProgressRailProps) => {
    const currentPageRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        currentPageRef.current?.scrollIntoView?.({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
        });
    }, [pages]);

    return (
    <nav aria-label="Event setup progress" className="w-full overflow-x-auto [scrollbar-gutter:stable]">
        <ol className="flex min-w-max items-stretch gap-2 pb-2">
            {pages.map((page, index) => {
                const isCurrent = page.status === 'current';
                const isMuted = page.status === 'locked' || page.status === 'not-used';
                const tooltip = page.status === 'locked'
                    ? `Complete ${pages.find((candidate) => candidate.id === page.prerequisitePageId)?.label ?? 'the earlier page'} first.`
                    : page.unavailableReason;
                const button = (
                    <button
                        ref={isCurrent ? currentPageRef : undefined}
                        type="button"
                        aria-current={isCurrent ? 'step' : undefined}
                        aria-label={`${page.label}: ${pageStatusLabel(page)}`}
                        onClick={() => onSelectPage(page.id)}
                        className={`flex h-14 w-44 shrink-0 items-center gap-2 rounded-md border px-3 text-left transition-colors ${
                            isCurrent
                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                : page.status === 'complete'
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                    : isMuted
                                        ? 'border-gray-200 bg-gray-100 text-gray-500 hover:bg-gray-200'
                                        : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                        }`}
                    >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                            {pageStatusIcon(page)}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold">{page.label}</span>
                            <span className={`block text-[11px] ${isCurrent ? 'text-white/75' : 'text-gray-500'}`}>
                                {index + 1} of {pages.length} - {pageStatusLabel(page)}
                            </span>
                        </span>
                    </button>
                );

                return (
                    <li key={page.id}>
                        {tooltip ? (
                            <Tooltip label={tooltip} multiline maw={280} withArrow>
                                {button}
                            </Tooltip>
                        ) : button}
                    </li>
                );
            })}
        </ol>
    </nav>
    );
};

type SimpleSetupPageFrameProps = {
    page: EventSetupPage;
    isFirstUsedPage: boolean;
    isLastUsedPage: boolean;
    onBack: () => void;
    onNext: () => void;
    onOpenControllerPage: (pageId: EventSetupPageId) => void;
    children: React.ReactNode;
};

export const SimpleSetupPageFrame = ({
    page,
    isFirstUsedPage,
    isLastUsedPage,
    onBack,
    onNext,
    onOpenControllerPage,
    children,
}: SimpleSetupPageFrameProps) => (
    <section aria-labelledby={`simple-setup-${page.id}-title`} className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
            <h2 id={`simple-setup-${page.id}-title`} className="text-xl font-semibold text-gray-950">
                {page.label}
            </h2>
        </div>
        <div className="min-h-72 p-5">
            {page.status === 'not-used' ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
                    <p className="font-semibold text-gray-900">This page is not used for the current setup.</p>
                    <p className="mt-1 text-sm text-gray-600">{page.unavailableReason}</p>
                    {page.controlledByPageId ? (
                        <button
                            type="button"
                            className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-800"
                            onClick={() => onOpenControllerPage(page.controlledByPageId!)}
                        >
                            Review the choice that controls this page
                        </button>
                    ) : null}
                </div>
            ) : children}
        </div>
        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-4">
            <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={isFirstUsedPage}
                onClick={onBack}
            >
                Back
            </button>
            <button
                type="button"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={onNext}
            >
                {isLastUsedPage ? 'Review event' : 'Next'}
            </button>
        </div>
    </section>
);
