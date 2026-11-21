import { PLATFORM_RULES, type Platform } from "@/lib/creator-profile";
import { METRIC_LABELS, metricFieldName } from "@/lib/checkpoint-form";
import { METRIC_KEYS } from "@/lib/checkpoints";
import { FieldMessages, TextField } from "@/components/ui/field";

/**
 * Numbers a creator reads off a platform's own analytics: one block per
 * platform, every figure optional, whole numbers only. Self-reported; the
 * pages that show them say so. Named metric.<platform>.<figure> for
 * parseMetricsForm().
 */
export function MetricsFields({
  idPrefix,
  platforms,
  capturedOnRequired,
  errors,
}: {
  idPrefix: string;
  platforms: Platform[];
  capturedOnRequired: boolean;
  errors?: {
    metrics?: string;
    capturedOn?: string;
    periodFrom?: string;
    periodTo?: string;
  };
}) {
  return (
    <fieldset className="space-y-4 rounded-card bg-canvas p-4 ring-1 ring-hairline">
      <legend className="px-1 text-sm font-semibold text-ink">
        Numbers from your analytics
      </legend>
      <p className="text-sm text-muted">
        Copy the figures you can see; leave out the ones you can’t. The business
        sees them marked as reported by you.
      </p>
      {platforms.map((platform) => (
        <div key={platform}>
          <h4 className="text-sm font-medium text-ink">
            {PLATFORM_RULES[platform].label}
          </h4>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {METRIC_KEYS.map((key) => (
              <TextField
                key={key}
                id={`${idPrefix}-${platform}-${key}`}
                name={metricFieldName(platform, key)}
                label={METRIC_LABELS[key]}
                inputMode="numeric"
                autoComplete="off"
                compact
              />
            ))}
          </div>
        </div>
      ))}
      <FieldMessages id={`${idPrefix}-metrics`} error={errors?.metrics} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id={`${idPrefix}-captured`}
          name="capturedOn"
          type="date"
          label="Day captured"
          labelAside={
            capturedOnRequired ? undefined : (
              <span className="text-muted">Optional</span>
            )
          }
          required={capturedOnRequired}
          error={errors?.capturedOn}
        />
        <TextField
          id={`${idPrefix}-from`}
          name="periodFrom"
          type="date"
          label="Period from"
          labelAside={<span className="text-muted">Optional</span>}
          error={errors?.periodFrom}
        />
        <TextField
          id={`${idPrefix}-to`}
          name="periodTo"
          type="date"
          label="Period to"
          labelAside={<span className="text-muted">Optional</span>}
          error={errors?.periodTo}
        />
      </div>
    </fieldset>
  );
}
