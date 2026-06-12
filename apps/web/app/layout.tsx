import "./globals.css";
import { Providers, Footer } from "@/components";
import { getRoutingContext } from "@/lib/routing-context";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const routingContext = await getRoutingContext();
  const isTenant = Boolean(routingContext.tenantSlug);

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: "Vendora",
      template: isTenant ? "%s" : "%s • Vendora",
    },
    description: "Vendora vNext: швидкий каталог, стабільний checkout, прозорі статуси замовлення.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const routingContext = await getRoutingContext();
  const showFooter = !routingContext.tenantSlug;
  const wrapperClassName = showFooter ? "container" : undefined;
  return (
    <html lang="uk" suppressHydrationWarning>
      <body>
        <div className={wrapperClassName}>
          <Providers routingContext={routingContext}>{children}</Providers>
          {showFooter ? <Footer /> : null}
        </div>
      </body>
    </html>
  );
}
