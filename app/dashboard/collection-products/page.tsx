import { ProductsClient } from '../products/products-client'
import { getProductRows } from '../products/product-list'

export default async function CollectionProductsPage() {
  const initialData = await getProductRows('collection')

  return (
    <ProductsClient
      initialData={initialData}
      lane="collection"
      title="Collection Products"
      description="Review collection-only products that stay enquiry-first and never go to checkout."
      createHref="/dashboard/collection-products/create"
      createLabel="Add Collection Product"
      editBaseHref="/dashboard/collection-products/edit"
      emptyMessage="No Collection products found."
    />
  )
}
