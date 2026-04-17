import {
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  type Key,
} from 'react-aria-components';
import { cn } from '../../utils/cn';

export interface DashboardV2TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
  isDisabled?: boolean;
}

interface DashboardV2TabsProps {
  items: DashboardV2TabItem[];
  selectedKey?: string;
  onSelectionChange?: (key: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function DashboardV2Tabs({
  items,
  selectedKey,
  onSelectionChange,
  ariaLabel = 'Content sections',
  className,
}: DashboardV2TabsProps): JSX.Element {
  return (
    <Tabs
      className={cn('v2-tabs', className)}
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        onSelectionChange?.(String(key as Key));
      }}
    >
      <TabList className="v2-tabs__list" aria-label={ariaLabel}>
        {items.map((item) => (
          <Tab key={item.id} id={item.id} className="v2-tabs__tab" isDisabled={item.isDisabled}>
            {item.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels className="v2-tabs__panels">
        {items.map((item) => (
          <TabPanel key={item.id} id={item.id} className="v2-tabs__panel">
            {item.content}
          </TabPanel>
        ))}
      </TabPanels>
    </Tabs>
  );
}
