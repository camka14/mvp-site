import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
} from '@mantine/core';

import PaymentModal, { type PaymentEventSummary } from '@/components/ui/PaymentModal';
import type { SignStep } from '@/lib/boldsignService';
import type { PaymentIntent } from '@/types';

export type RentalCheckoutModalsProps = {
  paymentOpen: boolean;
  paymentData: PaymentIntent | null;
  paymentEvent: PaymentEventSummary;
  onPaymentClose: () => void;
  onPaymentSuccess: () => Promise<void> | void;
  signOpen: boolean;
  signLink: SignStep | null;
  signIndex: number;
  signLinkCount: number;
  signError: string | null;
  confirmingSignature: boolean;
  textAccepted: boolean;
  recordingSignature: boolean;
  onSignClose: () => void;
  onTextAcceptedChange: (accepted: boolean) => void;
  onTextAcceptance: () => Promise<void> | void;
  onSignedDocument: () => Promise<void> | void;
};

export default function RentalCheckoutModals({
  paymentOpen,
  paymentData,
  paymentEvent,
  onPaymentClose,
  onPaymentSuccess,
  signOpen,
  signLink,
  signIndex,
  signLinkCount,
  signError,
  confirmingSignature,
  textAccepted,
  recordingSignature,
  onSignClose,
  onTextAcceptedChange,
  onTextAcceptance,
  onSignedDocument,
}: RentalCheckoutModalsProps) {
  return (
    <>
      <PaymentModal
        isOpen={paymentOpen}
        onClose={onPaymentClose}
        event={paymentEvent}
        paymentData={paymentData}
        onPaymentSuccess={onPaymentSuccess}
      />
      <Modal
        opened={signOpen}
        onClose={onSignClose}
        title="Sign Rental Document"
        size="xl"
        centered
      >
        <Stack gap="sm">
          {signLink ? (
            <>
              <Text size="sm" c="dimmed">
                Document {signIndex + 1} of {signLinkCount}
                {signLink.title ? ` \u2022 ${signLink.title}` : ''}
              </Text>
              {signLink.requiredSignerLabel ? (
                <Text size="sm" c="dimmed">
                  Required signer: {signLink.requiredSignerLabel}
                </Text>
              ) : null}
              {signError ? (
                <Alert color="red">
                  {signError}
                </Alert>
              ) : null}
              {confirmingSignature ? (
                <Group gap="xs">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    Confirming signature...
                  </Text>
                </Group>
              ) : null}
              {signLink.type === 'TEXT' ? (
                <>
                  <Paper withBorder p="sm" radius="md" style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {signLink.content || 'No document content provided.'}
                    </Text>
                  </Paper>
                  <Checkbox
                    checked={textAccepted}
                    onChange={(event) => onTextAcceptedChange(event.currentTarget.checked)}
                    label="I have read and agree to this document."
                  />
                  <Group justify="flex-end">
                    <Button
                      onClick={onTextAcceptance}
                      disabled={!textAccepted || recordingSignature}
                      loading={recordingSignature}
                    >
                      Accept And Continue
                    </Button>
                  </Group>
                </>
              ) : (
                <>
                  {signLink.url ? (
                    <iframe
                      title={`Rental document ${signLink.title ?? signLink.templateId}`}
                      src={signLink.url}
                      className="h-[480px] w-full rounded border"
                    />
                  ) : (
                    <Alert color="red">
                      This document is missing a signing link. Close checkout and try again.
                    </Alert>
                  )}
                  <Group justify="space-between">
                    {signLink.url ? (
                      <Button
                        component="a"
                        href={signLink.url}
                        target="_blank"
                        rel="noreferrer"
                        variant="default"
                      >
                        Open In New Tab
                      </Button>
                    ) : (
                      <div />
                    )}
                    <Button
                      onClick={onSignedDocument}
                      disabled={!signLink.documentId || recordingSignature}
                      loading={recordingSignature}
                    >
                      I Finished Signing
                    </Button>
                  </Group>
                </>
              )}
            </>
          ) : (
            <Text size="sm" c="dimmed">Preparing rental document...</Text>
          )}
        </Stack>
      </Modal>
    </>
  );
}
