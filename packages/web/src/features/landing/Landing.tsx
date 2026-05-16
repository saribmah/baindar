import { Link, Navigate, useNavigate } from "react-router-dom";
import { BillingPlan } from "@baindar/sdk";
import { Button, Icons, Wordmark } from "@baindar/ui";
import { authClient } from "../auth";
import { BILLING_PLANS, PlanCard, type PlanCardAction } from "../billing";

const navItems = [
  { label: "Why Baindar", target: "why-baindar" },
  { label: "How it works", target: "how-it-works" },
  { label: "Apps", target: "apps" },
  { label: "Pricing", target: "pricing" },
] as const;

const formats = [
  { label: "EPUB", status: "Available now", available: true },
  { label: "PDF", status: "Coming soon", available: false },
  { label: "Articles", status: "Coming soon", available: false },
  { label: "Web links", status: "Coming soon", available: false },
] as const;

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

const steps = [
  {
    number: "01",
    title: "Drop it in.",
    body: "An EPUB, a PDF, a long-form article - paste a link or drag a file. Baindar reads it whole, end to end.",
    illustration: "drop",
  },
  {
    number: "02",
    title: "Read like a book.",
    body: "Calm typography, generous margins, paper-warm color. Highlight in five colors. Make notes that stay with the passage.",
    illustration: "read",
  },
  {
    number: "03",
    title: "Ask, anywhere.",
    body: "Stuck on a passage? Ask Baindar. Answers cite the page they came from. The book becomes a conversation.",
    illustration: "ask",
  },
] as const;

const footerColumns = [
  { title: "Product", links: ["Features", "Pricing", "Contact"] },
  { title: "Legal", links: ["Terms and conditions", "Privacy policy", "Open source"] },
] as const;

const appPlatforms = [
  {
    name: "Web app",
    status: "Available now",
    description: "Start in the browser, then keep your binder with you as native apps arrive.",
    Icon: WebAppIcon,
    available: true,
  },
  {
    name: "iOS app",
    status: "Coming soon",
    description: "Your documents, highlights, notes, and conversations in your pocket.",
    Icon: AppleIcon,
    available: false,
  },
  {
    name: "macOS desktop app",
    status: "Coming soon",
    description: "A focused desktop reader for deeper sessions and larger document work.",
    Icon: MacDesktopIcon,
    available: false,
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
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
              onClick={() => scrollTo(item.target)}
              className="t-label-m border-0 bg-transparent p-0 text-bd-fg-subtle hover:text-bd-fg"
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

      <HeroSection onSignUp={goToSignUp} onSeeHow={() => scrollTo("how-it-works")} />
      <ValueSection />
      <HowItWorksSection onSignUp={goToSignUp} />
      <AppsSection onSignUp={goToSignUp} />
      <PricingSection />
      <FooterSection
        onFeatures={() => scrollTo("why-baindar")}
        onPricing={() => scrollTo("pricing")}
      />
    </main>
  );
}

