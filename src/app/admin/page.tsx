import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminConstantsClient from './AdminConstantsClient';
import { resolveRazumlyAdminFromToken } from '@/server/razumlyAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const token = (await cookies()).get('auth_token')?.value ?? null;
  const { session, status } = await resolveRazumlyAdminFromToken(token);

  if (!session) {
    redirect('/login');
  }
  if (!status.allowed) {
    redirect('/discover');
  }

  return <AdminConstantsClient initialAdminEmail={status.email ?? ''} />;
}
