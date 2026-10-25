import { Button, Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => (
  <section className="w-full border-b border-ui-border-base bg-ui-bg-subtle">
    <div className="content-container flex flex-col items-start justify-center gap-6 py-20 small:py-28">
      <p className="text-small-semi uppercase tracking-widest text-ui-fg-muted">
        Minarva Technologies · Thiruvananthapuram
      </p>
      <Heading
        level="h1"
        className="max-w-3xl text-3xl leading-tight small:text-5xl font-semibold text-ui-fg-base"
      >
        CCTV Camera Packages for Homes & Businesses
      </Heading>
      <p className="max-w-2xl text-base leading-relaxed text-ui-fg-subtle">
        Explore surveillance camera kits, compare included components, and
        select what suits your site. Delivery availability and charges depend
        on your PIN code, packed weight and courier serviceability.
      </p>
      <p lang="ml" className="max-w-2xl text-sm leading-relaxed text-ui-fg-subtle">
        വീടുകൾക്കും സ്ഥാപനങ്ങൾക്കും അനുയോജ്യമായ CCTV പാക്കേജുകൾ തിരഞ്ഞെടുക്കാം.
        ഡെലിവറി ലഭ്യതയും ചാർജും PIN കോഡിന് അനുസരിച്ച് സ്ഥിരീകരിക്കും.
      </p>
      <div className="flex flex-wrap gap-3">
        <LocalizedClientLink href="/cctv-quote">
          <Button>Get a Verified CCTV Quote</Button>
        </LocalizedClientLink>
        <LocalizedClientLink href="/store">
          <Button>Explore Camera Packages</Button>
        </LocalizedClientLink>
        <a
          href="https://wa.me/916235353732?text=Hello%2C%20I%20need%20help%20choosing%20a%20CCTV%20package."
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ask Minarva Technologies about CCTV packages on WhatsApp"
        >
          <Button variant="secondary">Ask a Package Question</Button>
        </a>
      </div>
      <p className="max-w-2xl text-xs text-ui-fg-muted">
        Installation is not included unless the individual package explicitly
        says otherwise. Exact model, included parts and warranty are shown per product.
      </p>
    </div>
  </section>
)

export default Hero
