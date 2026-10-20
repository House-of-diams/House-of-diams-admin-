import { redirect } from 'next/navigation'

// HOD-019: the old editor here never saved. The live editor is under Support.
export default function AnnouncementPage() {
  redirect('/dashboard/cms/support/announcement-bar')
}
