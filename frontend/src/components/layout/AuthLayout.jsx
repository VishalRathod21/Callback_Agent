/* Two-column authentication layout: form on the left, product proof on the right. */
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from './AppShell';

const POINTS = [
  'Questions grounded in your own resume via retrieval',
  'Difficulty adapts to how well you answer',
  'Rubric-based scoring with evidence from your answers',
  'Voice or text interviews, PDF report at the end',
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-bg grid lg:grid-cols-2">
      <div className="flex flex-col px-6 py-6 lg:px-16">
        <Logo />
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[400px] mx-auto lg:mx-0 py-10">
            <h1 className="h-page">{title}</h1>
            {subtitle && <p className="t-body mt-2">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
          </div>
        </div>
        <p className="t-meta">© {new Date().getFullYear()} Callback Rehearsal · <Link to="/" className="link">Home</Link></p>
      </div>
      <div className="hidden lg:flex relative overflow-hidden border-l border-border bg-surface">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(34,211,238,0.10),transparent_55%)]" />
        <div className="relative m-auto max-w-md p-12">
          <div className="t-label mb-3">Why Callback Rehearsal</div>
          <h2 className="text-2xl font-semibold tracking-tight leading-snug">Practice smarter. Interview better. Get hired.</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-sm text-muted"><CheckCircle2 size={18} className="text-primary shrink-0" /> {p}</li>
            ))}
          </ul>
          <div className="mt-10 card-elevated p-4 text-xs text-dim font-mono leading-relaxed">
            <div className="text-muted">evaluation.json</div>
            <pre className="mt-2 whitespace-pre-wrap">{`{ "technical_correctness": 8,
  "conceptual_understanding": 7,
  "answer_completeness": 8,
  "communication_clarity": 9,
  "overall_score": 7.95,
  "next_difficulty": "hard" }`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
