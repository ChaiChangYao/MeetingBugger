interface Props {
  progressMs: number;
  targetMs: number;
}

export default function Yapometer({ progressMs, targetMs }: Props): JSX.Element {
  const pct = Math.min(100, Math.round((progressMs / targetMs) * 100));
  return (
    <section className="card stack">
      <h3 className="section-title">YAP-O-METER</h3>
      <div className="meter-wrap" role="progressbar" aria-valuemin={0} aria-valuemax={targetMs} aria-valuenow={progressMs}>
        <div className="meter-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm font-bold">
        {Math.min(10, (progressMs / 1000).toFixed(1))}s / 10.0s
      </p>
    </section>
  );
}
