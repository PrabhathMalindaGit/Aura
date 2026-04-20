import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type {
  DashboardCommunicationSignalVm,
  DashboardSafetySignalVm,
} from "../../../adapters/dashboard";
import { DashboardV2Badge } from "../../../primitives/Badge";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2ClinicianPatientAnchor } from "../../../patterns/ClinicianPatientAnchor";
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
  guardPatientActions?: boolean;
  guardThreadActions?: boolean;
}

function communicationRowTone(
  item: DashboardCommunicationSignalVm,
): "critical" | "warning" | "success" | "neutral" {
  if (item.chips.some((chip) => chip.tone === "critical")) {
    return "critical";
  }

  if (item.chips.some((chip) => chip.tone === "warning")) {
    return "warning";
  }

  if (item.chips.some((chip) => chip.tone === "info")) {
    return "success";
  }

  return "neutral";
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
  guardPatientActions = false,
  guardThreadActions = false,
}: DashboardSignalsSectionProps): JSX.Element {
  if (loading) {
    return (
      <DashboardModuleState
        mode="loading"
        title="Loading recent movement"
        lines={4}
      />
    );
  }

  if (error) {
    return (
      <DashboardModuleState
        mode="error"
        title="Unable to load recent movement"
        description="Refresh to restore recent safety activity and communication pressure."
        onRetry={onRefresh}
        retrying={isRefreshing}
      />
    );
  }

  return (
    <section
      className="v2-dashboard-signals"
      data-testid="v2-dashboard-signals-section"
    >
      <DashboardV2Surface
        className="v2-dashboard-signals__panel"
        tone="elevated"
      >
        <header className="v2-dashboard-signals__panel-header">
          <div className="v2-dashboard-signals__panel-copy">
            <DashboardV2Text tone="label">Recent safety activity</DashboardV2Text>
            <DashboardV2Heading as="h2">What changed most recently</DashboardV2Heading>
          </div>
          <DashboardV2Button tone="quiet" size="sm" onPress={onOpenAlerts}>
            Open alerts
          </DashboardV2Button>
        </header>

        {safetyItems.length > 0 ? (
          <div className="v2-dashboard-signals__list" role="list">
            {safetyItems.map((item) => (
              <article
                key={item.id}
                className={`v2-dashboard-signals__item v2-dashboard-signals__item--${item.statusTone}`}
                role="listitem"
                data-testid={`v2-dashboard-safety-item-${item.id}`}
              >
                <div className="v2-dashboard-signals__item-topline">
                  <div className="v2-dashboard-signals__patient">
                    <DashboardV2ClinicianPatientAnchor
                      patientLabel={item.patientLabel}
                      tone={
                        item.statusTone === "critical"
                          ? "critical"
                          : item.statusTone === "warning"
                            ? "warning"
                            : item.statusTone === "success"
                              ? "success"
                              : "neutral"
                      }
                    />
                    <button
                      type="button"
                      className={`v2-dashboard-link-button${
                        guardPatientActions
                          ? " v2-dashboard-link-button--guarded"
                          : ""
                      }`}
                      disabled={guardPatientActions}
                      title={
                        guardPatientActions
                          ? "Synthetic demo patient. Downstream patient view is guarded in demo mode."
                          : undefined
                      }
                      onClick={() => onOpenPatient(item.patientId)}
                    >
                      {item.patientLabel}
                    </button>
                  </div>
                  <DashboardV2Text tone="caption" title={item.eventTimeTitle}>
                    {item.eventTimeLabel}
                  </DashboardV2Text>
                </div>

                <DashboardV2Text tone="strong">{item.eventLabel}</DashboardV2Text>
                <DashboardV2Text tone="muted">{item.summary}</DashboardV2Text>

                <div className="v2-dashboard-signals__item-footer">
                  <DashboardV2Badge
                    tone={
                      item.statusTone === "critical"
                        ? "safety"
                        : item.statusTone === "warning"
                          ? "priority"
                          : item.statusTone === "success"
                            ? "clear"
                            : "neutral"
                    }
                  >
                    {item.statusLabel}
                  </DashboardV2Badge>
                  <DashboardV2Button
                    tone="row"
                    size="sm"
                    className="v2-dashboard-row-button"
                    isDisabled={guardPatientActions}
                    onPress={() => onOpenPatient(item.patientId)}
                  >
                    {guardPatientActions ? "Demo only" : "Open patient"}
                  </DashboardV2Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="v2-dashboard-signals__empty">
            <DashboardV2Text tone="strong">Nothing new in safety feed</DashboardV2Text>
            <DashboardV2Text tone="muted">
              Recent safety movement will surface here when it matters.
            </DashboardV2Text>
          </div>
        )}
      </DashboardV2Surface>

      <DashboardV2Surface
        className="v2-dashboard-signals__panel"
        tone="elevated"
      >
        <header className="v2-dashboard-signals__panel-header">
          <div className="v2-dashboard-signals__panel-copy">
            <DashboardV2Text tone="label">Communication pressure</DashboardV2Text>
            <DashboardV2Heading as="h2">Threads that need a response next</DashboardV2Heading>
          </div>
          <DashboardV2Button tone="quiet" size="sm" onPress={onOpenInbox}>
            Open inbox
          </DashboardV2Button>
        </header>

        {communicationItems.length > 0 ? (
          <div className="v2-dashboard-signals__list" role="list">
            {communicationItems.map((item) => (
              <article
                key={item.id}
                className={`v2-dashboard-signals__item v2-dashboard-signals__item--${communicationRowTone(item)}`}
                role="listitem"
                data-testid={`v2-dashboard-communication-item-${item.id}`}
              >
                <div className="v2-dashboard-signals__item-topline">
                  <div className="v2-dashboard-signals__patient">
                    <DashboardV2ClinicianPatientAnchor
                      patientLabel={item.patientLabel}
                      tone={communicationRowTone(item)}
                    />
                    <button
                      type="button"
                      className={`v2-dashboard-link-button${
                        guardPatientActions
                          ? " v2-dashboard-link-button--guarded"
                          : ""
                      }`}
                      disabled={guardPatientActions}
                      title={
                        guardPatientActions
                          ? "Synthetic demo patient. Downstream patient view is guarded in demo mode."
                          : undefined
                      }
                      onClick={() => onOpenPatient(item.patientId)}
                    >
                      {item.patientLabel}
                    </button>
                  </div>
                  <DashboardV2Text tone="caption" title={item.messageAgeTitle}>
                    {item.messageAgeLabel}
                  </DashboardV2Text>
                </div>

                <DashboardV2Text tone="strong">{item.preview}</DashboardV2Text>

                {item.contextLine ? (
                  <DashboardV2Text tone="muted" className="v2-dashboard-signals__meta">
                    {item.contextLine}
                  </DashboardV2Text>
                ) : item.reviewLine ? (
                  <DashboardV2Text tone="muted" className="v2-dashboard-signals__meta">
                    {item.reviewLine}
                  </DashboardV2Text>
                ) : null}

                <div className="v2-dashboard-signals__item-footer">
                  <div className="v2-dashboard-signals__chips">
                    {item.chips.map((chip) => (
                      <DashboardV2Badge
                        key={chip.key}
                        tone={
                          chip.tone === "critical"
                            ? "safety"
                            : chip.tone === "warning"
                              ? chip.key === "delay"
                                ? "delayed"
                                : "priority"
                              : chip.tone === "info"
                                ? "info"
                                : "neutral"
                        }
                      >
                        {chip.label}
                      </DashboardV2Badge>
                    ))}
                  </div>
                  <DashboardV2Button
                    tone="row"
                    size="sm"
                    className="v2-dashboard-row-button"
                    isDisabled={guardThreadActions}
                    onPress={() => onOpenThread(item.patientId)}
                  >
                    {guardThreadActions ? "Demo only" : "Open thread"}
                  </DashboardV2Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="v2-dashboard-signals__empty">
            <DashboardV2Text tone="strong">No replies are waiting</DashboardV2Text>
            <DashboardV2Text tone="muted">
              Risky or delayed threads will surface here when pressure builds.
            </DashboardV2Text>
          </div>
        )}
      </DashboardV2Surface>
    </section>
  );
}
