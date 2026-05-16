import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "@baindar/ui";

export function LegalPage({
  eyebrow,
  title,
  updatedAt,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  updatedAt: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-bd-bg text-bd-fg">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-6 px-5 py-5 sm:px-8 lg:px-12">
        <Link to="/" className="text-bd-fg no-underline">
          <Wordmark size="md" />
        </Link>
        <nav aria-label="Legal pages" className="flex items-center gap-4">
          <Link to="/terms" className="t-body-s text-bd-fg-subtle no-underline hover:text-bd-fg">
            Terms
          </Link>
          <Link to="/privacy" className="t-body-s text-bd-fg-subtle no-underline hover:text-bd-fg">
            Privacy
          </Link>
        </nav>
      </header>

      <article className="mx-auto w-full max-w-[960px] px-5 pb-20 pt-8 sm:px-8 lg:px-12">
        <div className="border-b border-bd-border pb-9">
          <div className="t-label-s text-bd-fg-muted">{eyebrow.toUpperCase()}</div>
          <h1 className="mt-3 font-display text-[44px] font-normal leading-[1.04] tracking-normal text-bd-fg sm:text-[60px]">
            {title}
          </h1>
          <p className="t-body-l mt-5 max-w-[720px] text-bd-fg-subtle">{summary}</p>
          <p className="t-body-s mt-5 text-bd-fg-muted">{updatedAt}</p>
        </div>

        <div className="legal-prose mt-10 flex flex-col gap-9">{children}</div>
      </article>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-bd-border pb-9 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <h2 className="t-label-l m-0 text-bd-fg">{title}</h2>
      <div className="flex flex-col gap-4 text-bd-fg-subtle">{children}</div>
    </section>
  );
}
