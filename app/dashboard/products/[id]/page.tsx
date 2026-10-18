import { ProductForm } from '@/components/product-form'

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="p-8">
      <ProductForm productId={id} />
    </div>
  )
}
