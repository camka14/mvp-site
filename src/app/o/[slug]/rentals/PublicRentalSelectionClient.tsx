'use client';

import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useApp } from '@/app/providers';
import FieldsTabContent from '@/app/organizations/[id]/FieldsTabContent';
import RentalReservationCheckout from '@/components/rentals/RentalReservationCheckout';
import type { Organization } from '@/types';

type PublicRentalSelectionClientProps = {
  slug: string;
  organization: Organization;
};

export default function PublicRentalSelectionClient({ slug, organization }: PublicRentalSelectionClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useApp();
  const returnHref = `/o/${encodeURIComponent(slug)}`;
  const fieldsCount = organization.fields?.length ?? 0;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Text size="sm" c="dimmed">Rental selection</Text>
          <Title order={1}>{organization.name}</Title>
          <Text c="dimmed">Select field rental times, then sign and pay to reserve them.</Text>
        </div>

        {!authLoading && !user ? (
          <Alert color="yellow" title="Sign in required">
            <Group justify="space-between" align="center">
              <Text size="sm">Sign in before ordering a rental or creating a BracketIQ event from a rental.</Text>
              <Button size="sm" onClick={() => router.push('/login')}>Sign in</Button>
            </Group>
          </Alert>
        ) : null}

        <RentalReservationCheckout
          organization={organization}
          rentalOrderSlug={slug}
          currentUser={user}
        >
          {({ onRentalSelectionReady }) => (
            <>
              {fieldsCount === 0 ? (
                <Alert color="yellow" title="No rentals available">
                  This organization does not have public rental slots available right now.
                </Alert>
              ) : null}

              <FieldsTabContent
                organization={organization}
                organizationId={organization.$id}
                currentUser={user}
                backHref={returnHref}
                backLabel="Back to organization"
                primaryActionLabel="Reserve resources"
                onRentalSelectionReady={onRentalSelectionReady}
              />
            </>
          )}
        </RentalReservationCheckout>
      </Stack>
    </Container>
  );
}
