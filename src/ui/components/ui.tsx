import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { BackIcon } from './Icons';

export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
};

export function Button({
  variant = 'default',
  size = 'md',
  block,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        'btn',
        variant === 'primary' && 'btn--primary',
        variant === 'ghost' && 'btn--ghost',
        size === 'lg' && 'btn--lg',
        size === 'sm' && 'btn--sm',
        block && 'btn--block',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function HeroButton({
  title,
  sub,
  onClick,
  variant = 'primary',
}: {
  title: string;
  sub: string;
  onClick: () => void;
  variant?: 'default' | 'primary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('btn', 'btn--hero', 'btn--block', variant === 'primary' && 'btn--primary')}
    >
      <span style={{ fontSize: '1.05rem', fontWeight: 640 }}>{title}</span>
      <span className="btn__sub">{sub}</span>
    </button>
  );
}

export function Chip({
  on,
  onClick,
  children,
  disabled,
}: {
  on?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={clsx('chip', on && 'chip--on')}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
    >
      {children}
    </button>
  );
}

export function TopBar({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="topbar">
      {onBack && (
        <button type="button" className="iconbtn" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
      )}
      <span className="topbar__title">{title}</span>
      {right}
    </header>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

export function Meter({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'ok' | 'bad' }) {
  const colour = tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : 'var(--accent)';
  return (
    <div className="meter" role="presentation">
      <div
        className="meter__fill"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: colour }}
      />
    </div>
  );
}

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={clsx('switch', on && 'switch--on')}
      onClick={() => onChange(!on)}
    >
      <span className="switch__knob" />
    </button>
  );
}

export function SwitchRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="switchrow">
      <div className="grow">
        <div style={{ fontWeight: 540 }}>{label}</div>
        {hint && <div className="small faint">{hint}</div>}
      </div>
      <Switch on={on} onChange={onChange} label={label} />
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={clsx('segmented__item', o.value === value && 'segmented__item--on')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  label: string;
  format?: (value: number) => string;
}) {
  return (
    <div className="field">
      <div className="field__label">
        <span>{label}</span>
        <span className="tabular">{format ? format(value) : value}</span>
      </div>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Bars({ values, labels }: { values: number[]; labels?: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="bars">
      {values.map((v, i) => (
        <div
          key={i}
          className="bars__bar"
          title={labels?.[i]}
          style={{ height: '100%' }}
        >
          <span style={{ height: `${Math.round((v / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Disclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="disclosure">
      <summary>
        <span>{title}</span>
        {summary && <span className="small faint">{summary}</span>}
      </summary>
      <div>{children}</div>
    </details>
  );
}
