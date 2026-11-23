import { ArrowDown, ArrowUp, EyeOff } from "lucide-react";
import Image from "next/image";

import { PlatformIcon } from "@/components/creators/platform-icon";
import { Button } from "@/components/ui/button";
import { MAX_SAMPLES, PLATFORM_RULES } from "@/lib/creator-profile";
import type { OwnSample } from "@/lib/db/creators";

import { moveSampleAction, removeSampleAction } from "./actions";
import { AddSampleForm, EditSampleForm } from "./sample-forms";

/**
 * The creator's work samples, in the order their page shows them: each with
 * its picture, caption and where it ran, buttons to move or remove it, and its
 * details to edit. The add form follows while there's room.
 */
export function SamplesManager({ samples }: { samples: OwnSample[] }) {
  const room = MAX_SAMPLES - samples.length;
  return (
    <div className="space-y-6">
      {samples.length > 0 && (
        <ol className="divide-y divide-hairline rounded-card ring-1 ring-hairline">
          {samples.map((sample, index) => (
            <li key={sample.id} className="flex gap-4 p-4">
              <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-lg bg-surface-soft sm:w-24">
                {sample.imageUrl && (
                  <Image
                    src={sample.imageUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes="6rem"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  {sample.caption ?? `Sample ${index + 1}`}
                </p>
                {sample.platform && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                    <PlatformIcon
                      platform={sample.platform}
                      className="size-4"
                    />
                    {PLATFORM_RULES[sample.platform].label}
                    {sample.postUrl && ", with a link to the post"}
                  </p>
                )}
                {sample.hiddenReason && (
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-danger">
                    <EyeOff
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Taken down by Pitchype, so it isn’t on your page: “
                      {sample.hiddenReason}” Remove it, then add another.
                    </span>
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={moveSampleAction}>
                    <input type="hidden" name="sampleId" value={sample.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      disabled={index === 0}
                    >
                      <ArrowUp aria-hidden="true" />
                      Earlier
                    </Button>
                  </form>
                  <form action={moveSampleAction}>
                    <input type="hidden" name="sampleId" value={sample.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      disabled={index === samples.length - 1}
                    >
                      <ArrowDown aria-hidden="true" />
                      Later
                    </Button>
                  </form>
                  <form action={removeSampleAction}>
                    <input type="hidden" name="sampleId" value={sample.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                </div>

                {!sample.hiddenReason && (
                  <details className="group mt-3">
                    <summary className="link inline-flex min-h-11 cursor-pointer items-center text-sm lg:min-h-8">
                      Edit caption and link
                    </summary>
                    <div className="mt-3 rounded-card bg-canvas p-4 ring-1 ring-hairline">
                      <EditSampleForm
                        sampleId={sample.id}
                        caption={sample.caption}
                        platform={sample.platform}
                        postUrl={sample.postUrl}
                      />
                    </div>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {room > 0 ? (
        <div
          className={
            samples.length > 0 ? "border-t border-hairline pt-6" : undefined
          }
        >
          <h3 className="font-semibold text-ink">
            {samples.length === 0
              ? "Add your first sample"
              : `Add a sample (${room} more possible)`}
          </h3>
          <div className="mt-4">
            <AddSampleForm />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          That’s {MAX_SAMPLES}, the most a profile shows. Remove one to add
          another.
        </p>
      )}
    </div>
  );
}
