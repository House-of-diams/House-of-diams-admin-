import { redirect } from 'next/navigation'

// HOD-019: the old gallery editor here never saved. Bespoke content is edited on the Bespoke CMS page.
export default function BespokeGalleryPage() {
  redirect('/dashboard/cms/bespoke')
}
