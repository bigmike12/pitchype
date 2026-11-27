// The home page's questions and answers: shown by the FAQ section, repeated in
// its FAQPage markup and in /llms.txt, so all three say the same thing.
//
// Keep answers short and true. No legal promises; refund and cancellation
// rules belong in the Terms, not here.
import { BUSINESS_FEE_BPS, INFLUENCER_FEE_BPS, formatRate } from "./fees.ts";

export type FaqItem = { question: string; answer: string };

const businessFee = formatRate(BUSINESS_FEE_BPS);
const creatorFee = formatRate(INFLUENCER_FEE_BPS);

export const HOME_FAQ: FaqItem[] = [
  {
    question: "What is Pitchype?",
    answer:
      "A marketplace where businesses hire micro and nano creators for paid social media work. Businesses post campaigns and message creators from their profiles. The payment is held in escrow until the work is approved or 7 days pass. Pitchype is starting in Nigeria.",
  },
  {
    question: "Who can join?",
    answer:
      "Businesses of any size that want to work with creators, and creators who want paid work from brands. Pitchype is built especially for creators with smaller, close-knit audiences.",
  },
  {
    question: "How does escrow work?",
    answer: `When a business hires a creator, it pays the agreed price plus a ${businessFee} service fee up front. Pitchype holds the agreed price until the business accepts the work, or 7 days pass without a reply, then releases it to the creator’s wallet.`,
  },
  {
    question: "When do creators get paid?",
    answer: `Once the business approves your work, or 7 days after you submit it if the business doesn’t reply, the money moves to your Pitchype wallet, minus our ${creatorFee} fee. From there you can cash out to your bank account.`,
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
