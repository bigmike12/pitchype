"use client";

import { CalendarX } from "lucide-react";
import { useState } from "react";

import { Callout } from "@/components/ui/callout";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { FieldMessages, TextField } from "@/components/ui/field";
import { formatDay } from "@/lib/campaign";
import {
  checkpointDates,
  EVIDENCE_LABELS,
  EVIDENCE_TYPES,
  FINAL_REQUIREMENT_LABELS,
  FINAL_REQUIREMENTS,
  intervalFromChoice,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  PRESET_INTERVALS,
  type EvidenceType,
  type FinalRequirement,
} from "@/lib/checkpoints";

const FREQUENCY_OPTIONS = [
  ...PRESET_INTERVALS.map((days) => ({
    value: String(days),
    label: `Every ${days} days`,
  })),
  { value: "custom", label: "Custom" },
];

const SHOWN_DATES = 12;

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * The builder's timeline (start, final delivery, end), optional checkpoints
 * and final requirements. The dates are controlled here so the list of
 * checkpoint dates can follow them as they are typed; every field keeps its
 * name, so the form sends them like any other. What is chosen here locks once
 * the campaign is submitted.
 */
export function TimelineFields({
  today,
  perClick,
  initial,
  errors,
}: {
  today: string;
  /** Pay-per-click campaigns have no final submission, so no final requirements. */
  perClick: boolean;
  initial: {
    postFrom: string;
    deliverBy: string;
    endsOn: string;
    checkpointsEnabled: boolean;
    checkpointIntervalDays: number | null;
    checkpointEvidence: EvidenceType[];
    finalRequirements: FinalRequirement[];
  };
  errors: {
    postFrom?: string;
    deliverBy?: string;
    endsOn?: string;
    checkpointInterval?: string;
    checkpointEvidence?: string;
    finalRequirements?: string;
  };
}) {
  const [postFrom, setPostFrom] = useState(initial.postFrom);
  const [deliverBy, setDeliverBy] = useState(initial.deliverBy);
  const [endsOn, setEndsOn] = useState(initial.endsOn);
  const [enabled, setEnabled] = useState(initial.checkpointsEnabled);

  const presets: readonly number[] = PRESET_INTERVALS;
  const startDays = initial.checkpointIntervalDays;
  const [frequency, setFrequency] = useState(
    startDays === null
      ? "7"
      : presets.includes(startDays)
        ? String(startDays)
        : "custom",
  );
  const [customDays, setCustomDays] = useState(
    startDays !== null && !presets.includes(startDays) ? String(startDays) : "",
  );
  const [evidence, setEvidence] = useState<EvidenceType[]>(
    initial.checkpointEvidence,
  );
  const [finals, setFinals] = useState<FinalRequirement[]>(
    initial.finalRequirements,
  );

  const intervalDays = intervalFromChoice(frequency, customDays);
  const dates =
    enabled && intervalDays !== null && isDay(postFrom) && isDay(deliverBy)
      ? checkpointDates({ postFrom, deliverBy, intervalDays })
      : null;

  return (
    <div className="space-y-8">
      <section aria-labelledby="timeline-title" className="space-y-4">
        <div>
          <h3 id="timeline-title" className="font-semibold text-ink">
            Timeline
          </h3>
          <p className="mt-1 text-sm text-muted">
            Creators and you both see these dates, with a progress bar. They
            lock once the campaign is submitted, apart from moving the end dates
            later.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField
            label="Campaign starts"
            name="postFrom"
            type="date"
            min={today}
            required
            hint="Posts can go up from this day. Checkpoints count from it."
            value={postFrom}
            onChange={(e) => setPostFrom(e.target.value)}
            error={errors.postFrom}
          />
          <TextField
            label="Final delivery by"
            name="deliverBy"
            type="date"
            min={today}
            required
            hint="The last day for creators to send their final work."
            value={deliverBy}
            onChange={(e) => setDeliverBy(e.target.value)}
            error={errors.deliverBy}
          />
          <TextField
            label="Campaign ends"
            name="endsOn"
            type="date"
            min={deliverBy || today}
            required
            hint="Creators keep their posts up until this day."
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            error={errors.endsOn}
          />
        </div>
      </section>

      <section aria-labelledby="checkpoints-title" className="space-y-4">
        <div>
          <h3 id="checkpoints-title" className="font-semibold text-ink">
            Checkpoints
          </h3>
          <p className="mt-1 text-sm text-muted">
            Optional. Ask creators to show progress on fixed dates, so you
            aren’t waiting until the last day. No money is held back because of
            a missed checkpoint.
          </p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-card bg-canvas p-4 ring-1 ring-hairline">
          <input
            type="checkbox"
            name="checkpointsEnabled"
            value="on"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-1 size-5 accent-ink"
          />
          <span>
            <span className="block font-semibold text-ink">
              Ask for checkpoints
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              Each creator also confirms a kickoff two days after they start
              work.
            </span>
          </span>
        </label>

        {enabled && (
          <div className="space-y-5">
            <ChoiceGroup
              legend="How often"
              name="checkpointFrequency"
              options={FREQUENCY_OPTIONS}
              value={frequency}
              onValueChange={setFrequency}
              error={errors.checkpointInterval}
            />
            {frequency === "custom" && (
              <TextField
                label="Every how many days"
                name="checkpointCustomDays"
                type="number"
                inputMode="numeric"
                min={MIN_INTERVAL_DAYS}
                max={MAX_INTERVAL_DAYS}
                hint={`From ${MIN_INTERVAL_DAYS} to ${MAX_INTERVAL_DAYS} days.`}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="max-w-48"
              />
            )}

            <fieldset>
              <legend className="text-sm font-medium text-ink">
                What each checkpoint needs
              </legend>
              <div className="mt-2 space-y-1">
                {EVIDENCE_TYPES.map((type) => (
                  <label
                    key={type}
                    className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      name="checkpointEvidence"
                      value={type}
                      checked={evidence.includes(type)}
                      onChange={(e) =>
                        setEvidence((current) =>
                          e.target.checked
                            ? [...current, type]
                            : current.filter((x) => x !== type),
                        )
                      }
                      className="size-4 accent-ink"
                    />
                    {EVIDENCE_LABELS[type]}
                  </label>
                ))}
              </div>
              <FieldMessages
                id="checkpointEvidence"
                error={errors.checkpointEvidence}
              />
            </fieldset>

            <CheckpointPreview dates={dates} />
          </div>
        )}
      </section>

      {!perClick && (
        <section
          aria-labelledby="final-requirements-title"
          className="space-y-3"
        >
          <div>
            <h3
              id="final-requirements-title"
              className="font-semibold text-ink"
            >
              Final submission
            </h3>
            <p className="mt-1 text-sm text-muted">
              What creators must include when they send their final work. If you
              choose nothing, a link or a screenshot is enough. You still have 7
              days to review, and the work is released to the creator
              automatically if you don’t.
            </p>
          </div>
          <fieldset>
            <legend className="sr-only">Final submission needs</legend>
            <div className="space-y-1">
              {FINAL_REQUIREMENTS.map((type) => (
                <label
                  key={type}
                  className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    name="finalRequirements"
                    value={type}
                    checked={finals.includes(type)}
                    onChange={(e) =>
                      setFinals((current) =>
                        e.target.checked
                          ? [...current, type]
                          : current.filter((x) => x !== type),
                      )
                    }
                    className="size-4 accent-ink"
                  />
                  {FINAL_REQUIREMENT_LABELS[type]}
                </label>
              ))}
            </div>
            <FieldMessages
              id="finalRequirements"
              error={errors.finalRequirements}
            />
          </fieldset>
        </section>
      )}
    </div>
  );
}

