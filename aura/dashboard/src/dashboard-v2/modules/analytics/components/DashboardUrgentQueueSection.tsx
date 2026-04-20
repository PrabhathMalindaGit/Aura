import { ArrowUpRight } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardUrgentQueueRowVm } from "../../../adapters/dashboard";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2ClinicianPatientAnchor } from "../../../patterns/ClinicianPatientAnchor";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";

interface DashboardUrgentQueueSectionProps {
  rows: DashboardUrgentQueueRowVm[];
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenRoute: (path: string) => void;
  onOpenPatient: (patientId: string) => void;
  onOpenThread: (patientId?: string) => void;
  guardPatientActions?: boolean;
  guardThreadActions?: boolean;
}

function handleQueueAction(
  row: DashboardUrgentQueueRowVm,
  handlers: {
    onOpenRoute: (path: string) => void;
    onOpenPatient: (patientId: string) => void;
    onOpenThread: (patientId?: string) => void;
  },
): void {
  if (row.actionKind === "route" && row.actionPath) {
    handlers.onOpenRoute(row.actionPath);
    return;
  }

  if (row.actionKind === "thread") {
    handlers.onOpenThread(row.patientId ?? undefined);
    return;
  }

  if (row.patientId) {
    handlers.onOpenPatient(row.patientId);
  }
}

export function DashboardUrgentQueueSection({
  rows,
  loading,
  error,
  isRefreshing,
  onRefresh,
  onOpenRoute,
  onOpenPatient,
  onOpenThread,
  guardPatientActions = false,
  guardThreadActions = false,
}: DashboardUrgentQueueSectionProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-dashboard-urgent-queue"
      tone="elevated"
      data-testid="v2-dashboard-urgent-queue"
    >
      <header className="v2-dashboard-urgent-queue__header">
        <div className="v2-dashboard-urgent-queue__header-copy">
          <DashboardV2Text tone="label">Urgent action queue</DashboardV2Text>
          <DashboardV2Heading as="h2">What is due or slipping next</DashboardV2Heading>
        </div>
      </header>

      {loading ? (
        <DashboardModuleState
          mode="loading"
          title="Loading urgent actions"
          lines={4}
        />
      ) : error ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load urgent actions"
          description="Refresh to restore the current action queue."
          onRetry={onRefresh}
          retrying={isRefreshing}
        />
      ) : rows.length > 0 ? (
        <div className="v2-dashboard-urgent-queue__list" role="list">
          {rows.map((row) => {
            const actionGuarded =
              row.actionKind === "patient"
                ? guardPatientActions
                : row.actionKind === "thread"
                  ? guardThreadActions
                  : false;

            return (
              <article
                key={row.id}
                className={`v2-dashboard-urgent-queue__item v2-dashboard-urgent-queue__item--${row.tone}`}
                role="listitem"
              >
                <div className="v2-dashboard-urgent-queue__item-main">
                  <div className="v2-dashboard-urgent-queue__item-topline">
                    <DashboardV2Text tone="strong">{row.title}</DashboardV2Text>
                    {row.dueLabel ? (
                      <DashboardV2Text
                        tone="caption"
                        className="v2-dashboard-urgent-queue__item-due"
                      >
                        {row.dueLabel}
                      </DashboardV2Text>
                    ) : null}
                  </div>

                  <div className="v2-dashboard-urgent-queue__patient-line">
                    {row.patientLabel ? (
                      <>
                        <DashboardV2ClinicianPatientAnchor
                          patientLabel={row.patientLabel}
                          tone={
                            row.tone === "critical"
                              ? "critical"
                              : row.tone === "warning"
                                ? "warning"
                                : row.tone === "success"
                                  ? "success"
                                  : "neutral"
                          }
                        />
                        <DashboardV2Text tone="caption" className="v2-dashboard-urgent-queue__patient">
                          {row.patientLabel}
                        </DashboardV2Text>
                      </>
                    ) : null}
                    <DashboardV2Text tone="muted" className="v2-dashboard-urgent-queue__context">
                      {row.contextLine}
                    </DashboardV2Text>
                  </div>
                </div>

                <DashboardV2Button
                  tone="row"
                  size="sm"
                  className="v2-dashboard-row-button v2-dashboard-urgent-queue__action"
                  trailingIcon={<ArrowUpRight size={14} />}
                  isDisabled={actionGuarded}
                  onPress={() =>
                    handleQueueAction(row, {
                      onOpenRoute,
                      onOpenPatient,
                      onOpenThread,
                    })
                  }
                >
                  {actionGuarded ? "Demo only" : row.actionLabel}
                </DashboardV2Button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="v2-dashboard-urgent-queue__empty">
          <DashboardV2Text tone="strong">No urgent actions are surfacing</DashboardV2Text>
          <DashboardV2Text tone="muted">
            The next actionable items will appear here as soon as pressure builds.
          </DashboardV2Text>
        </div>
      )}
    </DashboardV2Surface>
  );
}
