import { redirect } from 'next/navigation'

export default async function ContactSubmissionsPage() {
  redirect('/dashboard/enquiries?tab=contact')
}
