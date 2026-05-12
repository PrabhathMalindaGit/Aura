import type { AppointmentPublishVm } from '../../../adapters/appointments';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Input } from '../../../primitives/Input';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface AppointmentPublishPanelProps {
  publishVm: AppointmentPublishVm;
  errorMessage: string | null;
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onMeetingLinkChange: (value: string) => void;
  onUseNextAvailableHour: () => void;
  onPublish: () => void;
}

export function AppointmentPublishPanel({
  publishVm,
  errorMessage,
  onStartsAtChange,
  onEndsAtChange,
  onMeetingLinkChange,
  onUseNextAvailableHour,
  onPublish,
}: AppointmentPublishPanelProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-appointment-publish-panel" tone="elevated">
      <div className="v2-appointment-publish-panel__header">
        <DashboardV2Text tone="label">Publish availability</DashboardV2Text>
        <DashboardV2Heading as="h3">Open only the time still needed</DashboardV2Heading>
        <DashboardV2Text tone="muted">{publishVm.guidance}</DashboardV2Text>
      </div>

      <div className="v2-appointment-publish-panel__meta">
        <span className="v2-appointment-publish-panel__pill">{publishVm.metaLabel}</span>
        <DashboardV2Button tone="ghost" size="sm" onPress={onUseNextAvailableHour}>
          Use next available hour
        </DashboardV2Button>
      </div>

      {publishVm.outcomeTitle ? (
        <DashboardV2Surface className="v2-appointment-publish-panel__outcome" tone="muted">
          <DashboardV2Text tone="strong">{publishVm.outcomeTitle}</DashboardV2Text>
          {publishVm.outcomeMessage ? (
            <DashboardV2Text tone="muted">{publishVm.outcomeMessage}</DashboardV2Text>
          ) : null}
          {publishVm.outcomeFollowThrough ? (
            <DashboardV2Text tone="muted">{publishVm.outcomeFollowThrough}</DashboardV2Text>
          ) : null}
        </DashboardV2Surface>
      ) : null}

      {errorMessage ? (
        <DashboardV2Surface className="v2-appointment-publish-panel__error" tone="muted">
          <DashboardV2Text tone="strong">Could not publish availability</DashboardV2Text>
          <DashboardV2Text tone="muted">{errorMessage}</DashboardV2Text>
        </DashboardV2Surface>
      ) : null}

      <div className="v2-appointment-publish-panel__form">
        <DashboardV2Input
          label="Start (local datetime)"
          type="datetime-local"
          value={publishVm.startsAtInput}
          errorMessage={publishVm.validationErrors.startsAt}
          onChange={(event) => onStartsAtChange(event.currentTarget.value)}
        />
        <DashboardV2Input
          label="End (local datetime)"
          type="datetime-local"
          value={publishVm.endsAtInput}
          description={publishVm.validationErrors.endsAt ? undefined : 'End time must be after start time.'}
          errorMessage={publishVm.validationErrors.endsAt}
          onChange={(event) => onEndsAtChange(event.currentTarget.value)}
        />
        <DashboardV2Input
          label="Meeting link (optional)"
          type="url"
          value={publishVm.meetingLinkInput}
          onChange={(event) => onMeetingLinkChange(event.currentTarget.value)}
        />
      </div>

      <DashboardV2Button
        tone="primary"
        size="sm"
        fullWidth
        onPress={onPublish}
        isDisabled={!publishVm.canPublish}
      >
        {publishVm.publishing ? 'Publishing...' : 'Publish availability'}
      </DashboardV2Button>
    </DashboardV2Surface>
  );
}
