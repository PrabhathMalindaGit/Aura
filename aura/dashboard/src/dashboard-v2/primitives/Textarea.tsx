import {
  Label,
  TextArea as AriaTextArea,
  TextField,
  type TextAreaProps as AriaTextAreaProps,
  type TextFieldProps,
} from 'react-aria-components';
import { useId } from 'react';
import { cn } from '../../utils/cn';

export interface DashboardV2TextareaProps
  extends Omit<TextFieldProps, 'children'>,
    Omit<AriaTextAreaProps, 'children'> {
  label: string;
  description?: string;
  errorMessage?: string;
  labelHidden?: boolean;
}

export function DashboardV2Textarea({
  className,
  label,
  description,
  errorMessage,
  labelHidden = false,
  isInvalid = Boolean(errorMessage),
  ...props
}: DashboardV2TextareaProps): JSX.Element {
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
      <AriaTextArea className="v2-textarea" {...props} />
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
