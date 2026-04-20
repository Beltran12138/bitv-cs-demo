import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'bitV 客服 Demo',
  description: 'bitV Customer Service Demo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="bg-[#0a0f1e] text-white antialiased">{children}</body>
    </html>
  )
}
