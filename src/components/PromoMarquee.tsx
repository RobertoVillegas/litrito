import { ArrowUpRight } from "lucide-react";

const MESSAGE =
  "Litrito es parte de Athas · diseñamos y construimos software a la medida";

function Item() {
  return (
    <a
      href="https://athas.mx?ref=litrito"
      target="_blank"
      rel="noopener noreferrer"
      className="promo-marquee__link mx-6 inline-flex shrink-0 items-center gap-1.5 py-2 text-sm font-bold uppercase tracking-wide"
    >
      {MESSAGE}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
}

export function PromoMarquee() {
  return (
    <div className="promo-marquee border-b bg-brand">
      <div className="overflow-hidden">
        {/* One track holding the content twice; translating -50% loops seamlessly. */}
        <div className="flex w-max animate-marquee items-center">
          <div className="flex shrink-0 items-center">
            {Array.from({ length: 5 }).map((_, i) => (
              <Item key={i} />
            ))}
          </div>
          <div className="flex shrink-0 items-center" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Item key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PromoMarquee;
