import { FormEvent, useState } from "react";

interface Props {
  onJoin: (roomName: string, username: string) => void;
}

export default function JoinForm({ onJoin }: Props): JSX.Element {
  const [roomName, setRoomName] = useState("");
  const [username, setUsername] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onJoin(roomName, username);
  };

  return (
    <form onSubmit={submit} className="card stack">
      <h2 className="text-2xl font-black">Enter the chaos arena</h2>
      <label className="stack">
        <span className="label">Meeting Name</span>
        <input
          aria-label="Meeting name"
          maxLength={40}
          value={roomName}
          onChange={(event) => setRoomName(event.target.value)}
          className="input"
          required
        />
      </label>
      <label className="stack">
        <span className="label">Username</span>
        <input
          aria-label="Username"
          maxLength={24}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="input"
          required
        />
      </label>
      <button className="btn btn-primary" type="submit">
        Join Room
      </button>
    </form>
  );
}
