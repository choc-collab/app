// Static-export placeholder: real IDs are user-generated at runtime, so we
// pre-render a single `_spa` shell and rewrite live URLs onto it via
// `public/_redirects`. `useParams()` still reads the actual ID from the URL
// after client hydration.
export async function generateStaticParams() {
  return [{ id: "_spa" }];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
