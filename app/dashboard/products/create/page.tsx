import { ProductForm } from '@/components/product-form'
import { getProductFormBasicsBootstrap } from '../product-form-bootstrap'

export default async function CreateProductPage() {
  const initialBasicsBootstrap = await getProductFormBasicsBootstrap()

  return (
    <div className="p-8">
      <ProductForm
        forcedLane="standard"
        forcedTemplate="standard"
        backHref="/dashboard/products"
        pageTitle="Create Product"
        pageDescription="Add a standard storefront product using the main product flow."
        initialBasicsBootstrap={initialBasicsBootstrap}
      />
    </div>
  )
}
