import Link from "next/link";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function PageShell({ children, className, containerClassName }) {
  return (
    <main
      className={cx(
        "min-h-screen bg-[var(--task-canvas)] px-4 py-8 text-[var(--task-text)] sm:px-6 sm:py-12",
        className
      )}
    >
      <div
        className={cx(
          "mx-auto w-full max-w-6xl",
          containerClassName
        )}
      >
        {children}
      </div>
    </main>
  );
}

export function Card({ children, className, as: Component = "section" }) {
  return (
    <Component
      className={cx(
        "rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-[var(--task-surface)] shadow-[var(--task-shadow-card)]",
        className
      )}
    >
      {children}
    </Component>
  );
}

const STATUS_BADGE_TONES = {
  neutral: "border-[var(--task-border)] bg-[var(--task-surface-soft)] text-[var(--task-text-muted)]",
  success: "border-[#c9dfd4] bg-[var(--task-success-soft)] text-[#285844]",
  warning: "border-[#ead9ad] bg-[var(--task-warning-soft)] text-[#704c16]",
  danger: "border-[#e8c8c3] bg-[var(--task-danger-soft)] text-[#86382f]",
  info: "border-[#cbdbe0] bg-[var(--task-info-soft)] text-[#385866]",
};

export function StatusBadge({ children, tone = "neutral", className }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-4",
        STATUS_BADGE_TONES[tone] || STATUS_BADGE_TONES.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeader({ title, description, meta, className }) {
  return (
    <div className={cx("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-[-0.025em] text-[var(--task-text)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-[var(--task-text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {meta ? <div className="shrink-0">{meta}</div> : null}
    </div>
  );
}

const BUTTON_VARIANTS = {
  primary:
    "border-transparent bg-[var(--task-primary)] text-white hover:bg-[var(--task-primary-hover)]",
  secondary:
    "border-[var(--task-border-strong)] bg-white text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]",
  quiet:
    "border-transparent bg-transparent text-[var(--task-primary)] hover:bg-[var(--task-surface-soft)]",
  danger:
    "border-transparent bg-[var(--task-danger)] text-white hover:brightness-90",
};

export function Button({
  children,
  className,
  variant = "primary",
  href,
  type = "button",
  ...props
}) {
  const classes = cx(
    "inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-55",
    BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary,
    className
  );

  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}

export function Eyebrow({ children, className }) {
  return (
    <p
      className={cx(
        "text-xs font-semibold uppercase tracking-[0.16em] text-[var(--task-primary)]",
        className
      )}
    >
      {children}
    </p>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}) {
  return (
    <header
      className={cx(
        "space-y-3",
        align === "center" && "text-center",
        className
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1 className="text-3xl font-bold tracking-[-0.035em] text-[var(--task-text)] sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="text-sm leading-6 text-[var(--task-text-muted)] sm:text-base">
          {description}
        </p>
      ) : null}
    </header>
  );
}

export function FormField({
  id,
  label,
  hint,
  error,
  className,
  inputClassName,
  as = "input",
  children,
  ...inputProps
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("space-y-2", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-[var(--task-text)]">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-[var(--task-text-muted)]">
          {hint}
        </p>
      ) : null}
      {as === "textarea" ? (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={cx(
            "min-h-24 w-full rounded-[var(--task-radius-control)] border bg-white px-3.5 py-2.5 text-sm text-[var(--task-text)] shadow-sm transition placeholder:text-[#858b84] disabled:bg-[var(--task-surface-soft)] disabled:text-[var(--task-text-muted)]",
            error
              ? "border-[var(--task-danger)]"
              : "border-[var(--task-border-strong)] hover:border-[#a9a195]",
            inputClassName
          )}
          {...inputProps}
        />
      ) : as === "select" ? (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={cx(
            "min-h-11 w-full rounded-[var(--task-radius-control)] border bg-white px-3.5 py-2.5 text-sm text-[var(--task-text)] shadow-sm transition disabled:bg-[var(--task-surface-soft)] disabled:text-[var(--task-text-muted)]",
            error
              ? "border-[var(--task-danger)]"
              : "border-[var(--task-border-strong)] hover:border-[#a9a195]",
            inputClassName
          )}
          {...inputProps}
        >
          {children}
        </select>
      ) : (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={cx(
            "min-h-11 w-full rounded-[var(--task-radius-control)] border bg-white px-3.5 py-2.5 text-sm text-[var(--task-text)] shadow-sm transition placeholder:text-[#858b84] disabled:bg-[var(--task-surface-soft)] disabled:text-[var(--task-text-muted)]",
            error
              ? "border-[var(--task-danger)]"
              : "border-[var(--task-border-strong)] hover:border-[#a9a195]",
            inputClassName
          )}
          {...inputProps}
        />
      )}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-[var(--task-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FieldGroup({ legend, hint, children, className }) {
  return (
    <fieldset className={cx("space-y-2", className)}>
      <legend className="text-sm font-semibold text-[var(--task-text)]">
        {legend}
      </legend>
      {hint ? (
        <p className="text-xs leading-5 text-[var(--task-text-muted)]">{hint}</p>
      ) : null}
      {children}
    </fieldset>
  );
}

const NOTICE_TONES = {
  neutral:
    "border-[var(--task-border)] bg-[var(--task-surface-soft)] text-[var(--task-text)]",
  info: "border-[#cbdbe0] bg-[var(--task-info-soft)] text-[#385866]",
  success:
    "border-[#c9dfd4] bg-[var(--task-success-soft)] text-[#285844]",
  warning:
    "border-[#ead9ad] bg-[var(--task-warning-soft)] text-[#704c16]",
  danger:
    "border-[#e8c8c3] bg-[var(--task-danger-soft)] text-[#86382f]",
};

export function Notice({
  children,
  title,
  tone = "neutral",
  className,
  role,
  ...props
}) {
  return (
    <div
      role={role}
      className={cx(
        "rounded-[var(--task-radius-control)] border px-4 py-3 text-sm leading-6",
        NOTICE_TONES[tone] || NOTICE_TONES.neutral,
        className
      )}
      {...props}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}

export function FormFeedback({ children, tone = "danger", className }) {
  const isError = tone === "danger";

  return (
    <Notice
      tone={tone}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={className}
    >
      {children}
    </Notice>
  );
}
