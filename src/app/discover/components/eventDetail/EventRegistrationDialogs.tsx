import {
    Alert,
    Button,
    Checkbox,
    Group,
    Modal,
    Paper,
    PasswordInput,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';

import type { SignStep } from '@/lib/boldsignService';
import type { DiscountPreview } from '@/lib/paymentService';
import type { RegistrationQuestion } from '@/types';
import { formatPrice } from '@/types';
import { formatPaymentPlanPreviewPrice } from './divisionRegistration';

const REGISTRATION_DIALOG_Z_INDEX = 2000;

export type PaymentPlanPreviewRow = {
    id: string;
    installmentNumber: number;
    amountCents: number;
    dueDateLabel: string;
};

type RegistrationQuestionsDialogProps = {
    opened: boolean;
    questions: RegistrationQuestion[];
    answers: Record<string, string>;
    error: string | null;
    submitting: boolean;
    onAnswerChange: (questionId: string, value: string) => void;
    onClose: () => void;
    onSubmit: () => void | Promise<void>;
};

export function RegistrationQuestionsDialog({
    opened,
    questions,
    answers,
    error,
    submitting,
    onAnswerChange,
    onClose,
    onSubmit,
}: RegistrationQuestionsDialogProps) {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            centered
            size="lg"
            title="Registration questions"
            zIndex={REGISTRATION_DIALOG_Z_INDEX}
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void onSubmit();
                }}
            >
                <Stack gap="sm">
                    {questions.length > 0 ? (
                        <Stack gap="md">
                            {questions.map((question) => (
                                <Textarea
                                    key={question.id}
                                    label={question.prompt}
                                    required={Boolean(question.required)}
                                    autosize
                                    minRows={question.answerType === 'LONG_TEXT' ? 4 : 2}
                                    value={answers[question.id] ?? ''}
                                    onChange={(event) => onAnswerChange(question.id, event.currentTarget.value)}
                                />
                            ))}
                        </Stack>
                    ) : (
                        <Text size="sm" c="dimmed">
                            Continue to finish registration.
                        </Text>
                    )}
                    {error ? (
                        <Alert color="red" variant="light">
                            {error}
                        </Alert>
                    ) : null}
                    <Group justify="flex-end" wrap="wrap">
                        <Button variant="default" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={submitting}>
                            Continue
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}

type PaymentPlanPreviewDialogProps = {
    opened: boolean;
    ownerLabel: string;
    divisionName?: string | null;
    totalPriceCents: number;
    rows: PaymentPlanPreviewRow[];
    onClose: () => void;
    onContinue: () => void;
};

export function PaymentPlanPreviewDialog({
    opened,
    ownerLabel,
    divisionName,
    totalPriceCents,
    rows,
    onClose,
    onContinue,
}: PaymentPlanPreviewDialogProps) {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            centered
            title="Payment plan preview"
            zIndex={REGISTRATION_DIALOG_Z_INDEX}
        >
            <Stack gap="sm">
                <Text size="sm" c="dimmed">
                    Continuing will join this event and start a payment plan for {ownerLabel}.
                </Text>
                {divisionName ? (
                    <Text size="xs" c="dimmed">
                        Division: {divisionName}
                    </Text>
                ) : null}
                <Paper withBorder p="sm" radius="md">
                    <Group justify="space-between" align="center">
                        <Text fw={600}>Plan total</Text>
                        <Text fw={700}>{formatPaymentPlanPreviewPrice(totalPriceCents)}</Text>
                    </Group>
                </Paper>
                {rows.length > 0 ? (
                    <Paper withBorder p="sm" radius="md" className="space-y-2">
                        {rows.map((row) => (
                            <Group key={row.id} justify="space-between" align="flex-start" gap="xs">
                                <div>
                                    <Text size="sm" fw={500}>
                                        Installment {row.installmentNumber}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Due {row.dueDateLabel}
                                    </Text>
                                </div>
                                <Text size="sm" fw={600}>
                                    {formatPaymentPlanPreviewPrice(row.amountCents)}
                                </Text>
                            </Group>
                        ))}
                    </Paper>
                ) : (
                    <Alert color="yellow" variant="light">
                        No installment schedule was configured. The plan will be created with event-level defaults.
                    </Alert>
                )}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={onContinue}>
                        Continue with Payment Plan
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

type PasswordConfirmationDialogProps = {
    opened: boolean;
    password: string;
    error: string | null;
    loading: boolean;
    onPasswordChange: (password: string) => void;
    onClose: () => void;
    onSubmit: () => void | Promise<void>;
};

export function PasswordConfirmationDialog({
    opened,
    password,
    error,
    loading,
    onPasswordChange,
    onClose,
    onSubmit,
}: PasswordConfirmationDialogProps) {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            centered
            title="Confirm your password"
            zIndex={REGISTRATION_DIALOG_Z_INDEX}
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void onSubmit();
                }}
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        Please confirm your password before signing required documents.
                    </Text>
                    <PasswordInput
                        label="Password"
                        value={password}
                        onChange={(event) => onPasswordChange(event.currentTarget.value)}
                        error={error ?? undefined}
                        required
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={loading} disabled={!password.trim()}>
                            Continue
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}

type SigningDialogProps = {
    opened: boolean;
    signLinks: SignStep[];
    currentIndex: number;
    textAccepted: boolean;
    recording: boolean;
    onTextAcceptedChange: (accepted: boolean) => void;
    onAcceptText: () => void | Promise<void>;
    onFinishedSigning: () => void | Promise<void>;
    onClose: () => void;
};

