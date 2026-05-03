import Link from "next/link";

export default function AdminLayout({
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
          <Link
            href="/"
            className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="" className="w-7 h-7 rounded object-contain" />
            <span className="text-sm font-semibold tracking-tight">Choc-collab</span>
          </Link>
          <span
            className="mono-label"
            style={{ color: "var(--accent-terracotta-ink)" }}
          >
            Admin
          </span>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href="/choccy-chat"
              className="px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              View public map
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
