import { CMSTabs } from '@/components/cms-tabs'
import { CMSSectionTable } from '@/components/cms-section-table'

const HOME_SECTIONS = [
  { id: 'hero', label: 'Hero Section', description: 'Main headline, eyebrow, and CTAs' },
  { id: 'shop-by-category', label: 'Shop By Category', description: 'Choose and order category, subcategory, and option cards shown below the hero' },
  { id: 'discover-shapes', label: 'Discover Shapes', description: 'Homepage shape carousel images, titles, and descriptions' },
  { id: 'bestsellers', label: 'Best Sellers', description: 'Selected existing products shown in the best sellers grid' },
  { id: 'reels', label: 'Instagram Reels', description: 'Public Instagram posts shown in the homepage marquee' },
]

export default function HomePageEditor() {
  return (
    <div>
      <CMSTabs />

      <div className="p-8">
        <div className="mb-10">
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Home Page</h1>
          <p className="mt-1 text-sm text-muted-foreground">Edit all sections of the home page</p>
        </div>

        <CMSSectionTable basePath="/dashboard/cms/home" sections={HOME_SECTIONS} />
      </div>
    </div>
  )
}
