import { Alert, Text } from '@mantine/core';

import type { Event } from '@/types';

import type { EventDivisionOption } from './divisionRegistration';
import {
    formatOfficialSchedulingModeLabel,
    formatReadOnlyValueList,
    type PublicDivisionGenderGroup,
} from './eventDetailPresentation';
import { PublicEventMetaPill, PublicEventSection } from './PublicEventPrimitives';

type ScheduleDateChip = {
    key: string;
    dayLabel: string;
    dateLabel: string;
};

type SchedulePreviewItem = {
    id: string;
    dateLabel: string;
    timeLabel: string;
    title: string;
    meta: string;
};

type PublicEventProgramDetailsProps = {
    allDivisionOptionCount: number;
    eligibleDivisionCount: number;
    divisionGroups: PublicDivisionGenderGroup[];
    registrationByDivisionType: boolean;
    selectedDivisionId?: string;
    selectedDivisionTypeKey?: string;
    onDivisionSelect: (division: EventDivisionOption) => void;
    supportsScheduleDetails: boolean;
    scheduleDateChips: ScheduleDateChip[];
    schedulePreviewItems: SchedulePreviewItem[];
    eventType: Event['eventType'];
    canViewStaffSection: boolean;
    sportLabel: string;
    hostedByLabel: string;
    assistantHostNames: string[];
    officialNames: string[];
    officialSchedulingMode?: Event['officialSchedulingMode'];
    officialPositionsSummary: string;
};

