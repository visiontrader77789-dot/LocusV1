"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevronDown } from "./icons";

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  className = "",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded-[6px] transition-colors duration-120 select-none disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap active:scale-[0.98]";
  const sizes = {
    sm: "h-7 px-2.5 text-[12.5px]",
    md: "h-8 px-3.5 text-[13px]",
    lg: "h-9 px-4 text-[13.5px]",
  };
  const variants = {
    primary: "bg-accent text-accent-ink hover:bg-accent-hi shadow-[var(--shadow-1)]",
    secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-ink-3",
    ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
    danger: "bg-danger text-white hover:opacity-90 shadow-[var(--shadow-1)]",
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconBtn({
  children,
  onClick,
  label,
  disabled,
  className = "",
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`icon-btn tooltip ${active ? "bg-surface-2 text-ink" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  className = "",
  autoFocus,
  type = "text",
  onKeyDown,
  maxLength,
  ariaLabel,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  type?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  maxLength?: number;
  ariaLabel?: string;
}) {
  return (
    <input
      type={type}
      className={`text-input ${className}`}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={maxLength}
      aria-label={ariaLabel}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center gap-0.5 font-mono text-[10px] px-1.5 h-[18px] rounded-[4px] border border-line bg-surface-2 text-ink-2 min-w-[18px] justify-center">
      {children}
    </kbd>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-[2px] border-line-strong border-t-accent"
      style={{ width: size, height: size, animation: "locus-spin 700ms linear infinite" }}
      aria-hidden="true"
    />
  );
}

export function Menu({
  trigger,
  children,
  align = "end",
  width = 200,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          className={`absolute z-40 mt-1 bg-surface border border-line rounded-[6px] shadow-[var(--shadow-2)] anim-pop p-1 ${
            align === "end" ? "right-0" : "left-0"
          }`}
          style={{ width }}
          role="menu"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  active,
  leading,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  leading?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-left rounded-[5px] transition-colors ${
        danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-surface-2"
      } ${active ? "bg-accent-soft text-accent-hi" : ""} ${
        disabled ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      {leading && <span className="text-ink-3 shrink-0">{leading}</span>}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-2 pb-1 eyebrow">{children}</div>;
}

export function Select({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-surface border border-line-strong rounded-[6px] h-8 pl-3 pr-8 text-[13px] text-ink cursor-pointer hover:border-ink-3 transition-colors focus:outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <IconChevronDown
        size={13}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-150 ${
        checked ? "bg-accent" : "bg-surface-3 border border-line-strong"
      }`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[var(--shadow-1)] transition-all duration-150 ${
          checked ? "left-[18px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

export function EmptyState({
  mark,
  title,
  body,
  action,
  compact,
}: {
  mark?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-10" : "py-20"}`}>
      {mark && <div className="mb-5 text-ink-3">{mark}</div>}
      <h3 className="font-display font-semibold text-[15px] tracking-tight">{title}</h3>
      {body && <p className="mt-1.5 text-[13px] text-ink-2 max-w-[320px]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
