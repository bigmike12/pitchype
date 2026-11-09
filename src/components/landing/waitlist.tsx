import { WaitlistForm } from "./waitlist-form";

export function Waitlist() {
  return (
    <section
      id="waitlist"
      aria-labelledby="waitlist-title"
      className="container-page section-y"
    >
      <div className="relative overflow-hidden rounded-panel bg-surface-soft px-5 py-12 ring-1 ring-hairline sm:px-10 lg:px-16 lg:py-20">
        <div
          aria-hidden="true"
          className="absolute -top-14 -right-14 size-28 rounded-full bg-brand-coral sm:-top-12 sm:-right-12 sm:size-56"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-10 left-[38%] hidden size-24 rounded-full bg-brand-sun lg:block"
        />

        <div className="relative grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <h2 id="waitlist-title" className="max-w-[14ch] text-display-lg">
              Be first in when we open the doors.
            </h2>
            <p className="mt-4 max-w-[30rem] text-lg">
              Pitchype isn’t live yet. Leave your email and we’ll tell you the
              day it opens.
            </p>
          </div>
          <div className="lg:col-span-6">
            <WaitlistForm />
          </div>
        </div>
      </div>
    </section>
  );
}
