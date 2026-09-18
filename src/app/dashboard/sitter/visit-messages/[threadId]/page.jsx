import { coveragePageThread } from '@/lib/messaging/coverageServer';
import CoverageThread from '@/components/messaging/CoverageThread';
export const dynamic = 'force-dynamic';
export default async function Page({ params }) {
  const { threadId } = await params;
  const thread = await coveragePageThread({ role: 'SITTER', threadId });
  return <CoverageThread thread={thread} operator={false}/>;
}
