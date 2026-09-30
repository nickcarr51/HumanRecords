import { Heading, Text } from '@/components';
import { requireLabelMember } from '@/lib/auth/role';
import { ActionCard, Back, Page } from './admin.styles';

export default async function AdminPage() {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();
  return (
    <Page>
      <Back href="/feed">‹ timeline</Back>
      <Heading $level={2}>Admin</Heading>
      <ActionCard href="/admin/upload">
        <Heading $level={3}>Upload a release</Heading>
        <Text $variant="muted">Publish a single or an album to the timeline.</Text>
      </ActionCard>
    </Page>
  );
}
