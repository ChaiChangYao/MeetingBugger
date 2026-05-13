import { Participant } from "../lib/types";

type AvatarState = "idle" | "yapping" | "bounced" | "too_soft" | "illegible";

interface Props {
  participant: Participant;
  state: AvatarState;
  active: boolean;
  onClick: () => void;
}

export default function AvatarCard({ participant, state, active, onClick }: Props): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`avatar-card state-${state} ${active ? "active" : ""}`}
      aria-label={`Select ${participant.username} as speaker`}
    >
      <div className="avatar-chip" style={{ backgroundColor: participant.avatarColor }} />
      <div className="font-black text-lg">{participant.username}</div>
      <div className="text-xs uppercase tracking-widest">#{participant.id.slice(0, 4)}</div>
      {participant.isHostMic ? <div className="badge">HOST MIC</div> : null}
      {state !== "idle" ? <div className="badge">{state.replace("_", " ")}</div> : null}
    </button>
  );
}
