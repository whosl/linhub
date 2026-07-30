/** 占位页面:后续阶段填充具体功能 */
export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold text-text">{title}</h1>
      <p className="text-sm text-text-2">{description ?? "此页面将在后续阶段实现。"}</p>
    </div>
  );
}
