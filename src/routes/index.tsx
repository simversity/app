import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import {
  ArrowRight,
  BookOpen,
  Brain,
  ChevronDown,
  Eye,
  GraduationCap,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();
    if (session) {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: Landing,
});

function Landing() {
  const fraunces = { fontFamily: 'Fraunces, serif' } as const;

  usePageTitle('Simversity');

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Dot grid background texture */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <span
          className="flex items-center gap-2.5 text-xl font-semibold tracking-tight"
          style={fraunces}
        >
          <img
            src="/favicon.png"
            alt="Simversity"
            className="h-8 w-auto"
            width={32}
            height={32}
          />
          Simversity
        </span>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20 pt-16 sm:px-10 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: Copy */}
          <div
            className="animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationFillMode: 'both' }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3 text-student" />
              AI-powered practice for educators
            </div>

            <h1
              className="mt-6 text-4xl leading-[1.1] font-light tracking-tight sm:text-5xl lg:text-6xl"
              style={fraunces}
            >
              Teaching Simulator
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Practice responding to students who hold real misconceptions — in
              a safe space, before it happens in your classroom. Build the
              pedagogical expertise that separates good teachers from great
              ones.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/register"
                className="group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/15"
              >
                Get started free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how-it-works"
                className="group inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-accent"
              >
                See how it works
                <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
              </a>
            </div>
          </div>

          {/* Right: Conversation preview */}
          <div
            className="relative animate-in fade-in slide-in-from-bottom-6 duration-700"
            style={{ animationDelay: '200ms', animationFillMode: 'both' }}
          >
            {/* Decorative blobs */}
            <div className="absolute -left-8 -top-8 h-64 w-64 rounded-full bg-teacher/5 blur-3xl" />
            <div className="absolute -bottom-8 -right-8 h-64 w-64 rounded-full bg-student/5 blur-3xl" />

            <div className="relative rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/5">
              {/* Mock header */}
              <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-student/10">
                  <GraduationCap className="h-4 w-4 text-student" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Riley</p>
                  <p className="text-xs text-muted-foreground">
                    Natural Selection &middot; Lamarckian thinking
                  </p>
                </div>
              </div>

              {/* Mock messages */}
              <div className="space-y-4">
                <MockMessage
                  from="student"
                  delay={400}
                  text="The mice on the sand dunes turned white because they needed to hide from predators, so their fur changed to match."
                />
                <MockMessage
                  from="teacher"
                  delay={700}
                  text="That's an interesting claim, Riley. What mechanism would cause an individual mouse's fur to change color?"
                />
                <MockMessage
                  from="student"
                  delay={1000}
                  text="I mean, the environment basically forced them to adapt. They needed lighter fur to survive, so they just... developed it."
                />
              </div>

              {/* Mock input */}
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3">
                <span className="flex-1 text-sm text-muted-foreground/50">
                  Respond to the student...
                </span>
                <div className="h-7 w-7 rounded-md bg-primary/10" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="relative z-10 bg-card/50 px-6 py-24 sm:px-10"
      >
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-teacher">
              How it works
            </p>
            <h2
              className="mt-3 text-3xl font-light tracking-tight sm:text-4xl"
              style={fraunces}
            >
              Three steps to better teaching
            </h2>
          </div>

          <div className="relative mt-16 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {/* Connecting line (desktop) */}
            <div className="absolute left-0 right-0 top-10 hidden h-px bg-border sm:block" />

            <StepCard
              number={1}
              icon={BookOpen}
              title="Choose a scenario"
              description="Pick from curated misconception scenarios organized by subject and topic. Each features a unique student persona."
              delay={0}
            />
            <StepCard
              number={2}
              icon={MessageSquare}
              title="Converse with a student"
              description="Engage in a realistic back-and-forth with an AI student who holds a genuine misconception. They respond to your pedagogy."
              delay={150}
            />
            <StepCard
              number={3}
              icon={Eye}
              title="Get expert feedback"
              description="An observer analyzes your conversation and coaches you on what worked, what to try differently, and why — grounded in education research."
              delay={300}
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 py-24 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-student">
              Built for educators
            </p>
            <h2
              className="mt-3 text-3xl font-light tracking-tight sm:text-4xl"
              style={fraunces}
            >
              Practice that feels real
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Every detail is designed to build authentic pedagogical content
              knowledge — the specialized expertise that separates good teachers
              from great ones.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            <FeatureCard
              icon={Brain}
              title="Realistic student personas"
              description="Each AI student has a name, background, speech patterns, and a specific misconception with an origin story. They feel like real students because they're modeled on real misconceptions."
              accent="teacher"
              delay={0}
            />
            <FeatureCard
              icon={Eye}
              title="Research-grounded feedback"
              description="An expert observer analyzes your teaching moves and gives specific, actionable coaching grounded in education research. No scores — just evidence-based insights to sharpen your practice."
              accent="student"
              delay={100}
            />
            <FeatureCard
              icon={Sparkles}
              title="Progress tracking"
              description="See your practice history at a glance — conversations completed, scenarios explored, and past observer feedback to revisit anytime."
              accent="student"
              delay={200}
            />
            <FeatureCard
              icon={BookOpen}
              title="Curated scenarios"
              description="Misconception scenarios are designed by educators and grounded in research on common student misunderstandings. Each one targets a specific pedagogical challenge."
              accent="teacher"
              delay={300}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-border px-6 py-24 sm:px-10">
        <div
          className="mx-auto max-w-2xl text-center animate-in fade-in slide-in-from-bottom-4 duration-700"
          style={{ animationFillMode: 'both' }}
        >
          <h2
            className="text-3xl font-light tracking-tight sm:text-4xl"
            style={fraunces}
          >
            Ready to practice?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            Every expert teacher started somewhere. Start building your teaching
            practice today.
          </p>
          <Link
            to="/register"
            className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/15"
          >
            Get started free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span
            className="flex items-center gap-2 text-sm font-medium tracking-tight text-muted-foreground"
            style={fraunces}
          >
            <img
              src="/favicon.png"
              alt="Simversity"
              className="h-5 w-auto"
              width={20}
              height={20}
            />
            Simversity
          </span>
          <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
            <span>&copy; 2026 Simversity</span>
            <Link
              to="/privacy"
              className="hover:text-muted-foreground transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="hover:text-muted-foreground transition-colors"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MockMessage({
  from,
  text,
  delay,
}: {
  from: 'student' | 'teacher';
  text: string;
  delay: number;
}) {
  const isTeacher = from === 'teacher';

  return (
    <div
      className={`flex animate-in fade-in slide-in-from-bottom-2 duration-500 ${isTeacher ? 'justify-end' : 'justify-start'}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isTeacher
            ? 'rounded-br-md bg-teacher/10 text-foreground'
            : 'rounded-bl-md bg-student/10 text-foreground'
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function StepCard({
  number,
  icon: Icon,
  title,
  description,
  delay,
}: {
  number: number;
  icon: typeof BookOpen;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <div
      className="relative animate-in fade-in slide-in-from-bottom-4 duration-700"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="relative z-10 mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-background text-sm font-bold sm:mx-auto">
        {number}
      </div>
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  accent,
  delay,
}: {
  icon: typeof Brain;
  title: string;
  description: string;
  accent: 'teacher' | 'student';
  delay: number;
}) {
  return (
    <div
      className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-border/80 hover:shadow-lg hover:shadow-black/5 animate-in fade-in slide-in-from-bottom-4 duration-700"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div
        className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${
          accent === 'teacher' ? 'bg-teacher/10' : 'bg-student/10'
        }`}
      >
        <Icon
          className={`h-5 w-5 ${accent === 'teacher' ? 'text-teacher' : 'text-student'}`}
        />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