export function SigningDialog({
    opened,
    signLinks,
    currentIndex,
    textAccepted,
    recording,
    onTextAcceptedChange,
    onAcceptText,
    onFinishedSigning,
    onClose,
}: SigningDialogProps) {
    const currentLink = signLinks[currentIndex];

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            centered
            size="xl"
            title="Sign required documents"
            zIndex={REGISTRATION_DIALOG_Z_INDEX}
        >
            {currentLink ? (
                <div>
                    <Text size="sm" c="dimmed" mb="xs">
                        Document {currentIndex + 1} of {signLinks.length}
                        {currentLink.title ? ` • ${currentLink.title}` : ''}
                    </Text>
                    {currentLink.requiredSignerLabel ? (
                        <Text size="xs" c="dimmed" mb="xs">
                            Required signer: {currentLink.requiredSignerLabel}
                        </Text>
                    ) : null}
                    {currentLink.type === 'TEXT' ? (
                        <Stack gap="sm">
                            <Paper withBorder p="md" style={{ maxHeight: 420, overflowY: 'auto' }}>
                                <Text style={{ whiteSpace: 'pre-wrap' }}>
                                    {currentLink.content || 'No waiver text provided.'}
                                </Text>
                            </Paper>
                            <Checkbox
                                label="I agree to the waiver above."
                                checked={textAccepted}
                                onChange={(event) => onTextAcceptedChange(event.currentTarget.checked)}
                            />
                            <Group justify="flex-end">
                                <Button
                                    onClick={() => { void onAcceptText(); }}
                                    loading={recording}
                                    disabled={!textAccepted || recording}
                                >
                                    Accept and continue
                                </Button>
                            </Group>
                        </Stack>
                    ) : (
                        <Stack gap="xs">
                            <div style={{ height: 600 }}>
                                <iframe
                                    src={currentLink.url}
                                    title="BoldSign Signing"
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                />
                            </div>
                            <Group justify="flex-end">
                                <Button
                                    variant="default"
                                    onClick={() => { void onFinishedSigning(); }}
                                    loading={recording}
                                    disabled={recording}
                                >
                                    I finished signing
                                </Button>
                            </Group>
                        </Stack>
                    )}
                </div>
            ) : (
                <Text size="sm" c="dimmed">Preparing documents...</Text>
            )}
        </Modal>
    );
}

type CheckoutPreviewDialogProps = {
    opened: boolean;
    originalPriceCents: number;
    discountCode: string;
    discountPreview: DiscountPreview | null;
    discountPreviewLoading: boolean;
    discountPreviewError: string | null;
    checkoutError: string | null;
    joining: boolean;
    onDiscountCodeChange: (code: string) => void;
    onClearDiscount: () => void;
    onApplyDiscount: () => void | Promise<void>;
    onCheckout: () => void | Promise<void>;
    onClose: () => void;
};

export function CheckoutPreviewDialog({
    opened,
    originalPriceCents,
    discountCode,
    discountPreview,
    discountPreviewLoading,
    discountPreviewError,
    checkoutError,
    joining,
    onDiscountCodeChange,
    onClearDiscount,
    onApplyDiscount,
    onCheckout,
    onClose,
}: CheckoutPreviewDialogProps) {
    const normalizedCode = discountCode.trim();
    const appliedCode = discountPreview?.code?.trim() ?? '';
    const canContinueWithDiscount = !normalizedCode
        || normalizedCode.toUpperCase() === appliedCode.toUpperCase();

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            centered
            title="Checkout preview"
            zIndex={REGISTRATION_DIALOG_Z_INDEX}
        >
            <Stack gap="sm">
                <Text size="sm" c="dimmed">
                    Review the registration price before checkout. Add a discount code here if you have one.
                </Text>
                <Paper withBorder radius="md" p="sm" className="space-y-2">
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Original price</Text>
                        <Text size="sm" fw={700}>
                            {formatPrice(discountPreview?.originalAmountCents ?? originalPriceCents)}
                        </Text>
                    </Group>
                    {discountPreview ? (
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">Discount</Text>
                            <Text size="sm" fw={700} c="green">
                                -{formatPrice(discountPreview.discountAmountCents)}
                            </Text>
                        </Group>
                    ) : null}
                    <Group justify="space-between">
                        <Text size="sm" fw={800}>New price</Text>
                        <Text size="lg" fw={900}>
                            {formatPrice(discountPreview?.discountedAmountCents ?? originalPriceCents)}
                        </Text>
                    </Group>
                </Paper>
                <TextInput
                    label="Discount code"
                    placeholder="Enter code"
                    value={discountCode}
                    onChange={(event) => onDiscountCodeChange(event.currentTarget.value)}
                />
                {discountPreviewError ? (
                    <Alert color="red" variant="light">
                        {discountPreviewError}
                    </Alert>
                ) : null}
                {checkoutError ? (
                    <Alert color="red" variant="light">
                        {checkoutError}
                    </Alert>
                ) : null}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClearDiscount}>
                        Clear
                    </Button>
                    <Button
                        variant="light"
                        loading={discountPreviewLoading}
                        disabled={!discountCode.trim()}
                        onClick={() => { void onApplyDiscount(); }}
                    >
                        Apply
                    </Button>
                    <Button
                        loading={joining}
                        disabled={!canContinueWithDiscount}
                        onClick={() => { void onCheckout(); }}
                    >
                        Checkout
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
