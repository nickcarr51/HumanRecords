import { UploadForm } from '@/components';
import { requireLabelMember } from '@/lib/auth/role';

export default async function AdminUploadPage() {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();
  return <UploadForm />;
}
