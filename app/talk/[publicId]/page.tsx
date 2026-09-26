import { PublicAgentExperience } from '@/components/public-agent-experience';
import '../../public-agent.css';
export const metadata = { title: 'Company AI assistant', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function PublicAgentPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <PublicAgentExperience publicId={publicId} />;
}
