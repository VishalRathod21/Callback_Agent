/* Public landing page — premium dark SaaS aesthetic, built from the UI kit + tokens. */
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, FileSearch, Network, SlidersHorizontal, ClipboardCheck, Mic, BarChart3,
  Upload, Settings2, MessageSquare, FileCheck, Code2, Cpu, Users, Sparkles, Target, Clock, TrendingUp,
  LayoutDashboard, FileText, History, Settings, Bot, User, ChevronRight,
} from 'lucide-react';
import PublicNav from '../components/layout/PublicNav';
import { Logo } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { Button, Badge, ScoreRing, Progress, StatCard } from '../components/ui';

/* ── Shared bits ────────────────────────────────────────────────────────── */
function Container({ className = '', children }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

function Eyebrow({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-xs font-medium text-primary ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      {children}
    </span>
  );
}

function SectionHeading({ eyebrow, title, description, align = 'center' }) {
  const center = align === 'center';
  return (
    <div className={`max-w-3xl ${center ? 'text-center mx-auto' : ''}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 text-3xl md:text-[44px] font-semibold tracking-[-0.03em] leading-[1.1] text-fg">{title}</h2>
      {description && <p className="t-body mt-4 text-[15px] md:text-base">{description}</p>}
    </div>
  );
}

/* Alternating section wrapper: every other section gets a tinted band with hairlines. */
function Section({ id, tinted = false, className = '', children }) {
  return (
    <section id={id} className={`relative py-24 md:py-32 ${tinted ? 'bg-surface/40 border-y border-border' : ''} ${className}`}>
      {children}
    </section>
  );
}

function GradientIconTile({ icon: Icon, size = 18, className = '' }) {
  return (
    <span className={`h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-primary to-secondary grid place-items-center text-white shadow-[0_8px_24px_-8px_rgba(139,92,246,0.7)] ${className}`}>
      <Icon size={size} />
    </span>
  );
}

/* Gradient 1px border wrapper: outer gradient, inner card. */
function GradientFrame({ className = '', innerClassName = '', glow = false, children }) {
  return (
    <div className={`relative rounded-2xl p-px ${className}`} style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.55), rgba(39,39,42,0.9) 40%, rgba(39,39,42,0.9) 60%, rgba(34,211,238,0.45))' }}>
      {glow && <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[40px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.28),transparent_65%)] blur-2xl" />}
      <div className={`relative rounded-[15px] bg-surface overflow-hidden ${innerClassName}`}>{children}</div>
    </div>
  );
}

/* ── Hero ───────────────────────────────────────────────────────────────── */
const WAVE = [6, 12, 20, 28, 18, 32, 24, 14, 30, 22, 10, 26, 34, 18, 8, 22, 28, 14, 20, 10, 16, 30, 24, 12];

function ProductMock() {
  return (
    <GradientFrame glow className="max-w-4xl mx-auto animate-fade-up" innerClassName="text-left">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-border bg-elevated/60">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <div className="ml-4 hidden sm:flex items-center gap-1 rounded-full border border-border bg-bg/60 p-0.5">
          <span className="rounded-full px-3 py-1 text-xs text-dim">DSA</span>
          <span className="rounded-full px-3 py-1 text-xs text-fg bg-elevated shadow-card">Technical</span>
          <span className="rounded-full px-3 py-1 text-xs text-dim">HR</span>
        </div>
        <span className="ml-auto t-meta hidden sm:inline">Question 3 of 6</span>
        <Badge tone="warning">medium</Badge>
      </div>

      <div className="grid md:grid-cols-[1fr_240px]">
        {/* Conversation */}
        <div className="p-4 sm:p-6 space-y-4 min-w-0">
          {/* Question card */}
          <div className="rounded-xl border border-border bg-elevated/70 p-4">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-secondary grid place-items-center text-white"><Bot size={13} /></span>
              <span className="text-xs font-medium text-muted">Technical agent</span>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse2" /> Listening
              </span>
            </div>
            <p className="mt-3 text-sm text-fg leading-relaxed">
              Your resume mentions building a FastAPI service with Redis caching. How did you decide what to cache, and how did you handle invalidation?
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg/60 px-2 py-0.5 text-[11px] text-muted"><FileSearch size={11} /> Grounded in your resume: projects#3</span>
              <span className="inline-flex items-center rounded-md border border-border bg-bg/60 px-2 py-0.5 text-[11px] text-muted">experience#1</span>
            </div>
          </div>

          {/* Transcript bubble */}
          <div className="flex gap-3">
            <span className="h-6 w-6 shrink-0 rounded-md bg-elevated border border-border text-muted grid place-items-center"><User size={13} /></span>
            <div className="min-w-0">
              <div className="rounded-xl rounded-tl-sm border border-border bg-bg/60 px-4 py-3 text-sm text-muted leading-relaxed">
                We cached read-heavy product lookups with a TTL and invalidated on write through a pub/sub channel…
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-md bg-success-soft text-success px-2 py-0.5 font-medium">technical 8</span>
                <span className="rounded-md bg-success-soft text-success px-2 py-0.5 font-medium">conceptual 7</span>
                <span className="rounded-md bg-success-soft text-success px-2 py-0.5 font-medium">completeness 8</span>
                <span className="rounded-md bg-success-soft text-success px-2 py-0.5 font-medium">clarity 9</span>
                <span className="inline-flex items-center gap-1 text-dim"><ChevronRight size={12} /> next:</span>
                <span className="rounded-md bg-error-soft text-error px-2 py-0.5 font-medium">hard</span>
              </div>
            </div>
          </div>

          {/* Waveform */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-elevated/50 px-4 py-3">
            <span className="h-8 w-8 shrink-0 rounded-full bg-primary grid place-items-center text-white shadow-glow"><Mic size={14} /></span>
            <div className="flex items-end gap-[3px] h-8 flex-1 min-w-0 overflow-hidden">
              {WAVE.map((h, i) => (
                <span key={i} className="w-[3px] rounded-full bg-gradient-to-t from-primary to-accent" style={{ height: `${h}px`, opacity: 0.45 + (h / 34) * 0.55 }} />
              ))}
            </div>
            <span className="t-meta tabular-nums shrink-0">00:42</span>
          </div>
        </div>

        {/* Side rail */}
        <aside className="hidden md:flex flex-col border-l border-border bg-elevated/40 p-5 gap-5">
          <div>
            <div className="t-label">Round progress</div>
            <div className="mt-3 space-y-2">
              {[['DSA', 100, 'success'], ['Technical', 50, 'primary'], ['HR', 0, 'neutral']].map(([n, v, t]) => (
                <div key={n}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-muted">{n}</span><span className="text-dim tabular-nums">{v}%</span></div>
                  <Progress value={v} tone={t} height={4} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="t-label">Difficulty</div>
            <div className="mt-3 flex gap-1">
              {['easy', 'medium', 'hard'].map((d) => (
                <span key={d} className={`flex-1 h-1.5 rounded-full ${d === 'hard' ? 'bg-border' : 'bg-gradient-to-r from-primary to-secondary'}`} />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-dim"><span>easy</span><span>medium</span><span>hard</span></div>
          </div>
          <div className="mt-auto rounded-lg border border-border bg-bg/50 p-3">
            <div className="flex items-center gap-2 text-xs text-muted"><ClipboardCheck size={13} className="text-primary" /> Rubric</div>
            <div className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight">8.1 <span className="text-xs font-normal text-dim">/ 10</span></div>
          </div>
        </aside>
      </div>
      <div className="px-4 py-2 border-t border-border bg-elevated/40 text-right"><span className="t-meta">Illustrative sample</span></div>
    </GradientFrame>
  );
}

function Hero() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  return (
    <section id="hero" className="relative overflow-hidden">
      {/* Background stage: radial violet/cyan glows + dot grid */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-5%,rgba(139,92,246,0.32),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_85%_35%,rgba(34,211,238,0.10),transparent_70%)]" />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full text-fg/[0.14]"
        style={{ maskImage: 'radial-gradient(ellipse 70% 60% at 50% 20%, black 20%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 20%, black 20%, transparent 75%)' }}
      >
        <defs>
          <pattern id="hero-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-dots)" />
      </svg>

      <Container className="relative pt-20 pb-24 md:pt-32 md:pb-32 text-center">
        <Eyebrow className="animate-fade-up">Resume-aware AI mock interviews</Eyebrow>
        <h1 className="mt-7 text-5xl md:text-7xl font-semibold tracking-[-0.04em] leading-[1.02] max-w-4xl mx-auto animate-fade-up">
          Practice Smarter. Interview Better.{' '}
          <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Get Hired.</span>
        </h1>
        <p className="t-body text-base md:text-lg mt-7 max-w-2xl mx-auto animate-fade-up">
          Your personalized AI interview partner that understands your resume, simulates real technical interviews, and helps you improve with actionable feedback.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-up">
          <Button size="lg" iconRight={ArrowRight} className="shadow-[0_8px_30px_-8px_rgba(139,92,246,0.9)]" onClick={() => navigate(isAuthenticated ? '/dashboard' : '/signup')}>Start free</Button>
          <Button size="lg" variant="secondary" className="border-border-strong" onClick={() => navigate('/practice')}>Try quick practice</Button>
        </div>
        <p className="t-meta mt-5">No credit card. Text or voice. Three interview rounds.</p>

        <div className="mt-16 md:mt-20">
          <ProductMock />
        </div>
      </Container>
    </section>
  );
}

/* ── Features (bento) ───────────────────────────────────────────────────── */
const FEATURES_SMALL = [
  { icon: Network, title: 'LangGraph multi-agent orchestration', body: 'DSA, Technical, HR, Evaluation and Report agents coordinate through a stateful graph instead of a single long prompt.' },
  { icon: ClipboardCheck, title: 'Rubric evaluation', body: 'Technical correctness 40%, conceptual understanding 25%, completeness 20%, communication 15% — scored with evidence.' },
  { icon: Mic, title: 'Voice interviews', body: 'Deepgram speech-to-text and ElevenLabs text-to-speech for a spoken interview, with a text fallback that always works.' },
  { icon: BarChart3, title: 'PDF reports & analytics', body: 'Download a per-session PDF report and track round-by-round scores and trends across all your sessions.' },
];

const featureCardCls = 'group relative flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-card transition-all duration-200 hover:border-border-strong hover:-translate-y-0.5 hover:shadow-pop overflow-hidden min-w-0';
const TopHighlight = () => <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-fg/20 to-transparent" />;

function RagIllustration() {
  const chunks = [
    { id: 'projects#3', text: 'Built a FastAPI service with Redis caching…', hot: true },
    { id: 'experience#1', text: 'Backend Engineer Intern — reduced p95 latency…', hot: true },
    { id: 'skills#2', text: 'Python, Docker, PostgreSQL, Redis' },
    { id: 'education#1', text: 'M.Tech, AI & Data Science' },
  ];
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div className="space-y-1.5">
        {chunks.map((c) => (
          <div key={c.id} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] ${c.hot ? 'border-primary/40 bg-primary-soft text-fg' : 'border-border bg-elevated/60 text-dim'}`}>
            <span className={`font-mono shrink-0 ${c.hot ? 'text-primary' : 'text-dim'}`}>{c.id}</span>
            <span className="truncate">{c.text}</span>
          </div>
        ))}
      </div>
      <div className="hidden sm:flex flex-col items-center text-dim">
        <span className="text-[10px] uppercase tracking-wider">FAISS</span>
        <ArrowRight size={16} className="text-primary mt-1" />
      </div>
      <div className="rounded-lg border border-border bg-elevated/70 p-3">
        <div className="flex items-center gap-2 text-[11px] text-muted"><Bot size={12} className="text-primary" /> Generated question</div>
        <p className="mt-2 text-xs text-fg leading-relaxed">How did you decide what to cache in the FastAPI service, and how did you handle invalidation?</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded border border-primary/30 bg-primary-soft px-1.5 py-0.5 text-[10px] font-mono text-primary">projects#3</span>
          <span className="rounded border border-primary/30 bg-primary-soft px-1.5 py-0.5 text-[10px] font-mono text-primary">experience#1</span>
        </div>
      </div>
    </div>
  );
}

