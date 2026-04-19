import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ ["--nav-w" as string]: "0px" }}
    >
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="" className="w-7 h-7 rounded object-contain" />
            <span className="text-sm font-semibold tracking-tight">Choc-collab</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href="/getting-started"
              className="px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Getting started
            </Link>
            <Link
              href="/app"
              className="btn-primary"
            >
              Open the app
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border mt-16">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>Choc-collab · MIT licensed · <a href="https://github.com/choc-collab" className="hover:text-foreground">https://github.com/choc-collab</a></div>
          <div>Made with ❤️ for you. The world needs more kindness (and more chocolate!)</div>
        </div>
      </footer>
    </div>
  );
}
