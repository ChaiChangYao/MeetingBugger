export default function OnboardingCard(): JSX.Element {
  return (
    <section className="card stack">
      <h3 className="section-title">How this chaos works</h3>
      <ol className="onboarding-list">
        <li>Join room.</li>
        <li>Pick host mic.</li>
        <li>Click who&apos;s talking or use 1/2/3.</li>
        <li>Let them yap.</li>
        <li>Bouncer handles business.</li>
      </ol>
    </section>
  );
}
