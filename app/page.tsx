import React from "react";
import { ArrowRight, MapPin, Sparkles, Clock } from "lucide-react";

const palette = {
  espresso: "#1A1410",
  ivory: "#FBF7F0",
  paprika: "#C1440E",
  turmeric: "#E8B34A",
  cocoa: "#6B5B4E",
  roast: "#2D2420",
};

export default function LandingPreview() {
  return (
    <div
      style={{ background: palette.ivory, fontFamily: "'Inter', ui-sans-serif, system-ui" }}
      className="w-full min-h-screen"
    >
      {/* Nav */}
      <header className="flex items-center justify-between max-w-5xl mx-auto px-6 py-6">
        <span
          style={{ fontFamily: "'Fraunces', serif", color: palette.roast }}
          className="text-lg font-medium tracking-tight"
        >
          Best For All
        </span>
        <nav className="flex items-center gap-6 text-sm" style={{ color: palette.cocoa }}>
          <a href="#how" className="hover:opacity-70 transition">How it works</a>
          <a
            href="/api/auth/signin"
            className="hover:opacity-70 transition"
            style={{ color: palette.roast }}
          >
            Log in
          </a>
          <a
            href="/register"
            className="rounded-full px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            style={{ background: palette.paprika }}
          >
            Get started
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-12 pb-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1
            style={{ fontFamily: "'Fraunces', serif", color: palette.roast, lineHeight: 1.05 }}
            className="text-5xl md:text-6xl font-medium tracking-tight"
          >
            Craving something new nearby?
          </h1>
          <p className="mt-2 text-2xl md:text-3xl" style={{ fontFamily: "'Fraunces', serif", color: palette.paprika, fontStyle: "italic" }}>
            Just ask.
          </p>
          <p className="mt-6 text-base leading-relaxed max-w-md" style={{ color: palette.cocoa }}>
            Tell us what you're in the mood for, in your own words. We'll
            point you to real places nearby — including the new spot that
            opened last week and hasn't made it onto the usual apps yet.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <a
              href="/register"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium text-white transition hover:opacity-90"
              style={{ background: palette.paprika }}
            >
              Get started
              <ArrowRight size={16} />
            </a>
            <a
              href="/chat"
              className="text-sm font-medium transition hover:opacity-70"
              style={{ color: palette.roast }}
            >
              Try a search
            </a>
          </div>
        </div>

        {/* live query mock */}
        <div
          className="rounded-2xl p-6"
          style={{ background: palette.roast }}
        >
          <div className="flex items-start gap-3">
            <div
              className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center"
              style={{ background: palette.turmeric }}
            >
              <Sparkles size={15} color={palette.roast} />
            </div>
            <p className="text-sm leading-relaxed" style={{ color: palette.ivory }}>
              "Somewhere quiet with good filter coffee, open past 9pm,
              walking distance from Vijay Nagar"
            </p>
          </div>

          <div className="mt-5 rounded-xl p-4" style={{ background: palette.ivory }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: palette.roast }}>
                Filter &amp; Sip
              </span>
              <span
                className="text-xs font-medium rounded-full px-2 py-0.5"
                style={{ background: palette.turmeric, color: palette.roast }}
              >
                New · opened this month
              </span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: palette.cocoa }}>
              <span className="flex items-center gap-1">
                <MapPin size={12} /> 0.4 km away
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> Open until 11pm
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-5xl mx-auto px-6 py-16 border-t" style={{ borderColor: "rgba(107,91,78,0.2)" }}>
        <h2
          style={{ fontFamily: "'Fraunces', serif", color: palette.roast }}
          className="text-2xl font-medium mb-10"
        >
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-10">
          {[
            {
              n: "01",
              title: "You ask",
              body: "Describe what you want in plain language — mood, price, distance, whatever matters to you.",
            },
            {
              n: "02",
              title: "We search",
              body: "We match your request against nearby places, weighing new and undiscovered spots alongside the familiar ones.",
            },
            {
              n: "03",
              title: "You eat",
              body: "Get a short, clear list of real options — no endless scrolling through irrelevant results.",
            },
          ].map((s) => (
            <div key={s.n}>
              <span
                className="text-sm font-medium"
                style={{ color: palette.paprika, fontFamily: "'Fraunces', serif" }}
              >
                {s.n}
              </span>
              <h3 className="mt-2 text-lg font-medium" style={{ color: palette.roast }}>
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: palette.cocoa }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="max-w-5xl mx-auto px-6 py-10 text-xs" style={{ color: palette.cocoa }}>
        Best For All
      </footer>
    </div>
  );
}