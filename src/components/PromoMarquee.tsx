import { ArrowUpRight } from 'lucide-react'

const MESSAGE = 'Litrito es parte de athas.mx — software mexicano que sí jala'

export function PromoMarquee() {
  return (
    <div className="border-b border-white/10 bg-brand text-white">
      <div className="flex overflow-hidden">
        {/* Two identical groups so the -50% translate loops seamlessly. */}
        {[0, 1].map((group) => (
          <div
            key={group}
            aria-hidden={group === 1}
            className="animate-marquee flex shrink-0 items-center"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <a
                key={i}
                href="https://athas.mx"
                target="_blank"
                rel="noopener noreferrer"
                className="mx-5 inline-flex items-center gap-1.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white hover:text-white/80"
              >
                {MESSAGE}
                <ArrowUpRight className="h-3 w-3" />
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default PromoMarquee
