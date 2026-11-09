"use client";

import { Building2, MapPin, Store, UserRound } from "lucide-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  createProfileAction,
  type ProfileState,
} from "@/app/(portal)/account/actions";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import type { BusinessStep, CreatorStep } from "@/lib/onboarding";
import { NIGERIAN_STATES, stateLabel, type ProfileField } from "@/lib/profile";

import { OnboardingStep } from "./onboarding-step";

const STATE_OPTIONS = NIGERIAN_STATES.map((state) => ({
  value: state,
  label: stateLabel(state),
}));

type Screen = { step: BusinessStep | CreatorStep; fields: ProfileField[] };

const SCREENS: Record<"business" | "influencer", Screen[]> = {
  business: [
    { step: "business-name", fields: ["businessName"] },
    { step: "contact-name", fields: ["contactName"] },
    { step: "location", fields: ["state", "city"] },
  ],
  influencer: [
    { step: "display-name", fields: ["displayName"] },
    { step: "location", fields: ["state", "city"] },
  ],
};

/**
 * The profile questions, one screen at a time, as one form: the browser
 * checks each screen before moving on, and the server checks everything on
 * submit (sending the person back to the first screen with an error).
 *
 * It always shows one screen, even before JavaScript loads: signed-in pages
 * stream their content in behind Suspense, which needs JavaScript anyway,
 * and showing every screen until hydration would flash all three on slow
 * connections. React replays a Continue tap made before hydration.
 */
export function ProfileSteps({ role }: { role: "business" | "influencer" }) {
  const screens = SCREENS[role];
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    createProfileAction,
    { status: "idle" },
  );
  const values = state.values ?? {};
  const errors = state.errors ?? {};
  const [screen, setScreen] = useState(0);
  const screenRefs = useRef<(HTMLDivElement | null)[]>([]);
  const moved = useRef(false);

  // A new server answer with field errors: open the first screen that has one.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const first = screens.findIndex((s) =>
      s.fields.some((field) => errors[field]),
    );
    if (first !== -1) setScreen(first);
  }

  // Move focus to the new screen's first field (not on the first render).
  useEffect(() => {
    if (!moved.current) return;
    screenRefs.current[screen]
      ?.querySelector<HTMLElement>("input, select")
      ?.focus();
  }, [screen]);

  const last = screen === screens.length - 1;

  function goTo(index: number) {
    moved.current = true;
    setScreen(index);
  }

  function next() {
    const controls =
      screenRefs.current[screen]?.querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("input, select") ?? [];
    for (const control of controls) {
      if (!control.reportValidity()) return;
    }
    goTo(screen + 1);
  }

  // Enter in a field on an earlier screen means Continue. The browser won't
  // do it for us: its default for Enter is the form's first submit button,
  // which sits on the last screen and is hidden, so nothing would happen.
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (
      !last &&
      event.key === "Enter" &&
      event.target instanceof HTMLInputElement
    ) {
      event.preventDefault();
      next();
    }
  }

  return (
    <form action={formAction} onKeyDown={onKeyDown}>
      {screens.map((s, index) => (
        <div
          key={s.step}
          ref={(el) => {
            screenRefs.current[index] = el;
          }}
          hidden={index !== screen}
        >
          <OnboardingStep
            role={role}
            step={s.step}
            onBack={index > 0 ? () => goTo(index - 1) : undefined}
          >
            <div className="space-y-5">
              {s.fields.map((field) => (
                <Field
                  key={field}
                  field={field}
                  value={values[field]}
                  error={errors[field]}
                />
              ))}

              {index === screens.length - 1 ? (
                <>
                  <FormMessage status={state.status} message={state.message} />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={pending}
                    className="w-full sm:w-auto"
                  >
                    {pending ? "Saving…" : "Continue"}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  onClick={next}
                  className="w-full sm:w-auto"
                >
                  Continue
                </Button>
              )}
            </div>
          </OnboardingStep>
        </div>
      ))}
    </form>
  );
}

function Field({
  field,
  value,
  error,
}: {
  field: ProfileField;
  value?: string;
  error?: string;
}) {
  switch (field) {
    case "businessName":
      return (
        <TextField
          label="Business name"
          name="businessName"
          icon={Store}
          autoComplete="organization"
          required
          maxLength={100}
          defaultValue={value}
          error={error}
        />
      );
    case "contactName":
      return (
        <TextField
          label="Your name"
          name="contactName"
          icon={UserRound}
          autoComplete="name"
          required
          maxLength={100}
          defaultValue={value}
          error={error}
        />
      );
    case "displayName":
      return (
        <TextField
          label="Display name"
          name="displayName"
          icon={UserRound}
          autoComplete="nickname"
          required
          maxLength={60}
          defaultValue={value}
          error={error}
        />
      );
    case "state":
      return (
        <SelectField
          label="State"
          name="state"
          icon={MapPin}
          required
          placeholder="Choose your state"
          options={STATE_OPTIONS}
          defaultValue={value ?? ""}
          error={error}
        />
      );
    case "city":
      return (
        <TextField
          label="Town or city"
          name="city"
          icon={Building2}
          autoComplete="address-level2"
          required
          maxLength={60}
          defaultValue={value}
          error={error}
        />
      );
  }
}
