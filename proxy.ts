import { NextResponse, type NextRequest } from 'next/server'

// CMS direct-upload tokens cannot verify file contents. Keep these endpoints
// unavailable until each family has a constrained provider-side signing flow;
// existing editors automatically fall back to the authenticated server upload.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/cms/uploads/') && request.nextUrl.pathname.endsWith('/sign')) {
    return NextResponse.json({ error: 'Direct CMS uploads are temporarily unavailable. Use the secure fallback upload.' }, { status: 503 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/cms/uploads/:path*/sign'],
}
