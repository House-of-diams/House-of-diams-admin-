import { redirect } from 'next/navigation'

export default async function BespokeSubmissionsPage() {
  redirect('/dashboard/enquiries?tab=bespoke')
}
