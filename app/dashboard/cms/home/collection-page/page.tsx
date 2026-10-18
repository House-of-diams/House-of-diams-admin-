import { redirect } from 'next/navigation'

export default function LegacyCollectionPageSettingsRedirect() {
  redirect('/dashboard/cms/collection')
}
