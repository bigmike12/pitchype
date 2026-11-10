import { Plus } from "lucide-react";

import { BUSINESS_FEE_BPS, INFLUENCER_FEE_BPS, formatRate } from "@/lib/fees";
import { CONTACT_EMAIL } from "@/lib/site";

const businessFee = formatRate(BUSINESS_FEE_BPS);
const creatorFee = formatRate(INFLUENCER_FEE_BPS);

// Keep answers short and true. No legal promises; refund and cancellation
// rules belong in the Terms, not here.
const QUESTIONS = [
  {
    question: "What is Pitchype?",
    answer:
      "A marketplace where Nigerian businesses hire micro and nano creators for social media work. Businesses post campaigns or invite creators directly, and payment is held until the work is approved.",
  },
  {
    question: "Who can join?",
    answer:
      "Businesses of any size that want to work with creators, and creators who want paid work from brands. Pitchype is built especially for creators with smaller, close-knit audiences.",
  },
  {
    question: "How does escrow work?",
    answer: `When a business hires a creator, it pays the agreed price plus a ${businessFee} service fee up front. Pitchype holds the agreed price until the business approves the work, then releases it to the creator’s wallet.`,
  },
  {
    question: "When do creators get paid?",
    answer: `As soon as the business approves your work, the money moves to your Pitchype wallet, minus our ${creatorFee} fee. From there you can cash out to your bank account.`,
  },
  {
    question: "What if a business doesn’t respond?",
    answer:
      "Businesses have 7 days to accept or decline submitted work. If they don’t respond in that time, the money is released to the creator automatically.",
  },
  {
    question: "What does it cost?",
    answer: `Joining is free and there are no monthly fees. Businesses pay a ${businessFee} service fee on top of the agreed price, and creators pay ${creatorFee} of what they earn.`,
  },
  {
    question: "Can I negotiate a price?",
    answer:
      "Yes. Creators can apply at the listed price or propose their own, and both sides can chat to agree the details before any money moves.",
  },
  {
    question: "Do I need a lot of followers to join?",
    answer:
      "No. There’s no follower minimum to join Pitchype. Businesses can set their own requirements on each campaign, and you’ll see why if one isn’t a fit for you yet.",
  },
];

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="container-page grid gap-10 section-y lg:grid-cols-12"
    >
      <div className="lg:col-span-4">
        <h2 id="faq-title" className="text-display-lg reveal">
          Questions, answered
        </h2>
        <p className="mt-4 text-lg">
          Something else on your mind? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="link">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>

      <div className="space-y-2 lg:col-span-8">
        {QUESTIONS.map(({ question, answer }) => (
          <details
            key={question}
            className="group rounded-card px-5 panel reveal open:shadow-lift sm:px-6"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 [&::-webkit-details-marker]:hidden">
              <h3 className="text-lg font-semibold">{question}</h3>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-soft group-open:bg-ink group-open:text-white motion-safe:transition-colors">
                <Plus
                  aria-hidden="true"
                  className="size-4 group-open:rotate-45 motion-safe:transition-transform"
                />
              </span>
            </summary>
            <p className="max-w-[42rem] pb-6 motion-safe:animate-[fade-up_0.5s_var(--ease-out-expo)]">
              {answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
