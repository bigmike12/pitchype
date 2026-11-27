import type { Metadata } from "next";
import Link from "next/link";

import { CONTACT_EMAIL, SOCIAL_PROFILES } from "@/lib/site";

import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Pitchype team: questions, help with your account, partnerships or press.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main id="main" className="container-page section-y">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <h1 className="text-display-lg">Contact us</h1>
          <p className="mt-4 max-w-[34rem] text-lg">
            Questions about hiring creators or getting paid, help with your
            account, partnerships or press: send us a message and we’ll reply by
            email.
          </p>

          <dl className="mt-8 space-y-6">
            <div>
              <dt className="font-semibold text-ink">Email</dt>
              <dd className="mt-1">
                <a href={`mailto:${CONTACT_EMAIL}`} className="link">
                  {CONTACT_EMAIL}
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Elsewhere</dt>
              <dd className="mt-1">
                <ul className="space-y-1">
                  {SOCIAL_PROFILES.map((profile) => (
                    <li key={profile.url}>
                      <a href={profile.url} className="link">
                        {profile.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Quick answers</dt>
              <dd className="mt-1">
                Fees, escrow and payouts are covered in{" "}
                <Link href="/#faq" className="link">
                  the FAQ
                </Link>
                .
              </dd>
            </div>
          </dl>
        </div>

        <div className="relative rounded-card panel p-5 sm:p-8">
          <ContactForm />
        </div>
      </div>
    </main>
  );
}
