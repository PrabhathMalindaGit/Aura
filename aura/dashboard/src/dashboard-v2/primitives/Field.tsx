import type { HTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '../../utils/cn';

export interface DashboardV2FieldWrapperProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode;
  labelHidden?: boolean;
  control: ReactNode;
}

export function DashboardV2Field({
  className,
  label,
  description,
  errorMessage,
  labelHidden = false,
  control,
  ...props
}: DashboardV2FieldWrapperProps): JSX.Element {
  const descriptionId = useId();
  const errorId = useId();
  const helpText = description ? (
    <p id={descriptionId} className="v2-field__description">
      {description}
    </p>
  ) : null;
  const errorText = errorMessage ? (
    <p id={errorId} className="v2-field__error" role="alert">
      {errorMessage}
    </p>
  ) : null;

  return (
    <div className={cn('v2-field', className)} {...props}>
      <label className={cn('v2-field__label', labelHidden && 'v2-visually-hidden')}>{label}</label>
      {control}
      {helpText}
      {errorText}
    </div>
  );
}
