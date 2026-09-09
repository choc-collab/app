export async function generateStaticParams() {
  return [{ date: "_spa" }];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
