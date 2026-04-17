import {
  Button,
  Disclosure,
  DisclosurePanel,
  Heading,
} from 'react-aria-components';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { DashboardV2Icon } from './Icon';

interface DashboardV2DisclosureProps {
  title: string;
  summary?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  className?: string;
}

export function DashboardV2Disclosure({
  title,
  summary,
  defaultExpanded = false,
  children,
  className,
}: DashboardV2DisclosureProps): JSX.Element {
  return (
    <Disclosure
      className={cn('v2-disclosure', className)}
      defaultExpanded={defaultExpanded}
    >
      {({ isExpanded }) => (
        <>
          <Heading className="v2-disclosure__header">
            <Button className="v2-disclosure__trigger">
              <span className="v2-disclosure__copy">
                <span className="v2-disclosure__title">{title}</span>
                {summary ? <span className="v2-disclosure__summary">{summary}</span> : null}
              </span>
              <DashboardV2Icon
                icon={ChevronDown}
                className={cn('v2-disclosure__icon', isExpanded && 'v2-disclosure__icon--open')}
                size={16}
              />
            </Button>
          </Heading>
          <DisclosurePanel className="v2-disclosure__panel">{children}</DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}
