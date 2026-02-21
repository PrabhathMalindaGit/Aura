import type { DateRangePresetId, DateRangeValue } from '../../utils/datesRange';
import { DATE_RANGE_PRESETS, getPresetDateRange } from '../../utils/datesRange';
import { cn } from '../../utils/cn';

interface DateRangePickerProps {
  range: DateRangeValue;
  presets?: DateRangePresetId[];
  error?: string | null;
  disabled?: boolean;
  onChange: (range: DateRangeValue) => void;
}

export function DateRangePicker({
  range,
  presets = ['last7', 'last14', 'last30', 'thisMonth'],
  error,
  disabled = false,
  onChange,
}: DateRangePickerProps): JSX.Element {
  const visiblePresets = DATE_RANGE_PRESETS.filter((preset) => presets.includes(preset.id));

  return (
    <section className="export-date-range" aria-label="Export date range">
      <div className="export-date-range__inputs">
        <label className="form-field" htmlFor="export-date-from">
          <span>From</span>
          <input
            id="export-date-from"
            type="date"
            value={range.from}
            disabled={disabled}
            max={range.to || undefined}
            onChange={(event) =>
              onChange({
                ...range,
                from: event.target.value,
              })
            }
          />
        </label>

        <label className="form-field" htmlFor="export-date-to">
          <span>To</span>
          <input
            id="export-date-to"
            type="date"
            value={range.to}
            disabled={disabled}
            min={range.from || undefined}
            onChange={(event) =>
              onChange({
                ...range,
                to: event.target.value,
              })
            }
          />
        </label>
      </div>

      <div className="export-date-range__presets" role="group" aria-label="Date range presets">
        {visiblePresets.map((preset) => {
          const isActive = range.from === getPresetDateRange(preset.id).from && range.to === getPresetDateRange(preset.id).to;

          return (
            <button
              key={preset.id}
              type="button"
              className={cn('export-date-range__preset', isActive && 'export-date-range__preset--active')}
              disabled={disabled}
              aria-pressed={isActive}
              onClick={() => {
                onChange(getPresetDateRange(preset.id));
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="validation-text" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
