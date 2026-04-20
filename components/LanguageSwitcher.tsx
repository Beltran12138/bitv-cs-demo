import { LANGUAGES, type Language } from '@/lib/i18n'

interface Props {
  current: Language
  onChange: (lang: Language) => void
}

export default function LanguageSwitcher({ current, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {LANGUAGES.map(lang => (
        <button
          key={lang.code}
          onClick={() => onChange(lang.code)}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${
            current === lang.code
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
