interface Props {
  text: string | null;
}

export default function VerdictPopup({ text }: Props): JSX.Element | null {
  if (!text) return null;
  return (
    <div className="verdict-popup" role="status" aria-live="assertive">
      <h4 className="font-black uppercase tracking-widest">Bouncer Verdict</h4>
      <p>{text}</p>
    </div>
  );
}
