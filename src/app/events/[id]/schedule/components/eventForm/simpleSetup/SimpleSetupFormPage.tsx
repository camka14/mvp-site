'use client';

import type { EventFormSectionsProps } from '../sections/EventFormSections';
import { SimpleSetupBasicsPage } from './SimpleSetupBasicsPage';
import { SimpleSetupDivisionsPage } from './SimpleSetupDivisionsPage';
import { SimpleSetupDocumentsPage } from './SimpleSetupDocumentsPage';
import { SimpleSetupPricingRegistrationPage } from './SimpleSetupPricingRegistrationPage';
import { SimpleSetupScheduleLocationPage } from './SimpleSetupScheduleLocationPage';
import { SimpleSetupStaffOperationsPage } from './SimpleSetupStaffOperationsPage';
import type {
    EventSetupChoices,
    EventSetupPageId,
} from './types';

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };

type SimpleSetupFormPageProps = {
    pageId: EventSetupPageId;
    choices: EventSetupChoices;
    model: EventFormSectionsProps;
};

export const SimpleSetupFormPage = ({
    pageId,
    choices,
    model,
}: SimpleSetupFormPageProps) => {
    if (pageId === 'basics') {
        return <SimpleSetupBasicsPage model={model} />;
    }
    if (pageId === 'divisions') {
        return <SimpleSetupDivisionsPage model={model} />;
    }
    if (pageId === 'schedule-location') {
        return (
            <SimpleSetupScheduleLocationPage
                model={model}
                scheduleStyle={choices.scheduleStyle}
            />
        );
    }
    if (pageId === 'pricing-registration') {
        return (
            <SimpleSetupPricingRegistrationPage
                model={model}
                paidRegistration={choices.paidRegistration}
            />
        );
    }
    if (pageId === 'documents-questions') {
        const { questionActions } = model.sectionsController;
        return (
            <SimpleSetupDocumentsPage
                control={model.control}
                templatesLoading={model.templates.loading}
                templatesError={model.templates.error}
                templateOrganizationId={model.templates.organizationId}
                templateOptions={model.templates.options}
                comboboxProps={sharedComboboxProps}
                showDocuments={choices.useRequiredDocuments}
                showQuestions={choices.useRegistrationQuestions}
                questions={model.registrationQuestions.drafts}
                questionsLoading={model.registrationQuestions.loading}
                questionsError={model.registrationQuestions.error}
                onAddQuestion={questionActions.addQuestion}
                onPromptChange={questionActions.changePrompt}
                onRequiredChange={questionActions.changeRequired}
                onRemoveQuestion={questionActions.removeQuestion}
                isImmutableField={model.isImmutableField}
            />
        );
    }
    if (pageId === 'staff-operations') {
        return <SimpleSetupStaffOperationsPage model={model} choices={choices} />;
    }

    return null;
};