function AdaptiveChart() {
  return (
    <svg viewBox="0 0 240 150" className="mt-6 w-full h-auto" role="img" aria-label="Stepped chart: difficulty rises from easy to medium to hard as scores increase.">
      <defs>
        <linearGradient id="adaptive-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[30, 70, 110].map((y) => <line key={y} x1="0" x2="240" y1={y} y2={y} className="stroke-border" strokeWidth="1" strokeDasharray="3 4" />)}
      <text x="4" y="26" className="fill-dim text-[9px] uppercase">hard</text>
      <text x="4" y="66" className="fill-dim text-[9px] uppercase">medium</text>
      <text x="4" y="106" className="fill-dim text-[9px] uppercase">easy</text>
      <path d="M 0 110 L 60 110 L 60 70 L 130 70 L 130 30 L 200 30 L 200 70 L 240 70 L 240 150 L 0 150 Z" fill="url(#adaptive-fill)" />
      <path d="M 0 110 L 60 110 L 60 70 L 130 70 L 130 30 L 200 30 L 200 70 L 240 70" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinejoin="round" />
      {[[48, 110, '6.5'], [95, 70, '8.4'], [165, 30, '9.1'], [220, 70, '3.9']].map(([x, y, s]) => (
        <g key={x}>
          <circle cx={x} cy={y} r="4" className="fill-surface" stroke="#22D3EE" strokeWidth="2" />
          <text x={x} y={y - 9} textAnchor="middle" className="fill-muted text-[9px] font-mono">{s}</text>
        </g>
      ))}
      <text x="120" y="142" textAnchor="middle" className="fill-dim text-[9px]">score ≥ 8 → harder · score ≤ 4 → easier</text>
    </svg>
  );
}

