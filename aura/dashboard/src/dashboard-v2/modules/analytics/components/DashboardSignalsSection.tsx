import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type {
  DashboardCommunicationSignalVm,
  DashboardSafetySignalVm,
} from "../../../adapters/dashboard";
import { DashboardV2Badge } from "../../../primitives/Badge";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";

interface DashboardSignalsSectionProps {
  safetyItems: DashboardSafetySignalVm[];
  communicationItems: DashboardCommunicationSignalVm[];
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenAlerts: () => void;
  onOpenInbox: () => void;
  onOpenPatient: (patientId: string) => void;
  onOpenThread: (patientId: string) => void;
}

export function DashboardSignalsSection({
  safetyItems,
  communicationItems,
  loading,
  error,
  isRefreshing,
  onRefresh,
  onOpenAlerts,
  onOpenInbox,
  onOpenPatient,
  onOpenThread,
}: DashboardSignalsSectionProps): JSX.Element {
  return (
    <section
      className="v2-dashboard-signals"
      data-testid="v2-dashboard-signals-section"
    >
      <header className="v2-dashboard-signals__header">
        <div>
          <DashboardV2Text tone="label">Signals to watch</DashboardV2Text>
          <DashboardV2Heading as="h2">
            Recent movement worth a second look
          </DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Safety activity and inbox pressure stay short here so the next
            action is easy to spot.
          </DashboardV2Text>
        </div>
      </header>

      {loading ? (
        <DashboardModuleState
          mode="loading"
          title="Loading signal summaries"
          lines={4}
        />
      ) : error ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load signal summaries"
          description="Refresh to restore recent safety and inbox context."
          onRetry={onRefresh}
          retrying={isRefreshing}
        />
      ) : (
        <div className="v2-dashboard-signals__grid">
          <DashboardV2Surface
            className="v2-dashboard-signals__panel"
            tone="elevated"
          >
            <header className="v2-dashboard-signals__panel-header">
              <div>
                <DashboardV2Text tone="label">
                  Recent safety activity
                </DashboardV2Text>
                <DashboardV2Heading as="h3">
                  Recent safety activity
                </DashboardV2Heading>
              </div>
              <DashboardV2Button tone="ghost" size="sm" onPress={onOpenAlerts}>
                Open alerts
              </DashboardV2Button>
            </header>

            {safetyItems.length > 0 ? (
              <div className="v2-dashboard-signals__list" role="list">
                {safetyItems.map((item) => (
                  <article
                    key={item.id}
                    className="v2-dashboard-signals__item"
                    role="listitem"
                    data-testid={`v2-dashboard-safety-item-${item.id}`}
                  >
                    <div className="v2-dashboard-signals__item-topline">
                      <button
                        type="button"
                        className="v2-dashboard-link-button"
                        onClick={() => onOpenPatient(item.patientId)}
                      >
                        {item.patientLabel}
                      </button>
                      <DashboardV2Badge
                        tone={
                          item.statusTone === "critical"
                            ? "critical"
                            : item.statusTone === "warning"
                              ? "warning"
                              : item.statusTone === "success"
                                ? "success"
                                : "unknown"
                        }
                      >
                        {item.statusLabel}
                      </DashboardV2Badge>
                    </div>
                    <DashboardV2Text tone="strong">
                      {item.eventLabel}
                    </DashboardV2Text>
                    <DashboardV2Text tone="muted">
                      {item.summary}
                    </DashboardV2Text>
                    <div className="v2-dashboard-signals__item-footer">
                      <DashboardV2Text
                        tone="caption"
                        title={item.eventTimeTitle}
                      >
                        {item.eventTimeLabel}
                      </DashboardV2Text>
                      <DashboardV2Button
                        tone="ghost"
                        size="sm"
                        onPress={() => onOpenPatient(item.patientId)}
                      >
                        Open patient
                      </DashboardV2Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="v2-dashboard-signals__empty">
                <DashboardV2Text tone="strong">
                  No recent safety activity
                </DashboardV2Text>
                <DashboardV2Text tone="muted">
                  Recent movement from the live safety feed will appear here
                  when it matters.
                </DashboardV2Text>
              </div>
            )}
          </DashboardV2Surface>

          <DashboardV2Surface
            className="v2-dashboard-signals__panel"
            tone="elevated"
          >
            <header className="v2-dashboard-signals__panel-header">
              <div>
                <DashboardV2Text tone="label">
                  Inbox needing response
                </DashboardV2Text>
                <DashboardV2Heading as="h3">
                  Communication pressure
                </DashboardV2Heading>
              </div>
              <DashboardV2Button tone="ghost" size="sm" onPress={onOpenInbox}>
                Open inbox
              </DashboardV2Button>
            </header>

            {communicationItems.length > 0 ? (
              <div className="v2-dashboard-signals__list" role="list">
                {communicationItems.map((item) => (
                  <article
                    key={item.id}
                    className="v2-dashboard-signals__item"
                    role="listitem"
                    data-testid={`v2-dashboard-communication-item-${item.id}`}
                  >
                    <div className="v2-dashboard-signals__item-topline">
                      <button
                        type="button"
                        className="v2-dashboard-link-button"
                        onClick={() => onOpenPatient(item.patientId)}
                      >
                        {item.patientLabel}
                      </button>
                      <div className="v2-dashboard-signals__chips">
                        {item.chips.map((chip) => (
                          <DashboardV2Badge
                            key={chip.key}
                            tone={
                              chip.tone === "critical"
                                ? "critical"
                                : chip.tone === "warning"
                                  ? "warning"
                                  : chip.tone === "info"
                                    ? "info"
                                    : "neutral"
                            }
                          >
                            {chip.label}
                          </DashboardV2Badge>
                        ))}
                      </div>
                    </div>
                    <DashboardV2Text tone="strong">
                      {item.preview}
                    </DashboardV2Text>
                    {item.contextLine ? (
                      <DashboardV2Text tone="muted">
                        {item.contextLine}
                      </DashboardV2Text>
                    ) : null}
                    {item.reviewLine ? (
                      <DashboardV2Text tone="muted">
                        {item.reviewLine}
                      </DashboardV2Text>
                    ) : null}
                    <div className="v2-dashboard-signals__item-footer">
                      <DashboardV2Text
                        tone="caption"
                        title={item.messageAgeTitle}
                      >
                        {item.messageAgeLabel}
                      </DashboardV2Text>
                      <DashboardV2Button
                        tone="ghost"
                        size="sm"
                        onPress={() => onOpenThread(item.patientId)}
                      >
                        Open thread
                      </DashboardV2Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="v2-dashboard-signals__empty">
                <DashboardV2Text tone="strong">
                  No communication is waiting
                </DashboardV2Text>
                <DashboardV2Text tone="muted">
                  Patient threads needing clinician response will appear here
                  when inbox pressure rises.
                </DashboardV2Text>
              </div>
            )}
          </DashboardV2Surface>
        </div>
      )}
    </section>
  );
}
