import ChatWidget from '@/components/ChatWidget'

export const dynamic = 'force-dynamic'

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-[#080c1a] relative overflow-hidden">

      {/* Background — blue/purple glow matching Acme hero */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#080c1a] via-[#0c1430] to-[#080c1a] pointer-events-none" />
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-blue-700/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-16 right-32 w-[450px] h-[450px] bg-purple-700/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-10 py-3.5 border-b border-white/5">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/50">
            <span className="text-white font-black text-sm leading-none">V</span>
          </div>
          <span className="text-white font-semibold text-[17px] tracking-tight">Acme</span>
        </div>

        {/* Nav links */}
        <div className="hidden md:flex gap-7 text-sm text-slate-400">
          {['Market', 'Spot Trading', 'Foreign Exchange', 'Futures', 'Earn', 'Learn'].map(link => (
            <span key={link} className="hover:text-white cursor-pointer transition-colors duration-150">{link}</span>
          ))}
        </div>

        {/* Auth + lang */}
        <div className="flex items-center gap-2">
          <button className="text-sm text-slate-300 hover:text-white px-4 py-1.5 transition-colors">Log In</button>
          <button className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-md font-medium transition-colors">
            Sign Up
          </button>
          <button className="text-slate-500 hover:text-slate-300 ml-1 transition-colors text-base">🌐</button>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 min-h-[calc(100vh-57px)] flex items-center px-10 md:px-20 max-w-7xl">
        <div className="max-w-xl">

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl font-bold text-white leading-[1.18] mb-8">
            Buy and Trade<br />
            Cryptocurrencies<br />
            In A Trusted<br />
            Ecosystem
          </h1>

          {/* Search bar row */}
          <div className="flex mb-10">
            <input
              type="text"
              defaultValue="Hong Kong Crypto Exchange"
              readOnly
              className="bg-white/6 border border-white/10 text-slate-300 text-sm px-4 py-2.5 rounded-l-md outline-none w-56 cursor-default"
            />
            <button className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-5 py-2.5 rounded-r-md font-medium transition-colors whitespace-nowrap">
              Explore More
            </button>
          </div>

          {/* Stats row */}
          <div className="flex gap-12">
            <div>
              <div className="text-3xl font-bold text-white leading-none">
                24<span className="text-xl text-slate-400 font-normal">/7</span>
              </div>
              <div className="text-xs text-slate-500 mt-1.5 tracking-wide">Service</div>
            </div>
            <div className="w-px bg-white/8 self-stretch" />
            <div>
              <div className="text-3xl font-bold text-white leading-none">
                98<span className="text-xl text-blue-400 font-normal">%</span>
              </div>
              <div className="text-xs text-slate-500 mt-1.5 tracking-wide">One-time Pass Rate</div>
            </div>
          </div>

          {/* Demo hint */}
          <div className="mt-12 inline-flex items-center gap-2 text-xs text-slate-600 border border-slate-800/80 rounded-lg px-3 py-2">
            <span className="text-slate-500">💬</span>
            点击右下角按钮体验 AI 客服 Demo
          </div>
        </div>
      </main>

      <ChatWidget />
    </div>
  )
}
