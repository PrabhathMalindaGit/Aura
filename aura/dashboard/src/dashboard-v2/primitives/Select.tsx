import {
  Button,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  type Key,
  type SelectProps as AriaSelectProps,
} from 'react-aria-components';
import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../utils/cn';
import { DashboardV2Icon } from './Icon';

export interface DashboardV2SelectOption {
  id: string;
  label: string;
  description?: string;
}

export interface DashboardV2SelectProps
  extends Omit<AriaSelectProps<object>, 'children' | 'items' | 'selectedKey' | 'defaultSelectedKey' | 'onSelectionChange'> {
  label: string;
  options: DashboardV2SelectOption[];
  selectedKey?: string | null;
  defaultSelectedKey?: string | null;
  onSelectionChange?: (value: string) => void;
  description?: string;
  errorMessage?: string;
  placeholder?: string;
  labelHidden?: boolean;
}

export function DashboardV2Select({
  className,
  label,
  options,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  description,
  errorMessage,
  placeholder = 'Select an option',
  labelHidden = false,
  isInvalid = Boolean(errorMessage),
  ...props
}: DashboardV2SelectProps): JSX.Element {
  const descriptionId = useId();
  const errorId = useId();
  const selectedLabel = options.find((option) => option.id === selectedKey)?.label;

  return (
    <Select
      className={cn('v2-field', className)}
      aria-describedby={
        [description ? descriptionId : null, errorMessage ? errorId : null].filter(Boolean).join(' ') || undefined
      }
      defaultSelectedKey={defaultSelectedKey ?? undefined}
      isInvalid={isInvalid}
      items={options}
      selectedKey={selectedKey ?? undefined}
      onSelectionChange={(value) => {
        const nextValue = typeof value === 'string' ? value : String(value as Key);
        onSelectionChange?.(nextValue);
      }}
      {...props}
    >
      <Label className={cn('v2-field__label', labelHidden && 'v2-visually-hidden')}>{label}</Label>
      <Button className="v2-select__trigger">
        <SelectValue className="v2-select__value">
          {({ selectedText }) => selectedText || selectedLabel || placeholder}
        </SelectValue>
        <DashboardV2Icon icon={ChevronDown} className="v2-select__icon" size={16} />
      </Button>
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
      <Popover className="v2-select__popover">
        <ListBox className="v2-select__listbox">
          {(item) => (
            <ListBoxItem id={item.id} className="v2-select__option" textValue={item.label}>
              <span className="v2-select__option-label">{item.label}</span>
              <span className="v2-select__option-icon" aria-hidden="true">
                <Check size={14} />
              </span>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
