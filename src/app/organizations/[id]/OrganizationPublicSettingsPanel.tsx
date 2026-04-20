'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Paper, SimpleGrid, Stack, Switch, Text, TextInput, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Organization } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { resolveClientPublicOrigin } from '@/lib/clientPublicOrigin';

type OrganizationPublicSettingsPanelProps = {
  organization: Organization;
  onUpdated: (organization: Organization) => void | Promise<void>;
};

const slugify = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '')
);

const splitDomains = (value: string): string[] => (
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
);

const buildIframeSnippet = (origin: string, slug: string, kind: string): string => (
  `<iframe src="${origin}/embed/${slug}/${kind}?limit=6" title="BracketIQ ${kind}" width="100%" height="640" style="border:0;max-width:100%;" loading="lazy"></iframe>`
);

const buildScriptSnippet = (origin: string, slug: string, kind: string): string => (
  `<div data-bracketiq-widget data-org="${slug}" data-kind="${kind}" data-limit="6"></div>\n<script async src="${origin}/embed.js"></script>`
);

export default function OrganizationPublicSettingsPanel({
  organization,
  onUpdated,
}: OrganizationPublicSettingsPanelProps) {
  const [publicSlug, setPublicSlug] = useState(organization.publicSlug ?? '');
  const [publicPageEnabled, setPublicPageEnabled] = useState(Boolean(organization.publicPageEnabled));
  const [publicWidgetsEnabled, setPublicWidgetsEnabled] = useState(Boolean(organization.publicWidgetsEnabled));
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(organization.brandPrimaryColor ?? '#0f766e');
  const [brandAccentColor, setBrandAccentColor] = useState(organization.brandAccentColor ?? '#f59e0b');
  const [publicHeadline, setPublicHeadline] = useState(organization.publicHeadline ?? `${organization.name} on BracketIQ`);
  const [publicIntroText, setPublicIntroText] = useState(
    organization.publicIntroText ?? 'Find upcoming events, teams, rentals, and products.',
  );
  const [embedAllowedDomains, setEmbedAllowedDomains] = useState((organization.embedAllowedDomains ?? []).join(', '));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPublicSlug(organization.publicSlug ?? '');
    setPublicPageEnabled(Boolean(organization.publicPageEnabled));
    setPublicWidgetsEnabled(Boolean(organization.publicWidgetsEnabled));
    setBrandPrimaryColor(organization.brandPrimaryColor ?? '#0f766e');
    setBrandAccentColor(organization.brandAccentColor ?? '#f59e0b');
    setPublicHeadline(organization.publicHeadline ?? `${organization.name} on BracketIQ`);
    setPublicIntroText(organization.publicIntroText ?? 'Find upcoming events, teams, rentals, and products.');
    setEmbedAllowedDomains((organization.embedAllowedDomains ?? []).join(', '));
  }, [organization]);

  const origin = useMemo(() => {
    const resolved = resolveClientPublicOrigin();
    if (resolved) {
      return resolved;
    }
    return typeof window !== 'undefined' ? window.location.origin : 'https://bracket-iq.com';
  }, []);

  const normalizedSlug = slugify(publicSlug);
  const publicPageUrl = normalizedSlug ? `${origin}/o/${normalizedSlug}` : '';
  const eventsIframeSnippet = normalizedSlug ? buildIframeSnippet(origin, normalizedSlug, 'events') : '';
  const allScriptSnippet = normalizedSlug ? buildScriptSnippet(origin, normalizedSlug, 'all') : '';

  const copySnippet = async (value: string, label: string) => {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
    notifications.show({ color: 'green', message: `${label} copied.` });
  };

  const handleSave = async () => {
    if (!organization.$id) {
      return;
    }
    setSaving(true);
    try {
      const updated = await organizationService.updateOrganization(organization.$id, {
        publicSlug: normalizedSlug || null,
        publicPageEnabled,
        publicWidgetsEnabled,
        brandPrimaryColor: brandPrimaryColor || null,
        brandAccentColor: brandAccentColor || null,
        publicHeadline,
        publicIntroText,
        embedAllowedDomains: splitDomains(embedAllowedDomains),
      });
      await onUpdated(updated);
      notifications.show({ color: 'green', message: 'Public page settings saved.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Failed to save public page settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="lg">
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={5}>Public page and widgets</Title>
            <Text size="sm" c="dimmed">
              Publish a branded organization page and embed BracketIQ widgets on client websites.
            </Text>
          </div>
          <Button onClick={handleSave} loading={saving}>Save</Button>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <TextInput
            label="Public slug"
            description="Used in /o/slug and /embed/slug URLs."
            value={publicSlug}
            onChange={(event) => setPublicSlug(slugify(event.currentTarget.value))}
            placeholder="scsoccer"
          />
          <Group align="end" gap="sm">
            <Button variant="default" onClick={() => setPublicSlug(slugify(organization.name))}>
              Generate from name
            </Button>
          </Group>
          <TextInput
            label="Primary color"
            value={brandPrimaryColor}
            onChange={(event) => setBrandPrimaryColor(event.currentTarget.value)}
            placeholder="#0f766e"
          />
          <TextInput
            label="Accent color"
            value={brandAccentColor}
            onChange={(event) => setBrandAccentColor(event.currentTarget.value)}
            placeholder="#f59e0b"
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="md">
          <Switch
            label="Enable public page"
            description={normalizedSlug ? publicPageUrl : 'Set a slug before enabling.'}
            checked={publicPageEnabled}
            onChange={(event) => setPublicPageEnabled(event.currentTarget.checked)}
          />
          <Switch
            label="Enable widgets"
            description="Allows iframe and script embeds."
            checked={publicWidgetsEnabled}
            onChange={(event) => setPublicWidgetsEnabled(event.currentTarget.checked)}
          />
        </SimpleGrid>

        <Textarea
          mt="md"
          label="Public headline"
          value={publicHeadline}
          onChange={(event) => setPublicHeadline(event.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Textarea
          mt="md"
          label="Public intro text"
          value={publicIntroText}
          onChange={(event) => setPublicIntroText(event.currentTarget.value)}
          autosize
          minRows={3}
        />
        <TextInput
          mt="md"
          label="Allowed embed domains"
          description="Optional comma-separated hostnames. Leave blank for broad embed testing."
          value={embedAllowedDomains}
          onChange={(event) => setEmbedAllowedDomains(event.currentTarget.value)}
          placeholder="example.com, www.example.com"
        />
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">Preview and snippets</Title>
        <Stack gap="sm">
          <Group>
            <Button component="a" href={publicPageUrl || '#'} target="_blank" rel="noreferrer" disabled={!publicPageUrl}>
              Open public page
            </Button>
            <Button
              component="a"
              href={normalizedSlug ? `${origin}/embed/${normalizedSlug}/events?limit=6` : '#'}
              target="_blank"
              rel="noreferrer"
              variant="default"
              disabled={!normalizedSlug}
            >
              Open events widget
            </Button>
          </Group>
          <Textarea label="Events iframe" value={eventsIframeSnippet} readOnly autosize minRows={3} />
          <Button variant="default" onClick={() => copySnippet(eventsIframeSnippet, 'Iframe snippet')} disabled={!eventsIframeSnippet}>
            Copy iframe snippet
          </Button>
          <Textarea label="All-in-one script" value={allScriptSnippet} readOnly autosize minRows={4} />
          <Button variant="default" onClick={() => copySnippet(allScriptSnippet, 'Script snippet')} disabled={!allScriptSnippet}>
            Copy script snippet
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
