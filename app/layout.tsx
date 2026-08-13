import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Acme 客服 Demo',
  description: 'Acme Customer Service Demo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="bg-[#0a0f1e] text-white antialiased">{children}</body>
    </html>
  )
}
