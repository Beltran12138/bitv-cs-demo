import ChatWidget from '@/components/ChatWidget'

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] relative overflow-hidden">

      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/30 to-transparent pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* Mock navbar */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 font-bold text-xl">bit</span>
          <span className="text-white font-bold text-xl">V</span>
        </div>
        <div className="hidden md:flex gap-8 text-sm text-slate-400">
          <span className="hover:text-white cursor-pointer transition-colors">Trade</span>
          <span className="hover:text-white cursor-pointer transition-colors">Futures</span>
          <span className="hover:text-white cursor-pointer transition-colors">Earn</span>
          <span className="hover:text-white cursor-pointer transition-colors">Markets</span>
        </div>
        <div className="flex gap-3">
          <button className="text-sm text-slate-300 hover:text-white px-4 py-1.5 transition-colors">Log In</button>
          <button className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors">Sign Up</button>
        </div>
      </nav>

      {/* Mock hero content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-65px)] text-center px-4">
        <div className="inline-flex items-center gap-2 bg-blue-950/50 border border-blue-800/50 rounded-full px-4 py-1.5 text-xs text-blue-300 mb-8">
          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
          The Leading Global Digital Asset Exchange
        </div>

        <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
          Trade with
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400"> Confidence</span>
        </h1>

        <p className="text-slate-400 text-lg mb-10 max-w-md">
          Fast, secure, and reliable crypto trading platform trusted by millions worldwide.
        </p>

        <div className="flex gap-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-medium transition-colors">
            Get Started
          </button>
          <button className="border border-slate-600 hover:border-slate-400 text-slate-300 px-8 py-3 rounded-xl font-medium transition-colors">
            Learn More
          </button>
        </div>

        <div className="mt-16 text-xs text-slate-600 border border-slate-800 rounded-lg px-4 py-2">
          👇 点击右下角 💬 按钮体验客服机器人 Demo
        </div>
      </main>

      {/* Customer service widget */}
      <ChatWidget />
    </div>
  )
}
