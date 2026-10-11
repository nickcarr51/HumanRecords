import type { Metadata } from 'next';
import { UploadForm } from '@/components';
import { requireLabelMember } from '@/lib/auth/role';

export const metadata: Metadata = { title: 'Admin · Upload' };

export default async function AdminUploadPage() {
  // Layouts don't re-run on client navigation; the page must gate itself.
  await requireLabelMember();
  return <UploadForm />;
}
