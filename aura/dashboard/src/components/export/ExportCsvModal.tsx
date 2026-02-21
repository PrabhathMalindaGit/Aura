import type { AlertStatus } from '../../types/models';
import type { DateRangeValue } from '../../utils/datesRange';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { DateRangePicker } from './DateRangePicker';

interface ExportToggleConfig {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

interface ExportDatasetOption {
  value: string;
  label: string;
}

interface ExportStatusOptions {
  selected: Record<AlertStatus, boolean>;
  onChange: (status: AlertStatus, checked: boolean) => void;
}

interface ExportCsvModalProps {
  open: boolean;
  title: string;
  description?: string;
  range: DateRangeValue;
  rangeError?: string | null;
  summary: string;
  loading?: boolean;
  downloadDisabled: boolean;
  disableReason?: string;
  datasetOptions?: ExportDatasetOption[];
  datasetValue?: string;
  onDatasetChange?: (value: string) => void;
  statusOptions?: ExportStatusOptions;
  toggles?: ExportToggleConfig[];
  onRangeChange: (range: DateRangeValue) => void;
  onClose: () => void;
  onDownload: () => void;
}

export function ExportCsvModal({
  open,
  title,
  description,
  range,
  rangeError,
  summary,
  loading = false,
  downloadDisabled,
  disableReason,
  datasetOptions,
  datasetValue,
  onDatasetChange,
  statusOptions,
  toggles,
  onRangeChange,
  onClose,
  onDownload,
}: ExportCsvModalProps): JSX.Element {
  return (
    <Drawer
      open={open}
      title={title}
      ariaLabel={title}
      onClose={onClose}
      footer={
        <div className="drawer-footer-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onDownload}
            disabled={downloadDisabled || loading}
            title={downloadDisabled && disableReason ? disableReason : undefined}
          >
            {loading ? 'Preparing CSV...' : 'Download CSV'}
          </Button>
        </div>
      }
    >
      <div className="export-modal">
        {description ? <p className="muted-text">{description}</p> : null}

        {datasetOptions?.length && onDatasetChange ? (
          <label className="form-field" htmlFor="export-dataset-select">
            <span>Dataset</span>
            <select
              id="export-dataset-select"
              value={datasetValue}
              onChange={(event) => onDatasetChange(event.target.value)}
              disabled={loading}
            >
              {datasetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <DateRangePicker range={range} error={rangeError} disabled={loading} onChange={onRangeChange} />

        {statusOptions ? (
          <section className="export-section" aria-label="Statuses to include">
            <h3 className="export-section__title">Include statuses</h3>
            <div className="export-status-grid">
              {(['open', 'acknowledged', 'resolved'] as AlertStatus[]).map((status) => (
                <label key={status} className="export-status-grid__item" htmlFor={`export-status-${status}`}>
                  <input
                    id={`export-status-${status}`}
                    type="checkbox"
                    checked={statusOptions.selected[status]}
                    onChange={(event) => statusOptions.onChange(status, event.target.checked)}
                    disabled={loading}
                  />
                  <span>{status}</span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {toggles?.length ? (
          <section className="export-section" aria-label="Export field toggles">
            <h3 className="export-section__title">Fields</h3>
            <div className="export-toggle-grid">
              {toggles.map((toggle) => (
                <label key={toggle.id} className="export-toggle-grid__item" htmlFor={toggle.id}>
                  <input
                    id={toggle.id}
                    type="checkbox"
                    checked={toggle.checked}
                    disabled={loading || toggle.disabled}
                    onChange={(event) => toggle.onChange(event.target.checked)}
                  />
                  <span>{toggle.label}</span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <section className="export-section" aria-label="Export preview summary">
          <h3 className="export-section__title">Preview</h3>
          <p className="muted-text">{summary}</p>
        </section>
      </div>
    </Drawer>
  );
}