/** The dates the schedule would have, or why there are none yet. */
function CheckpointPreview({ dates }: { dates: string[] | null }) {
  if (dates === null) {
    return (
      <p className="text-sm text-muted">
        Choose a start date, a final delivery date and how often, and the
        checkpoint dates show here.
      </p>
    );
  }
  if (dates.length === 0) {
    return (
      <Callout
        tone="attention"
        icon={CalendarX}
        title="No room for a checkpoint"
      >
        With these dates there is no room for a checkpoint before final
        delivery. Shorten the interval, or turn checkpoints off.
      </Callout>
    );
  }
  const shown = dates.slice(0, SHOWN_DATES);
  return (
    <div>
      <p className="text-sm font-medium text-ink">
        {dates.length === 1 ? "1 checkpoint" : `${dates.length} checkpoints`},
        on fixed dates
      </p>
      <ol className="mt-2 flex flex-wrap gap-2">
        {shown.map((date) => (
          <li
            key={date}
            className="rounded-full bg-canvas px-3 py-1 text-sm text-ink ring-1 ring-hairline"
          >
            {formatDay(date)}
          </li>
        ))}
        {dates.length > shown.length && (
          <li className="px-1 py-1 text-sm text-muted">
            and {dates.length - shown.length} more
          </li>
        )}
      </ol>
      <p className="mt-2 text-sm text-muted">
        A creator who starts late only gets the checkpoints that fall at least 3
        days after they start.
      </p>
    </div>
  );
}
