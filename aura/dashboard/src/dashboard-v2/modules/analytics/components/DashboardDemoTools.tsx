import { Code2, FlaskConical } from "lucide-react";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Text } from "../../../primitives/Text";

interface DashboardDemoToolsProps {
  selectedScenarioId: string | null;
  scenarios: Array<{
    id: string;
    label: string;
  }>;
  onSelectScenario: (scenarioId: string) => void;
  onSelectRealMode: () => void;
}

export function DashboardDemoTools({
  selectedScenarioId,
  scenarios,
  onSelectScenario,
  onSelectRealMode,
}: DashboardDemoToolsProps): JSX.Element {
  return (
    <DashboardV2Surface
      as="aside"
      tone="muted"
      className="v2-dashboard-demo-tools"
      data-testid="v2-dashboard-demo-tools"
      aria-label="Demo tools"
    >
      <div className="v2-dashboard-demo-tools__header">
        <div className="v2-dashboard-demo-tools__copy">
          <DashboardV2Text
            as="span"
            tone="label"
            className="v2-dashboard-demo-tools__eyebrow"
          >
            <Code2 size={12} />
            <span>Demo tools</span>
          </DashboardV2Text>
          <DashboardV2Text tone="muted" className="v2-dashboard-demo-tools__note">
            Developer-only dashboard presentation shortcuts. Updates the URL query
            param and keeps real mode as the default.
          </DashboardV2Text>
        </div>

        <div className="v2-dashboard-demo-tools__state" aria-hidden="true">
          <FlaskConical size={12} />
          <span>{selectedScenarioId ? "Synthetic scenario" : "Real mode"}</span>
        </div>
      </div>

      <div
        className="v2-dashboard-demo-tools__controls"
        role="group"
        aria-label="Dashboard demo scenarios"
      >
        <DashboardV2Button
          tone={selectedScenarioId ? "ghost" : "secondary"}
          size="sm"
          className="v2-dashboard-demo-tools__button"
          aria-pressed={selectedScenarioId ? "false" : "true"}
          onPress={onSelectRealMode}
        >
          Real mode
        </DashboardV2Button>

        {scenarios.map((scenario) => {
          const isSelected = scenario.id === selectedScenarioId;

          return (
            <DashboardV2Button
              key={scenario.id}
              tone={isSelected ? "secondary" : "ghost"}
              size="sm"
              className="v2-dashboard-demo-tools__button"
              aria-pressed={isSelected ? "true" : "false"}
              onPress={() => onSelectScenario(scenario.id)}
            >
              {scenario.label}
            </DashboardV2Button>
          );
        })}
      </div>
    </DashboardV2Surface>
  );
}
