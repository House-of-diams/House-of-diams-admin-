import { ProductForm } from '@/components/product-form'
import { getProductFormBasicsBootstrap } from '../../products/product-form-bootstrap'

export default async function CreateCollectionProductPage() {
  const initialBasicsBootstrap = await getProductFormBasicsBootstrap()

  return (
    <div className="p-8">
      <ProductForm
        forcedLane="collection"
        backHref="/dashboard/collection-products"
        pageTitle="Create Collection Product"
        pageDescription="Add a collection-only product using the shared product form with collection rules applied."
        initialBasicsBootstrap={initialBasicsBootstrap}
      />
    </div>
  )
}
