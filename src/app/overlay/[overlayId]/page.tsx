import ProgramOverlayClient from '@/components/broadcast/ProgramOverlayClient';

export const dynamic = 'force-dynamic';

export default async function ProgramOverlayPage({ params }: { params: Promise<{ overlayId: string }> }) {
  const { overlayId } = await params;
  return <ProgramOverlayClient overlayId={overlayId} />;
}
