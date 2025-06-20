import PresenceClientSSR from "../components/Presence/PresenceClientSSR";
import { Login } from "./user/Login";
import { db } from "@/db";
import { User } from "@/db";
interface RoomProps {
  currentUser: User | null;
}

export default function Room({ currentUser }: RoomProps) {
  
  return (
    <div>
      <h1>The Presence Room</h1>
      <PresenceClientSSR currentUser={currentUser} />
      {!currentUser ? <Login /> : null}
    </div>
  );
}