function HeroSection({ onSignUp, onSeeHow }: { onSignUp: () => void; onSeeHow: () => void }) {
  return (
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
          <Button size="lg" onClick={onSignUp}>
            Start reading free
          </Button>
          <Button variant="secondary" size="lg" onClick={onSeeHow}>
            See how it works
          </Button>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <span className="t-body-s text-bd-fg-muted">Works with</span>
          {formats.map((format) => (
            <span
              key={format.label}
              className={[
                "inline-flex min-h-8 items-center gap-2 rounded-full border px-3",
                format.available
                  ? "border-bd-border-strong bg-bd-fg text-bd-bg"
                  : "border-bd-border bg-bd-surface-raised text-bd-fg",
              ].join(" ")}
            >
              <span className="t-label-m">{format.label}</span>
              <span
                className={[
                  "font-ui text-[10px] font-medium",
                  format.available ? "text-bd-bg/70" : "text-bd-fg-muted",
                ].join(" ")}
              >
                {format.status}
              </span>
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
            An <em>affordance</em> is what's possible. A <em>signifier</em> is the visible cue that
            tells you so. A door handle <em>affords</em> pulling - a flat plate <em>signifies</em>{" "}
            "push."
          </p>
        </aside>
      </div>
    </section>
  );
}

function ValueSection() {
  return (
    <section
      id="why-baindar"
      className="mx-auto grid w-full max-w-[1440px] scroll-mt-6 gap-8 border-t border-bd-border px-5 py-12 sm:px-8 md:grid-cols-3 lg:px-14"
    >
      {valueCards.map(({ Icon, title, body }) => (
        <article key={title} className="flex max-w-[340px] flex-col gap-3">
          <Icon size={26} color="var(--bd-fg)" />
          <h2 className="t-display-s m-0">{title}</h2>
          <p className="t-body-m m-0 text-bd-fg-subtle">{body}</p>
        </article>
      ))}
    </section>
  );
}

function HowItWorksSection({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-6 border-t border-bd-border bg-bd-surface-raised"
    >
      <div className="mx-auto w-full max-w-[1440px] px-5 py-12 sm:px-8 lg:px-14 lg:py-14">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="t-label-s text-bd-fg-muted">HOW IT WORKS</div>
            <h2 className="m-0 mt-2 max-w-[620px] font-display text-[36px] font-normal leading-[1.05] tracking-normal text-bd-fg sm:text-[44px]">
              Three quiet steps from any text to a real conversation.
            </h2>
          </div>
          <button
            type="button"
            onClick={onSignUp}
            className="bd-btn bd-btn-pill bd-btn-ghost bd-btn-sm self-start text-bd-fg-subtle lg:self-auto"
          >
            Start with your first document
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {steps.map((step) => (
            <StepCard key={step.number} step={step} />
          ))}
        </div>

        <div className="mt-9 flex flex-col gap-4 rounded-2xl border border-bd-border bg-bd-bg px-5 py-5 sm:flex-row sm:items-center sm:rounded-pill sm:px-6">
          <Icons.BookOpen size={20} color="var(--bd-fg)" />
          <span className="t-body-l flex-1 text-bd-fg">
            Bring your first document in. The reader is ready in seconds.
          </span>
          <Button size="md" onClick={onSignUp}>
            Start reading free
          </Button>
          <span className="t-body-s text-bd-fg-muted">No card required</span>
        </div>
      </div>
    </section>
  );
}

function StepCard({ step }: { step: (typeof steps)[number] }) {
  return (
    <article className="flex min-h-[320px] flex-col gap-5 rounded-2xl border border-bd-border bg-bd-bg p-7">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] tracking-[0.04em] text-bd-fg-muted">
          {step.number}
        </span>
        <div className="h-px flex-1 bg-bd-border" />
      </div>
      <div>
        <h3 className="m-0 font-display text-[28px] font-medium leading-tight tracking-normal text-bd-fg">
          {step.title}
        </h3>
        <p className="t-body-m m-0 mt-2 leading-[1.55] text-bd-fg-subtle">{step.body}</p>
      </div>
      <div className="mt-auto">
        <StepIllustration kind={step.illustration} />
      </div>
    </article>
  );
}

function StepIllustration({ kind }: { kind: (typeof steps)[number]["illustration"] }) {
  if (kind === "drop") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-bd-border-strong bg-bd-surface-raised p-4">
        {["EPUB", "PDF", "LINK"].map((label, index) => (
          <div
            key={label}
            className={[
              "flex h-[52px] w-10 items-end rounded border border-bd-border p-1 font-mono text-[7px] text-bd-fg-subtle",
              index === 1 ? "bg-paper-200" : "bg-bd-bg",
            ].join(" ")}
          >
            {label}
          </div>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Icons.Check size={14} color="var(--success)" />
          <span className="t-body-s text-[11px] text-success">Indexed</span>
        </div>
      </div>
    );
  }

  if (kind === "read") {
    return (
      <div className="min-h-[110px] rounded-xl bg-bd-surface-raised px-4 py-3">
        <div className="mb-2 text-center font-display text-[11px] font-medium text-bd-fg-subtle">
          Chapter 01
        </div>
        <p className="m-0 font-reading text-[11px] leading-[1.55] text-bd-fg">
          Affordances make sense for interaction with physical objects.{" "}
          <mark className="bd-highlight text-[11px]">
            Signifiers specify how people discover those possibilities.
          </mark>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[80%] self-end rounded-[14px] rounded-br px-3 py-2 font-ui text-[11px] text-bd-bg bg-bd-fg">
        What's the difference?
      </div>
      <div className="flex max-w-[92%] flex-col gap-1 rounded-[14px] rounded-bl bg-bd-surface-raised px-3 py-2">
        <div className="flex items-center gap-1">
          <Icons.Sparkles size={10} color="var(--bd-accent)" />
          <span className="t-label-m text-[9px] text-bd-accent">Baindar · p. 16</span>
        </div>
        <p className="m-0 font-reading text-[11px] leading-[1.45] text-bd-fg">
          An <em>affordance</em> is what's possible. A <em>signifier</em> is the visible cue.
        </p>
      </div>
    </div>
  );
}

function AppsSection({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section id="apps" className="scroll-mt-6 border-t border-bd-border bg-bd-bg">
      <div className="mx-auto grid w-full max-w-[1440px] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-14 lg:py-16">
        <div>
          <div className="t-label-s text-bd-fg-muted">APPS</div>
          <h2 className="m-0 mt-2 max-w-[620px] font-display text-[36px] font-normal leading-[1.05] tracking-normal text-bd-fg sm:text-[44px]">
            Your binder, synced across every device.
          </h2>
          <p className="t-body-l m-0 mt-5 max-w-[520px] text-bd-fg-subtle">
            Read on the web today. iOS and macOS apps are coming next, with the same documents,
            highlights, notes, and AI conversations following you everywhere.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="lg" onClick={onSignUp}>
              Start on web
            </Button>
            <span className="t-body-s text-bd-fg-muted">
              Native download links will appear after App Store review.
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 lg:gap-4">
          {appPlatforms.map(({ name, status, description, Icon, available }) => (
            <article
              key={name}
              className={[
                "flex min-h-[220px] flex-col rounded-2xl border p-5",
                available
                  ? "border-bd-fg bg-bd-fg text-bd-bg shadow-[var(--sh-lg)]"
                  : "border-bd-border bg-bd-surface-raised text-bd-fg",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={[
                    "flex h-10 w-10 items-center justify-center rounded-full",
                    available ? "bg-bd-bg/10 text-bd-bg" : "bg-bd-bg text-bd-fg",
                  ].join(" ")}
                >
                  <Icon />
                </span>
                <span
                  className={[
                    "rounded-full px-2.5 py-1 font-ui text-[11px] font-medium",
                    available ? "bg-bd-bg text-bd-fg" : "bg-bd-bg text-bd-fg-muted",
                  ].join(" ")}
                >
                  {status}
                </span>
              </div>
              <h3 className="m-0 mt-6 font-display text-[24px] font-medium leading-tight tracking-normal">
                {name}
              </h3>
              <p
                className={[
                  "t-body-m m-0 mt-3 leading-[1.5]",
                  available ? "text-bd-bg/70" : "text-bd-fg-subtle",
                ].join(" ")}
              >
                {description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-6 border-t border-bd-border bg-bd-bg">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-14 sm:px-8 lg:px-14 lg:py-16">
        <div className="mb-9 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="t-label-s text-bd-fg-muted">PRICING</div>
            <h2 className="m-0 mt-2 max-w-[620px] font-display text-[36px] font-normal leading-[1.05] tracking-normal text-bd-fg sm:text-[44px]">
              Choose the binder size that matches how much you read.
            </h2>
          </div>
          <p className="t-body-l m-0 max-w-[420px] text-bd-fg-subtle">
            Start free, then upgrade when your library or AI usage needs more room.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BILLING_PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              action={getLandingPlanAction(plan.id)}
              compact={false}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FooterSection({
  onFeatures,
  onPricing,
}: {
  onFeatures: () => void;
  onPricing: () => void;
}) {
  return (
    <footer className="border-t border-bd-border bg-bd-surface-raised">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 lg:px-14 lg:py-12">
        <div className="mb-9 grid gap-9 md:grid-cols-[2fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <Wordmark size="md" />
            <p className="t-body-m m-0 max-w-[320px] leading-[1.55] text-bd-fg-subtle">
              A quieter way to read anything. Books, PDFs, articles, papers - with an AI that's
              actually read them.
            </p>
            <div className="flex gap-2">
              <a
                href="https://x.com/saribmah"
                target="_blank"
                rel="noreferrer"
                aria-label="Baindar on X"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-bd-border bg-bd-bg text-bd-fg-subtle no-underline hover:text-bd-fg"
              >
                <XIcon />
              </a>
              <a
                href="https://github.com/saribmah/baindar"
                target="_blank"
                rel="noreferrer"
                aria-label="Baindar on GitHub"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-bd-border bg-bd-bg text-bd-fg-subtle no-underline hover:text-bd-fg"
              >
                <GitHubIcon />
              </a>
            </div>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title} className="flex flex-col gap-2.5">
              <div className="t-label-s text-bd-fg-muted">{column.title.toUpperCase()}</div>
              {column.links.map((link) =>
                link === "Open source" || link === "Contact" ? (
                  <a
                    key={link}
                    href={
                      link === "Open source"
                        ? "https://github.com/saribmah/baindar"
                        : "mailto:support@baindar.com"
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="t-body-m w-fit text-left text-[14px] text-bd-fg-subtle no-underline hover:text-bd-fg"
                  >
                    {link}
                  </a>
                ) : link === "Terms and conditions" || link === "Privacy policy" ? (
                  <Link
                    key={link}
                    to={link === "Terms and conditions" ? "/terms" : "/privacy"}
                    className="t-body-m w-fit text-left text-[14px] text-bd-fg-subtle no-underline hover:text-bd-fg"
                  >
                    {link}
                  </Link>
                ) : (
                  <button
                    key={link}
                    type="button"
                    onClick={
                      link === "Features" ? onFeatures : link === "Pricing" ? onPricing : undefined
                    }
                    className="t-body-m w-fit border-0 bg-transparent p-0 text-left text-[14px] text-bd-fg-subtle hover:text-bd-fg"
                  >
                    {link}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-bd-border pt-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <span className="t-body-s text-bd-fg-muted">© 2026 Baindar, Inc.</span>
            <span className="h-1 w-1 rounded-full bg-bd-border-strong" />
            <span className="t-body-s text-bd-fg-muted">Made for readers with ♥</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M13.9 10.5 21.3 2h-1.8l-6.4 7.4L8 2H2.1l7.8 11.3L2.1 22h1.8l6.8-7.8 5.4 7.8H22l-8.1-11.5Zm-2.4 2.8-.8-1.1L4.4 3.3h2.8l5 7.1.8 1.1 6.6 9.3h-2.8l-5.3-7.5Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.9.6-3.5-1.2-3.5-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 0 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.3-.3-4.7-1.1-4.7-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.8 9.8 0 0 1 5.1 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.4 4.6-4.7 4.9.4.3.7 1 .7 2v2.5c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

function WebAppIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M8 5v4" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M16.6 12.7c0-2.7 2.2-4 2.3-4.1-1.2-1.8-3.1-2-3.8-2-1.6-.2-3.2.9-4 0.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.4-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.2 3.1-2.5 1-1.5 1.4-2.9 1.5-3-.1-.1-2.9-1.2-2.9-3.6ZM14 4.9c.7-.9 1.2-2 1.1-3.2-1 .1-2.1.6-2.8 1.4-.6.7-1.2 1.9-1.1 3 1.1.1 2.1-.5 2.8-1.2Z" />
    </svg>
  );
}

function MacDesktopIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </svg>
  );
}

function getLandingPlanAction(plan: BillingPlan): PlanCardAction {
  return {
    kind: "internal",
    label: plan === BillingPlan.Free ? "Start free" : `Choose ${labelForPlan(plan)}`,
    to: "/signup",
  };
}

const labelForPlan = (plan: BillingPlan): string => {
  if (plan === BillingPlan.Byok) return "BYOK";
  return plan[0].toUpperCase() + plan.slice(1);
};
