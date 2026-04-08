'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Group, Loader, Modal, Stack, Text, TextInput } from '@mantine/core';
import { billingAddressService } from '@/lib/billingAddressService';
import type { BillingAddress } from '@/types';

const EMPTY_BILLING_ADDRESS: BillingAddress = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  countryCode: 'US',
};

const normalizeBillingAddress = (value?: BillingAddress | null): BillingAddress => ({
  line1: value?.line1 ?? '',
  line2: value?.line2 ?? '',
  city: value?.city ?? '',
  state: value?.state ?? '',
  postalCode: value?.postalCode ?? '',
  countryCode: value?.countryCode ?? 'US',
});

type BillingAddressModalProps = {
  opened: boolean;
  onClose: () => void;
  onSaved: (billingAddress: BillingAddress) => Promise<void> | void;
  title?: string;
  description?: string;
};

export default function BillingAddressModal({
  opened,
  onClose,
  onSaved,
  title = 'Billing Address Required',
  description = 'Enter your billing address so tax and payment totals can be calculated.',
}: BillingAddressModalProps) {
  const [billingAddress, setBillingAddress] = useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    billingAddressService.getBillingAddressProfile()
      .then((profile) => {
        if (!cancelled) {
          setBillingAddress(normalizeBillingAddress(profile.billingAddress));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          console.error('Failed to load billing address profile', loadError);
          setBillingAddress(EMPTY_BILLING_ADDRESS);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [opened]);

  const updateField = (field: keyof BillingAddress, value: string) => {
    setBillingAddress((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const validate = (): string | null => {
    if (!billingAddress.line1.trim()) return 'Address line 1 is required.';
    if (!billingAddress.city.trim()) return 'City is required.';
    if (!billingAddress.state.trim()) return 'State is required.';
    if (!billingAddress.postalCode.trim()) return 'ZIP code is required.';
    if (!billingAddress.countryCode.trim()) return 'Country is required.';
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    const normalized = {
      ...billingAddress,
      line1: billingAddress.line1.trim(),
      line2: billingAddress.line2?.trim() || '',
      city: billingAddress.city.trim(),
      state: billingAddress.state.trim().toUpperCase(),
      postalCode: billingAddress.postalCode.trim(),
      countryCode: billingAddress.countryCode.trim().toUpperCase(),
    };

    try {
      await billingAddressService.saveBillingAddress(normalized);
      await onSaved(normalized);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save billing address.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">{description}</Text>
        {error ? <Alert color="red" variant="light">{error}</Alert> : null}
        {loading ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : (
          <>
            <TextInput
              label="Address line 1"
              value={billingAddress.line1}
              onChange={(event) => updateField('line1', event.currentTarget.value)}
              required
            />
            <TextInput
              label="Address line 2"
              value={billingAddress.line2 ?? ''}
              onChange={(event) => updateField('line2', event.currentTarget.value)}
            />
            <TextInput
              label="City"
              value={billingAddress.city}
              onChange={(event) => updateField('city', event.currentTarget.value)}
              required
            />
            <Group grow align="flex-start">
              <TextInput
                label="State"
                value={billingAddress.state}
                onChange={(event) => updateField('state', event.currentTarget.value)}
                required
              />
              <TextInput
                label="ZIP code"
                value={billingAddress.postalCode}
                onChange={(event) => updateField('postalCode', event.currentTarget.value)}
                required
              />
            </Group>
            <TextInput
              label="Country"
              value={billingAddress.countryCode}
              onChange={(event) => updateField('countryCode', event.currentTarget.value)}
              required
            />
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={loading}>
            Save billing address
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
