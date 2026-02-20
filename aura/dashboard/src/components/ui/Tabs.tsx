import { useMemo, useState } from 'react';
import { cn } from '../../utils/cn';

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  value?: string;
  onValueChange?: (id: string) => void;
}

export function Tabs({ tabs, value, onValueChange }: TabsProps): JSX.Element {
  const [uncontrolledValue, setUncontrolledValue] = useState<string>(tabs[0]?.id ?? '');

  const activeId = useMemo(() => value ?? uncontrolledValue, [value, uncontrolledValue]);

  function selectTab(id: string): void {
    if (!value) {
      setUncontrolledValue(id);
    }
    onValueChange?.(id);
  }

  return (
    <div className="tabs" role="tablist" aria-label="Content sections">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            className={cn('tabs__tab', isActive && 'tabs__tab--active')}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