export function PublicEventProgramDetails({
    allDivisionOptionCount,
    eligibleDivisionCount,
    divisionGroups,
    registrationByDivisionType,
    selectedDivisionId,
    selectedDivisionTypeKey,
    onDivisionSelect,
    supportsScheduleDetails,
    scheduleDateChips,
    schedulePreviewItems,
    eventType,
    canViewStaffSection,
    sportLabel,
    hostedByLabel,
    assistantHostNames,
    officialNames,
    officialSchedulingMode,
    officialPositionsSummary,
}: PublicEventProgramDetailsProps) {
    const isSelected = (division: EventDivisionOption) => (
        registrationByDivisionType
            ? selectedDivisionTypeKey === division.divisionTypeKey
            : selectedDivisionId === division.id
    );

    return (
        <>
            {(allDivisionOptionCount > 0 || supportsScheduleDetails) ? (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start">
                    {allDivisionOptionCount > 0 ? (
                        <PublicEventSection title="Choices" className="xl:h-full">
                            {eligibleDivisionCount === 0 ? (
                                <Alert color="yellow" variant="light">
                                    No divisions are available for the selected registrant&apos;s age.
                                </Alert>
                            ) : (
                                <div className="divide-y divide-slate-200">
                                    {divisionGroups.map((genderGroup) => {
                                        const genderDivisionCount = genderGroup.ageGroups.reduce((count, ageGroup) => (
                                            count + ageGroup.skillGroups.reduce((skillCount, skillGroup) => skillCount + skillGroup.options.length, 0)
                                        ), 0);
                                        const genderHasSelected = genderGroup.ageGroups.some((ageGroup) => (
                                            ageGroup.skillGroups.some((skillGroup) => skillGroup.options.some(isSelected))
                                        ));
                                        return (
                                            <details
                                                key={genderGroup.key}
                                                className="group py-1"
                                                open={genderHasSelected || divisionGroups.length === 1}
                                            >
                                                <summary className="cursor-pointer py-2 text-base font-bold text-slate-950 marker:text-slate-400">
                                                    <span className="ml-1 inline-flex w-[calc(100%-1rem)] items-center justify-between gap-3 align-middle">
                                                        <span>{genderGroup.label}</span>
                                                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                                                            {genderDivisionCount}
                                                        </span>
                                                    </span>
                                                </summary>
                                                <div className="pb-2 pl-3">
                                                    {genderGroup.ageGroups.map((ageGroup) => {
                                                        const ageDivisionCount = ageGroup.skillGroups.reduce((count, skillGroup) => count + skillGroup.options.length, 0);
                                                        const ageHasSelected = ageGroup.skillGroups.some((skillGroup) => skillGroup.options.some(isSelected));
                                                        return (
                                                            <details
                                                                key={ageGroup.key}
                                                                className="border-t border-slate-100 py-1"
                                                                open={ageHasSelected || genderGroup.ageGroups.length === 1}
                                                            >
                                                                <summary className="cursor-pointer py-1.5 text-sm font-bold text-slate-800 marker:text-slate-400">
                                                                    <span className="ml-1 inline-flex w-[calc(100%-1rem)] items-center justify-between gap-3 align-middle">
                                                                        <span>{ageGroup.label}</span>
                                                                        <span className="text-xs font-bold text-slate-500">{ageDivisionCount}</span>
                                                                    </span>
                                                                </summary>
                                                                <div className="pb-2 pl-3">
                                                                    {ageGroup.skillGroups.map((skillGroup) => {
                                                                        const skillHasSelected = skillGroup.options.some(isSelected);
                                                                        return (
                                                                            <details
                                                                                key={skillGroup.key}
                                                                                className="border-t border-slate-100 py-1"
                                                                                open={skillHasSelected || ageGroup.skillGroups.length === 1}
                                                                            >
                                                                                <summary className="cursor-pointer py-1.5 text-sm font-bold text-slate-700 marker:text-slate-400">
                                                                                    <span className="ml-1 inline-flex w-[calc(100%-1rem)] items-center justify-between gap-3 align-middle">
                                                                                        <span>{skillGroup.label}</span>
                                                                                        <span className="text-xs font-bold text-slate-500">{skillGroup.options.length}</span>
                                                                                    </span>
                                                                                </summary>
                                                                                <div className="grid grid-cols-1 gap-2 pb-2 pl-3">
                                                                                    {skillGroup.options.map((division) => {
                                                                                        const selected = isSelected(division);
                                                                                        const displaySkillLabel = skillGroup.options.length > 1
                                                                                            ? division.name
                                                                                            : skillGroup.label;
                                                                                        return (
                                                                                            <button
                                                                                                key={division.id}
                                                                                                type="button"
                                                                                                aria-pressed={selected}
                                                                                                onClick={() => onDivisionSelect(division)}
                                                                                                className={`rounded-md border px-3 py-2.5 text-left transition ${
                                                                                                    selected
                                                                                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm'
                                                                                                        : 'border-slate-200 bg-white text-slate-900 hover:border-emerald-300 hover:bg-emerald-50/50'
                                                                                                }`}
                                                                                            >
                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                    <div>
                                                                                                        <Text fw={800}>{displaySkillLabel}</Text>
                                                                                                        <Text size="xs" c={selected ? 'green' : 'dimmed'}>{division.name}</Text>
                                                                                                    </div>
                                                                                                    {selected ? (
                                                                                                        <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs font-bold text-white">
                                                                                                            Current
                                                                                                        </span>
                                                                                                    ) : null}
                                                                                                </div>
                                                                                                {division.ageCutoffLabel ? (
                                                                                                    <Text size="xs" c="dimmed" className="mt-2">
                                                                                                        {division.ageCutoffLabel}
                                                                                                    </Text>
                                                                                                ) : null}
                                                                                            </button>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </details>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </details>
                                                        );
                                                    })}
                                                </div>
                                            </details>
                                        );
                                    })}
                                </div>
                            )}
                        </PublicEventSection>
                    ) : null}

                    {supportsScheduleDetails ? (
                        <PublicEventSection title="Timeline" className="xl:h-full">
                            <div className="space-y-5">
                                {scheduleDateChips.length > 0 ? (
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                        {scheduleDateChips.map((chip) => (
                                            <div key={chip.key} className="min-w-[76px] rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-emerald-950">
                                                <Text size="xs" fw={800} tt="uppercase" className="tracking-normal">{chip.dayLabel}</Text>
                                                <Text size="sm" fw={800}>{chip.dateLabel}</Text>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="divide-y divide-slate-200">
                                    {schedulePreviewItems.length === 0 ? (
                                        <Text size="sm" c="dimmed">No schedule preview is available yet.</Text>
                                    ) : schedulePreviewItems.map((item) => (
                                        <div key={item.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0">
                                            <div>
                                                <Text size="sm" fw={800} className="text-slate-950">{item.timeLabel}</Text>
                                                <Text size="xs" c="dimmed">{item.dateLabel}</Text>
                                            </div>
                                            <div className="min-w-0">
                                                <Text fw={800} className="truncate text-slate-950">{item.title}</Text>
                                                <Text size="sm" c="dimmed" className="truncate">{item.meta}</Text>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </PublicEventSection>
                    ) : null}
                </div>
            ) : null}

            {(eventType === 'LEAGUE' || canViewStaffSection) ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {eventType === 'LEAGUE' ? (
                        <PublicEventSection eyebrow="Format" title="League Scoring Rules" className="h-full">
                            <PublicEventMetaPill label="Scoring profile" value={sportLabel || 'Default'} />
                        </PublicEventSection>
                    ) : null}
                    {canViewStaffSection ? (
                        <PublicEventSection eyebrow="Operations" title="Staff" className="h-full">
                            <div className="grid grid-cols-1 gap-3">
                                <PublicEventMetaPill label="Primary host" value={hostedByLabel} />
                                <PublicEventMetaPill label="Assistant hosts" value={formatReadOnlyValueList(assistantHostNames, 'No assistant hosts assigned')} />
                                <PublicEventMetaPill label="Officials" value={formatReadOnlyValueList(officialNames, 'No officials assigned')} />
                                <PublicEventMetaPill label="Staffing mode" value={formatOfficialSchedulingModeLabel(officialSchedulingMode)} />
                                <PublicEventMetaPill label="Official positions" value={officialPositionsSummary} />
                            </div>
                        </PublicEventSection>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}
