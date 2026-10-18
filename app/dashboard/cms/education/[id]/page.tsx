import { EducationEditorPage } from '@/components/education-editor-page'

export default async function EditEducationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EducationEditorPage mode="edit" id={id} />
}
