'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Group, Modal, Paper, Stack, Text } from '@mantine/core';

export interface EventQrCodeModalProps {
  eventId: string;
  eventName: string;
  eventUrl: string;
  organizationLogoId?: string | null;
  opened: boolean;
  onClose: () => void;
}

const sanitizeFilenamePart = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'event';
};

export const buildEventPublicUrl = (eventId: string): string => {
  const path = `/events/${encodeURIComponent(eventId)}`;
  if (typeof window === 'undefined') {
    return path;
  }
  return new URL(path, window.location.origin).toString();
};

export function EventQrCodeModal({
  eventId,
  eventName,
  eventUrl,
  organizationLogoId,
  opened,
  onClose,
}: EventQrCodeModalProps) {
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const logoCacheKey = useMemo(() => {
    const normalizedLogoId = typeof organizationLogoId === 'string' ? organizationLogoId.trim() : '';
    return normalizedLogoId || 'biq';
  }, [organizationLogoId]);
  const qrImageUrl = useMemo(
    () => `/api/events/${encodeURIComponent(eventId)}/qr?brand=event&logo=${encodeURIComponent(logoCacheKey)}`,
    [eventId, logoCacheKey],
  );
  const downloadFilename = useMemo(
    () => `${sanitizeFilenamePart(eventName)}-qr-code.png`,
    [eventName],
  );

  useEffect(() => {
    if (!opened) {
      setActionMessage(null);
      setIsSharing(false);
    }
  }, [opened]);

  const fetchQrImageBlob = useCallback(async (): Promise<Blob> => {
    const response = await fetch(qrImageUrl, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`QR request failed with ${response.status}`);
    }
    return response.blob();
  }, [qrImageUrl]);

  const copyLink = useCallback(async () => {
    if (!eventUrl) {
      setActionMessage('Event link is unavailable.');
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setActionMessage('Clipboard copy is unavailable in this browser.');
      return;
    }
    await navigator.clipboard.writeText(eventUrl);
    setActionMessage('Event link copied.');
  }, [eventUrl]);

  const downloadQrCode = useCallback(async () => {
    try {
      const blob = await fetchQrImageBlob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = downloadFilename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setActionMessage('QR code downloaded.');
    } catch (error) {
      console.error('Failed to download event QR code:', error);
      setActionMessage('Could not download the QR code.');
    }
  }, [downloadFilename, fetchQrImageBlob]);

  const shareQrCode = useCallback(async () => {
    setIsSharing(true);
    try {
      const blob = await fetchQrImageBlob();
      const file = new File([blob], downloadFilename, { type: blob.type || 'image/png' });
      const shareData: ShareData = {
        files: [file],
        title: `${eventName} QR code`,
      };
      const canShareFile = navigator.canShare?.(shareData) ?? Boolean(navigator.share);
      if (!navigator.share || !canShareFile) {
        setActionMessage('Image sharing is unavailable in this browser.');
        return;
      }
      await navigator.share(shareData);
      setActionMessage('QR code shared.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to share event QR code:', error);
      setActionMessage('Could not share the QR code.');
    } finally {
      setIsSharing(false);
    }
  }, [downloadFilename, eventName, fetchQrImageBlob]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Event QR Code"
      centered
      size="sm"
    >
      <Stack gap="md">
        <Paper withBorder p="md" radius="md" ta="center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl}
            alt={`QR code for ${eventName}`}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 320,
              height: 'auto',
              margin: '0 auto',
            }}
          />
        </Paper>
        <Stack gap={4} visibleFrom="sm">
          <Text fw={600}>{eventName}</Text>
          <Text size="sm" c="dimmed" style={{ wordBreak: 'break-all' }}>
            {eventUrl}
          </Text>
        </Stack>
        {actionMessage && (
          <Text size="sm" c="dimmed">
            {actionMessage}
          </Text>
        )}
        <Group justify="flex-end" visibleFrom="sm">
          <Button variant="default" onClick={copyLink}>
            Copy link
          </Button>
          <Button onClick={downloadQrCode}>
            Download PNG
          </Button>
        </Group>
        <Button hiddenFrom="sm" fullWidth onClick={shareQrCode} loading={isSharing}>
          Share
        </Button>
      </Stack>
    </Modal>
  );
}
