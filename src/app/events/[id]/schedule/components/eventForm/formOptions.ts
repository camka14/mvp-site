import type { Sport, TemplateDocument } from '@/types';
import { getRequiredSignerTypeLabel } from '@/lib/templateSignerTypes';

export type SelectOption = {
    value: string;
    label: string;
};

export const buildSportOptions = (sports: Sport[]): SelectOption[] => (
    sports.map((sport) => ({ value: sport.$id, label: sport.name }))
);

export const buildTemplateOptions = (templates: TemplateDocument[]): SelectOption[] => (
    templates.map((template) => {
        const templateType = template.type ?? 'PDF';
        const signerLabel = getRequiredSignerTypeLabel(template.requiredSignerType);
        return {
            value: template.$id,
            label: `${template.title || 'Untitled Template'} (${templateType}, ${signerLabel})`,
        };
    })
);
