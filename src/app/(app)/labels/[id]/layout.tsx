export async function generateStaticParams() {
  return [{ id: "_spa" }];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
