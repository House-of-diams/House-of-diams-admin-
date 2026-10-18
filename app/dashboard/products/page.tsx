import { ProductsClient } from './products-client'
import { getProductRows } from './product-list'

export default async function ProductsPage() {
  const initialData = await getProductRows('standard')
  return (
    <ProductsClient
      initialData={initialData}
      lane="standard"
      title="Products"
      description="Manage your product catalog and inventory"
      createHref="/dashboard/products/create"
      createLabel="Add Product"
      editBaseHref="/dashboard/products/edit"
      emptyMessage="No products found."
    />
  )
}
