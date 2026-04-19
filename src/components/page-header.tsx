export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="px-4 pt-8 pb-4">
      <h1 className="text-2xl font-display tracking-tight">{title}</h1>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
      )}
    </div>
  );
}
