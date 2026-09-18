import { redirect } from 'next/navigation';
import { coveragePageThread } from '@/lib/messaging/coverageServer';
export const dynamic = 'force-dynamic';
export default async function Page({ params }) {
  const { visitId } = await params;
  const thread = await coveragePageThread({ role: 'OPERATOR', visitId });
  redirect(`/dashboard/operator/messages/${thread.id}`);
}
