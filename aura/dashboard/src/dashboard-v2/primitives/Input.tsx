import {
  Input as AriaInput,
  Label,
  TextField,
  type InputProps as AriaInputProps,
  type TextFieldProps,
} from 'react-aria-components';
import { useId } from 'react';
import { cn } from '../../utils/cn';

export interface DashboardV2InputProps
  extends Omit<TextFieldProps, 'children'>,
    Omit<AriaInputProps, 'children'> {
  label: string;
  description?: string;
  errorMessage?: string;
  labelHidden?: boolean;
}

export function DashboardV2Input({
  className,
  label,
  description,
  errorMessage,
  labelHidden = false,
  isInvalid = Boolean(errorMessage),
  ...props
}: DashboardV2InputProps): JSX.Element {
  const descriptionId = useId();
  const errorId = useId();

  return (
    <TextField
      className={cn('v2-field', className)}
      aria-describedby={
        [description ? descriptionId : null, errorMessage ? errorId : null].filter(Boolean).join(' ') || undefined
      }
      isInvalid={isInvalid}
    >
      <Label className={cn('v2-field__label', labelHidden && 'v2-visually-hidden')}>{label}</Label>
      <AriaInput className="v2-input" {...props} />
      {description ? (
        <p id={descriptionId} className="v2-field__description">
          {description}
        </p>
      ) : null}
      {errorMessage ? (
        <p id={errorId} className="v2-field__error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </TextField>
  );
}
