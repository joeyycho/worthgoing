interface PlaceholderTabProps {
  title: string;
  description: string;
}

export function PlaceholderTab({ title, description }: PlaceholderTabProps) {
  return (
    <section className="placeholder-tab" aria-labelledby="placeholder-title">
      <h1 id="placeholder-title" className="page-title">
        {title}
      </h1>
      <p className="page-subtitle">{description}</p>
      <p className="status-note" role="status">
        이 탭은 이후 단계에서 연결될 예정이에요.
      </p>
    </section>
  );
}
