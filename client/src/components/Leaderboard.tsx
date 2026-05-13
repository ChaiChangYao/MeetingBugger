import { Participant } from "../lib/types";

interface Props {
  participants: Participant[];
}

export default function Leaderboard({ participants }: Props): JSX.Element {
  const sorted = [...participants].sort((a, b) => b.stats.totalTalkMs - a.stats.totalTalkMs);
  return (
    <section className="card stack">
      <h3 className="section-title">Hall of Yap</h3>
      <div className="table-head">
        <span>Name</span>
        <span>Total</span>
        <span>Bounces</span>
        <span>Longest</span>
      </div>
      {sorted.map((participant) => (
        <div key={participant.id} className="table-row">
          <span>{participant.username}</span>
          <span>{(participant.stats.totalTalkMs / 1000).toFixed(1)}s</span>
          <span>{participant.stats.bounces}</span>
          <span>{(participant.stats.longestYapMs / 1000).toFixed(1)}s</span>
        </div>
      ))}
    </section>
  );
}
