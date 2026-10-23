import type { Metadata } from 'next'
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

// Fonts are self-hosted by next/font, so every browser gets the same typeface whether or not it is installed locally.
const _plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const _geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const _geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: 'House of Diams - Admin Dashboard',
  description: 'Admin dashboard for managing jewelry inventory, content, and orders',
  generator: 'v0.app',
  icons: {
    icon: "/logo.ico",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`bg-background ${_plusJakarta.variable} ${_geist.variable} ${_geistMono.variable}`} suppressHydrationWarning>
      <body className="overflow-hidden bg-background font-sans antialiased" suppressHydrationWarning>
        {children}
        <Toaster />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
