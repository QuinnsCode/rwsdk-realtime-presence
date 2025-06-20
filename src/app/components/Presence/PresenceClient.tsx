'use client';

import { usePresence } from "@/app/hooks/usePresence";
import { type User } from "@/db";
import PresenceUI from "./PresenceUI";

interface PresenceClientProps {
  currentUser: User | null;
}

export default function PresenceClient({ currentUser }: PresenceClientProps) {
  const { presence, otherUsers, isConnected, totalUsers, currentUserId, currentUsername } = usePresence({
    userId: currentUser?.id, // Will use generated ID if null
    username: currentUser?.username, // Will use generated username if null
    enabled: true,
    roomKey: window?.location.pathname // Different rooms for different pages
  });

  console.log('🐛 PRESENCE DEBUG:', {
    currentUser: currentUser?.username,
    currentUserId,
    currentUsername,
    totalUsers,
    otherUsers,
    isConnected
  });

  return (
    <PresenceUI 
      currentUser={currentUser}
      otherUsers={otherUsers}
      isConnected={isConnected}
      totalUsers={totalUsers}
    />
  );
}