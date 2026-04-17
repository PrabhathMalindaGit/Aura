import { DashboardV2Text } from '../primitives/Text';

export interface DashboardV2MetadataItem {
  label: string;
  value?: string | null;
}

interface DashboardV2MetadataListProps {
  items: DashboardV2MetadataItem[];
}

export function DashboardV2MetadataList({
  items,
}: DashboardV2MetadataListProps): JSX.Element {
  return (
    <dl className="v2-metadata-list">
      {items.map((item) => (
        <div key={item.label} className="v2-metadata-list__item">
          <dt className="v2-metadata-list__label">{item.label}</dt>
          <dd className="v2-metadata-list__value">
            <DashboardV2Text as="span" tone={item.value ? 'strong' : 'muted'}>
              {item.value?.trim() ? item.value : 'Unknown'}
            </DashboardV2Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}
