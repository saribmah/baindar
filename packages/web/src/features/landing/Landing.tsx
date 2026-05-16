import { useNavigate, Navigate } from "react-router-dom";
import { Button, Icons, Wordmark } from "@baindar/ui";
import { authClient } from "../auth";

const navItems = [
  { label: "Why Baindar", kind: "scroll" },
  { label: "For students", kind: "scroll" },
  { label: "For readers", kind: "scroll" },
  { label: "Pricing", kind: "plans" },
] as const;
const formats = ["EPUB", "PDF", "Articles", "Web links"];

const valueCards = [
  {
    Icon: Icons.BookOpen,
    title: "Read anything",
    body: "EPUBs, PDFs, articles, web links - they all become a calm, typographic page.",
  },
  {
    Icon: Icons.Sparkles,
    title: "Ask, grounded",
    body: "Every answer is rooted in your text. No hallucinations, just careful citations.",
  },
  {
    Icon: Icons.Note,
    title: "Remember more",
    body: "Highlights and notes that connect across everything you read.",
  },
] as const;

export function Landing() {
  const session = authClient.useSession();
  const navigate = useNavigate();

  if (session.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bd-bg text-bd-fg">
        <span className="t-body-m text-bd-fg-muted">Loading...</span>
      </main>
    );
  }

  if (session.data?.user) {
    return <Navigate to="/dashboard" replace />;
  }

  const goToSignIn = () => navigate("/signin");
  const goToSignUp = () => navigate("/signup");
  const scrollToWhy = () => document.getElementById("why-baindar")?.scrollIntoView();

  return (
    <main className="min-h-screen bg-bd-bg text-bd-fg">
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-6 px-5 py-5 sm:px-8 lg:px-14">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="border-0 bg-transparent p-0 text-bd-fg"
        >
          <Wordmark size="md" />
        </button>

        <nav aria-label="Landing" className="hidden items-center gap-7 lg:flex">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => (item.kind === "plans" ? navigate("/plans") : scrollToWhy())}
              className="t-label-m border-0 bg-transparent p-0 text-bd-fg-subtle"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={goToSignIn}>
            Sign in
          </Button>
          <Button size="sm" onClick={goToSignUp}>
            Get started
          </Button>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1440px] gap-12 px-5 pb-12 pt-8 sm:px-8 md:pt-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14 lg:px-14">
        <div>
          <div className="t-label-s text-bd-fg-muted">READING · COMPANION · QUIETLY</div>
          <h1 className="mt-5 max-w-[760px] font-display text-[48px] font-normal leading-[1] tracking-normal text-bd-fg sm:text-[64px] lg:text-[72px] xl:text-[84px]">
            A quieter way
            <br />
            to read anything.
          </h1>
          <p className="t-body-l mt-6 max-w-[500px] text-bd-fg-subtle">
            Books, PDFs, articles, papers - drop them into Baindar and read with an attentive AI
            that's actually read the whole thing. Highlight, ask, remember.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={goToSignUp}>
              Start reading free
            </Button>
            <Button variant="secondary" size="lg" onClick={scrollToWhy}>
              See how it works
            </Button>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
            <span className="t-body-s text-bd-fg-muted">Works with</span>
            {formats.map((format) => (
              <span key={format} className="t-label-m text-bd-fg">
                {format}
              </span>
            ))}
          </div>
        </div>

        <div className="relative min-h-[420px] lg:min-h-[460px]" aria-label="Reader preview">
          <article className="absolute right-0 top-0 w-full max-w-[540px] rounded-2xl bg-bd-surface-raised px-6 py-8 shadow-[var(--sh-lg)] sm:px-10">
            <div className="text-center font-display text-[18px] font-medium leading-tight text-bd-fg opacity-70">
              Chapter 01
            </div>
            <div className="mt-2 text-center font-display text-[22px] font-normal leading-tight text-bd-fg">
              The Psychopathology of Everyday Things
            </div>
            <p className="mt-6 font-reading text-[16px] leading-[1.7] text-bd-fg">
              Affordances make sense for interaction with physical objects.{" "}
              <mark className="bd-highlight">
                Affordances define what actions are possible. Signifiers specify how people discover
                those possibilities.
              </mark>{" "}
              Signifiers are of far more importance to designers than are affordances.
            </p>
          </article>

          <aside className="absolute bottom-6 right-0 flex w-[min(320px,88%)] flex-col gap-2 rounded-xl border border-bd-border bg-bd-bg p-5 shadow-[var(--sh-xl)] lg:-right-5">
            <div className="flex items-center gap-2">
              <Icons.Sparkles size={16} color="var(--bd-accent)" />
              <span className="t-label-m text-bd-accent">Baindar</span>
            </div>
            <p className="m-0 font-reading text-[13px] leading-[1.5] text-bd-fg">
              An <em>affordance</em> is what's possible. A <em>signifier</em> is the visible cue
              that tells you so. A door handle <em>affords</em> pulling - a flat plate{" "}
              <em>signifies</em> "push."
            </p>
          </aside>
        </div>
      </section>

      <section
        id="why-baindar"
        className="mx-auto grid w-full max-w-[1440px] gap-8 border-t border-bd-border px-5 py-12 sm:px-8 md:grid-cols-3 lg:px-14"
      >
        {valueCards.map(({ Icon, title, body }) => (
          <article key={title} className="flex max-w-[340px] flex-col gap-3">
            <Icon size={26} color="var(--bd-fg)" />
            <h2 className="t-display-s m-0">{title}</h2>
            <p className="t-body-m m-0 text-bd-fg-subtle">{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
