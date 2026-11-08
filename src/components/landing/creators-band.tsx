import { HeartHandshake, MapPin, Wallet } from "lucide-react";

const POINTS = [
  {
    icon: Wallet,
    title: "Affordable",
    text: "Rates a small business can plan for, agreed before any work starts.",
  },
  {
    icon: HeartHandshake,
    title: "Authentic",
    text: "Recommendations from someone followers already know and listen to.",
  },
  {
    icon: MapPin,
    title: "Local",
    text: "Creators in Lagos, Abuja, Port Harcourt and beyond, talking to people near you.",
  },
];

export function CreatorsBand() {
  return (
    <section
      aria-labelledby="creators-band-title"
      className="border-y border-hairline"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-24">
        <h2 id="creators-band-title" className="text-display-lg lg:col-span-5">
          Built for micro and nano creators
        </h2>
        <div className="lg:col-span-7">
          <p className="max-w-[40rem] text-lg">
            You don’t need a celebrity to sell a product. Creators with a few
            thousand to around 100,000 followers often know their audience
            personally, and people tend to trust a recommendation that feels
            like it came from a friend. They’re also priced for real budgets, so
            you can work with several instead of betting everything on one.
          </p>
          <ul className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="grid size-11 place-items-center rounded-full bg-brand-mint text-ink">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-1 text-[0.9375rem] text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