function Features() {
  return (
    <Section id="features">
      <Container>
        <SectionHeading eyebrow="Features" title="Everything a real interview has, minus the stakes" description="Built as a retrieval-augmented, multi-agent system so the questions are about you and the feedback is specific." />
        <div className="mt-16 grid gap-4 md:grid-cols-6">
          {/* Wide card */}
          <div className={`${featureCardCls} md:col-span-4`}>
            <TopHighlight />
            <GradientIconTile icon={FileSearch} />
            <h3 className="mt-5 text-lg font-semibold tracking-tight">Resume-aware RAG questions</h3>
            <p className="t-body mt-2 max-w-lg">FAISS retrieval over your resume chunks grounds every question in your real experience, with source citations you can inspect.</p>
            <RagIllustration />
          </div>
          {/* Tall card */}
          <div className={`${featureCardCls} md:col-span-2 md:row-span-2`}>
            <TopHighlight />
            <GradientIconTile icon={SlidersHorizontal} />
            <h3 className="mt-5 text-lg font-semibold tracking-tight">Adaptive difficulty</h3>
            <p className="t-body mt-2">Score ≤ 4 steps the next question easier; ≥ 8 steps it harder. Thresholds are configurable per session.</p>
            <AdaptiveChart />
            <ul className="mt-6 space-y-2 text-xs">
              {[['score ≤ 4', 'step easier', 'success'], ['score 5 – 7', 'stay at level', 'warning'], ['score ≥ 8', 'step harder', 'error']].map(([k, v, t]) => (
                <li key={k} className="flex items-center justify-between rounded-md border border-border bg-elevated/50 px-3 py-2">
                  <span className="font-mono text-muted">{k}</span>
                  <Badge tone={t}>{v}</Badge>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6 flex flex-wrap gap-1.5">
              <Badge tone="success">easy</Badge><Badge tone="warning">medium</Badge><Badge tone="error">hard</Badge>
            </div>
          </div>
          {FEATURES_SMALL.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className={`${featureCardCls} ${i < 2 ? 'md:col-span-2' : 'md:col-span-3'}`}>
              <TopHighlight />
              <GradientIconTile icon={Icon} />
              <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{title}</h3>
              <p className="t-body mt-2">{body}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/* ── How it works (timeline) ────────────────────────────────────────────── */
const STEPS = [
  { icon: Upload, title: 'Upload resume', body: 'Drop in a PDF. We parse it, chunk it and index it for retrieval.' },
  { icon: Settings2, title: 'Configure interview', body: 'Pick rounds, difficulty, question count and voice or text mode.' },
  { icon: MessageSquare, title: 'Interview with AI agents', body: 'Answer resume-grounded questions while difficulty adapts to you.' },
  { icon: FileCheck, title: 'Review report', body: 'Get rubric scores, strengths, gaps and a downloadable PDF.' },
];

function HowItWorks() {
  return (
    <Section id="how-it-works" tinted>
      <Container>
        <SectionHeading eyebrow="How it works" title="From resume to report in four steps" description="A single flow, start to finish, with no setup beyond a PDF." />
        <ol className="relative mt-16 grid gap-10 lg:grid-cols-4 lg:gap-6">
          {/* Connecting line: horizontal on desktop, vertical on mobile */}
          <span aria-hidden="true" className="absolute left-5 top-0 bottom-0 w-px bg-gradient-to-b from-primary/60 via-border-strong to-transparent lg:hidden" />
          <span aria-hidden="true" className="hidden lg:block absolute top-5 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-primary/70 via-border-strong to-accent/60" />
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative flex lg:flex-col gap-5 lg:gap-0 lg:items-center lg:text-center">
              <span className="relative z-10 h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-primary to-secondary text-white grid place-items-center text-sm font-semibold shadow-[0_0_0_6px_rgba(9,9,11,1),0_8px_24px_-6px_rgba(139,92,246,0.8)]">
                {i + 1}
              </span>
              <div className="lg:mt-6 min-w-0">
                <span className="inline-flex h-9 w-9 rounded-md bg-elevated border border-border text-muted items-center justify-center"><Icon size={17} /></span>
                <h3 className="h-card mt-3">{title}</h3>
                <p className="t-body mt-1.5 lg:max-w-[240px] lg:mx-auto">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

/* ── Capabilities + agent graph ─────────────────────────────────────────── */
const ROUNDS = [
  { icon: Code2, title: 'DSA round', body: 'Algorithm problems in a code editor, evaluated for correctness, complexity and approach.' },
  { icon: Cpu, title: 'Technical round', body: 'Deep-dives on the systems, languages and projects actually on your resume.' },
  { icon: Users, title: 'HR / behavioural round', body: 'Situational questions scored for structure, clarity and self-awareness.' },
];

function GraphNode({ x, y, w = 132, h = 40, label, sub, tone = 'neutral', pulse = false }) {
  const fill = { neutral: 'fill-elevated', primary: 'fill-primary-soft', accent: 'fill-accent-soft', success: 'fill-success-soft' }[tone];
  const stroke = { neutral: 'stroke-border-strong', primary: 'stroke-primary', accent: 'stroke-accent', success: 'stroke-success' }[tone];
  const text = { neutral: 'fill-fg', primary: 'fill-primary', accent: 'fill-accent', success: 'fill-success' }[tone];
  return (
    <g>
      {pulse && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={13} className="fill-none stroke-primary animate-pulse2" strokeWidth={1.5} opacity={0.6} />}
      <rect x={x} y={y} width={w} height={h} rx={10} className={`${fill} ${stroke}`} strokeWidth={1.25} />
      <text x={x + w / 2} y={sub ? y + 18 : y + h / 2 + 4} textAnchor="middle" className={`${text} text-[12px] font-medium`}>{label}</text>
      {sub && <text x={x + w / 2} y={y + 31} textAnchor="middle" className="fill-dim text-[9px]">{sub}</text>}
    </g>
  );
}

function AgentGraph() {
  // Orchestrator (top) → three round agents → Evaluation → Adaptive policy → dashed feedback to Orchestrator
  return (
    <svg viewBox="0 0 480 360" role="img" aria-label="Agent graph: Orchestrator routes to DSA, Technical and HR agents, whose answers go to the Evaluation agent, then the adaptive policy feeds the next difficulty back into the orchestrator." className="w-full h-auto">
      <defs>
        <marker id="g-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-dim" />
        </marker>
        <marker id="g-arrow-primary" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
        </marker>
        <pattern id="g-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" className="fill-fg" opacity="0.06" />
        </pattern>
      </defs>
      <rect width="480" height="360" fill="url(#g-grid)" />

      {/* Solid directed edges */}
      <g className="stroke-border-strong" strokeWidth={1.5} fill="none" markerEnd="url(#g-arrow)">
        <path d="M 240 66 L 240 92 L 90 92 L 90 118" />
        <path d="M 240 66 L 240 118" />
        <path d="M 240 66 L 240 92 L 390 92 L 390 118" />
        <path d="M 90 158 L 90 186 L 240 186 L 240 212" />
        <path d="M 240 158 L 240 212" />
        <path d="M 390 158 L 390 186 L 240 186" markerEnd="none" />
        <path d="M 240 252 L 240 290" />
      </g>
      {/* Dashed feedback edge */}
      <path d="M 174 310 L 40 310 L 40 46 L 168 46" className="stroke-primary" strokeWidth={1.5} fill="none" strokeDasharray="5 5" markerEnd="url(#g-arrow-primary)" />
      <rect x={28} y={160} width={24} height={82} rx={4} className="fill-surface" />
      <text x={40} y={201} className="fill-primary text-[10px] font-medium" textAnchor="middle" transform="rotate(-90 40 201)">next difficulty</text>

      <GraphNode x={168} y={26} w={144} label="Orchestrator" sub="LangGraph router" tone="primary" pulse />
      <GraphNode x={24} y={118} label="DSA agent" sub="code editor" />
      <GraphNode x={174} y={118} label="Technical agent" sub="resume RAG" />
      <GraphNode x={324} y={118} label="HR agent" sub="behavioural" />
      <GraphNode x={168} y={212} w={144} label="Evaluation agent" sub="weighted rubric" tone="success" />
      <GraphNode x={174} y={290} label="Adaptive policy" tone="accent" />
    </svg>
  );
}

function Capabilities() {
  return (
    <Section id="capabilities">
      <Container>
        <SectionHeading eyebrow="Capabilities" title="AI-powered interview capabilities" align="left" description="Three rounds, each run by a specialised agent. A LangGraph state machine decides who speaks next and how hard the next question should be." />
        <div className="mt-16 grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div className="space-y-3">
            {ROUNDS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="group relative rounded-2xl border border-border bg-surface p-5 flex gap-4 transition-all duration-200 hover:border-border-strong hover:-translate-y-0.5 shadow-card overflow-hidden">
                <TopHighlight />
                <GradientIconTile icon={Icon} />
                <div className="min-w-0">
                  <h3 className="h-card">{title}</h3>
                  <p className="t-body mt-1">{body}</p>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-border bg-elevated/50 p-5">
              <div className="t-label">Evaluation output</div>
              <ul className="mt-3 space-y-2.5 text-sm text-muted">
                <li className="flex gap-2.5"><Sparkles size={15} className="text-primary shrink-0 mt-0.5" /> Weighted rubric score with per-criterion feedback and quoted evidence.</li>
                <li className="flex gap-2.5"><SlidersHorizontal size={15} className="text-primary shrink-0 mt-0.5" /> A difficulty decision (easier / same / harder) fed back into the orchestrator.</li>
                <li className="flex gap-2.5"><FileCheck size={15} className="text-primary shrink-0 mt-0.5" /> A final report agent that aggregates rounds into a PDF.</li>
              </ul>
            </div>
          </div>

          <GradientFrame innerClassName="p-5 md:p-6 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="h-card">Agent graph</h3>
                <p className="t-meta mt-0.5">Simplified view of the LangGraph workflow</p>
              </div>
              <Badge tone="primary" dot className="shrink-0 whitespace-nowrap">live routing</Badge>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-bg/60 p-2 overflow-hidden">
              <AgentGraph />
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Legend">
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-primary bg-primary-soft" /> router</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-border-strong bg-elevated" /> round agents</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-success bg-success-soft" /> evaluation</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-accent bg-accent-soft" /> adaptive policy</li>
              <li className="flex items-center gap-2"><span className="w-5 border-t border-dashed border-primary" /> feedback loop</li>
            </ul>
          </GradientFrame>
        </div>
      </Container>
    </Section>
  );
}

/* ── Analytics preview ──────────────────────────────────────────────────── */
const SAMPLE_CRITERIA = [
  { label: 'Technical correctness', weight: '40%', value: 82 },
  { label: 'Conceptual understanding', weight: '25%', value: 74 },
  { label: 'Answer completeness', weight: '20%', value: 68 },
  { label: 'Communication clarity', weight: '15%', value: 88 },
];

const DASH_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: FileText, label: 'Resumes' },
  { icon: History, label: 'Sessions' },
  { icon: BarChart3, label: 'Analytics' },
  { icon: Settings, label: 'Settings' },
];

function AnalyticsPreview() {
  return (
    <Section id="analytics" tinted>
      <Container>
        <SectionHeading eyebrow="Analytics" title="Performance analytics preview" description="Every session ends with rubric scores, round breakdowns and trends over time, so you know exactly what to practise next." />
        <div className="mt-16 relative">
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10"><Badge tone="warning">Illustrative sample — not real user data</Badge></div>
          <GradientFrame glow innerClassName="grid md:grid-cols-[200px_1fr]">
            {/* Sidebar sliver */}
            <aside className="hidden md:flex flex-col border-r border-border bg-elevated/40 p-4 gap-1">
              <div className="flex items-center gap-2 px-2 pb-4 mb-2 border-b border-border">
                <span className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-secondary grid place-items-center text-white"><Mic size={12} /></span>
                <span className="text-[13px] font-semibold tracking-tight">Callback</span>
              </div>
              {DASH_NAV.map(({ icon: Icon, label, active }) => (
                <span key={label} className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] ${active ? 'bg-elevated text-fg' : 'text-dim'}`}><Icon size={15} /> {label}</span>
              ))}
              <div className="mt-auto rounded-md border border-border bg-bg/50 p-3">
                <div className="t-meta">Signed in as</div>
                <div className="text-xs text-muted mt-0.5">sample user</div>
              </div>
            </aside>

            {/* Content */}
            <div className="min-w-0 p-5 md:p-7">
              <div className="flex items-center justify-between gap-4 pt-2">
                <div>
                  <div className="t-label">Last session</div>
                  <h3 className="text-lg font-semibold tracking-tight mt-1">Technical round · 6 questions</h3>
                </div>
                <Badge tone="success" className="hidden sm:inline-flex">Report ready</Badge>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center rounded-xl border border-border bg-bg/50 p-5">
                <div className="flex flex-col items-center gap-3 lg:pr-6 lg:border-r lg:border-border">
                  <ScoreRing value={78} size={132} stroke={10} label="overall" />
                  <div className="flex gap-2">
                    <Badge tone="success">Technical 8.1</Badge>
                    <Badge tone="warning">HR 6.9</Badge>
                  </div>
                </div>
                <div className="space-y-4 min-w-0">
                  {SAMPLE_CRITERIA.map((c) => (
                    <div key={c.label}>
                      <div className="flex items-center justify-between text-sm mb-1.5 gap-3">
                        <span className="text-fg truncate">{c.label} <span className="t-meta ml-1">· weight {c.weight}</span></span>
                        <span className="tabular-nums text-muted shrink-0">{c.value}%</span>
                      </div>
                      <Progress value={c.value} tone={c.value >= 75 ? 'success' : 'warning'} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <StatCard label="Sessions" value="12" sub="3 this week" icon={Target} tone="primary" className="bg-bg/50" />
                <StatCard label="Avg. answer time" value="1m 48s" sub="down from 2m 30s" icon={Clock} tone="accent" className="bg-bg/50" />
                <StatCard label="Score trend" value="+14%" sub="last 5 sessions" icon={TrendingUp} tone="success" className="bg-bg/50" />
              </div>
            </div>
          </GradientFrame>
          <p className="t-meta text-center mt-5">Illustrative sample. Numbers shown are placeholders, not measurements from real users.</p>
        </div>
      </Container>
    </Section>
  );
}

/* ── CTA band ───────────────────────────────────────────────────────────── */
function CTA() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  return (
    <Section>
      <Container>
        <GradientFrame glow innerClassName="px-6 py-14 md:px-16 md:py-20 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,rgba(139,92,246,0.25),transparent_70%)]" />
          <div className="relative">
            <Eyebrow>Ready when you are</Eyebrow>
            <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-[-0.03em] leading-[1.08] max-w-2xl mx-auto">Rehearse the interview before it matters.</h2>
            <p className="t-body text-[15px] md:text-base mt-4 max-w-lg mx-auto">Upload a resume and run your first adaptive mock interview in minutes.</p>
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" iconRight={ArrowRight} className="shadow-[0_8px_30px_-8px_rgba(139,92,246,0.9)]" onClick={() => navigate(isAuthenticated ? '/dashboard' : '/signup')}>{isAuthenticated ? 'Open dashboard' : 'Create a free account'}</Button>
              <Button size="lg" variant="secondary" className="border-border-strong" onClick={() => navigate('/practice')}>Try quick practice</Button>
            </div>
          </div>
        </GradientFrame>
      </Container>
    </Section>
  );
}

/* ── Footer ─────────────────────────────────────────────────────────────── */
const FOOTER_COLS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Capabilities', href: '#capabilities' },
      { label: 'Analytics', href: '#analytics' },
    ],
  },
  {
    heading: 'Get started',
    links: [
      { label: 'Quick practice', to: '/practice' },
      { label: 'Sign in', to: '/signin' },
      { label: 'Create account', to: '/signup' },
    ],
  },
];

function Footer() {
  const scrollTo = (href) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <footer className="border-t border-border bg-surface/40">
      <Container className="py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="t-body mt-4 max-w-xs">Resume-aware, multi-agent mock interviews with adaptive difficulty and rubric-based feedback.</p>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.heading}>
            <div className="t-label">{col.heading}</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.to ? <Link to={l.to} className="text-muted hover:text-fg transition-colors">{l.label}</Link>
                    : l.href ? <button type="button" onClick={() => scrollTo(l.href)} className="text-muted hover:text-fg transition-colors">{l.label}</button>
                      : <span className="text-dim">{l.label}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <Container className="pb-8">
        <p className="t-meta border-t border-border pt-6">© {new Date().getFullYear()} Callback Rehearsal. All rights reserved.</p>
      </Container>
    </footer>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Landing() {
  return (
    <div className="min-h-screen bg-bg text-fg overflow-x-hidden">
      <PublicNav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Capabilities />
        <AnalyticsPreview />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
