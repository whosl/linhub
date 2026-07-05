export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
      <div>
        <h1 className="font-serif text-2xl text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function PageContainer({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div
        className={
          wide
            ? "mx-auto w-full max-w-5xl px-6 pb-16 pt-14"
            : "mx-auto w-full max-w-3xl px-6 pb-16 pt-14"
        }
      >
        {children}
      </div>
    </div>
  );
}
