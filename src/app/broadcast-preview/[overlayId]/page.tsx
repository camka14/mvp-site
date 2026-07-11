import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import BroadcastOverlayRenderer from '@/components/broadcast/BroadcastOverlayRenderer';
import { prisma } from '@/lib/prisma';
import { parseBroadcastOverlayConfig, parseMatchPresentationState } from '@/server/broadcast/schemas';
import { resolveRazumlyAdminFromToken } from '@/server/razumlyAdmin';

export const dynamic = 'force-dynamic';

export default async function BroadcastPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ overlayId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const [token, { overlayId }, query] = await Promise.all([
    (await cookies()).get('auth_token')?.value ?? null,
    params,
    searchParams,
  ]);
  const { status } = await resolveRazumlyAdminFromToken(token);
  if (!status.allowed) redirect('/login');

  const [overlay, state] = await Promise.all([
    prisma.broadcastOverlays.findFirst({ where: { id: overlayId, archivedAt: null } }),
    prisma.broadcastOverlayStates.findUnique({ where: { overlayId } }),
  ]);
  if (!overlay || !state) redirect('/admin');
  const showLive = query.mode === 'live';
  const config = parseBroadcastOverlayConfig(showLive && overlay.publishedConfig ? overlay.publishedConfig : overlay.draftConfig);
  return <BroadcastOverlayRenderer config={config} state={parseMatchPresentationState(state.presentationState)} preview />;
}
