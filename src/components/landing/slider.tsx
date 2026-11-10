import type { CSSProperties } from "react";

/** A labelled range input with its value shown beside the label. */
export function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  current,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (value: number) => void;
}) {
  const percent = ((current - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        <output htmlFor={id} className="font-semibold text-ink tabular-nums">
          {value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        aria-valuetext={value}
        onChange={(event) => onChange(Number(event.target.value))}
        // The filled part of the track, drawn as a background so it works in
        // every browser; the thumb is styled in globals.css (`.range`).
        style={{ "--fill": `${percent}%` } as CSSProperties}
        className="range mt-3 w-full"
      />
    </div>
  );
}
