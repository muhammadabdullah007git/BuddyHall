"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import io from "socket.io-client";
import styles from "./page.module.css";


declare global {
  interface Window {
    electronAPI?: {
      getServerUrl: () => Promise<string | null>;
      saveServerUrl: (url: string) => Promise<boolean>;
      clearServerUrl: () => Promise<boolean>;
    };
  }
}

let socket: any;

export default function Dashboard() {
  const router = useRouter();
  const didInit = useRef(false);

  const [serverUrl, setServerUrl] = useState("http://buddyhall.render.com");
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [connectionError, setConnectionError] = useState("");

  // Init Server URL
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    (async () => {
      let savedUrl: string | null = null;

      try {
        if (typeof window !== 'undefined' && window.electronAPI) {
          savedUrl = await window.electronAPI.getServerUrl();
        }
      } catch (e: any) {
        console.error(e);
      }

      if (!savedUrl) {
        savedUrl = localStorage.getItem("buddyhall_server_url");
      }

      if (savedUrl) {
        setServerUrl(savedUrl);
        setIsConfiguring(false);
      }
    })();
  }, []);

  const [formData, setFormData] = useState({
    username: "",
    roomName: "",
    isPublic: true,
    allowCommenting: true,
    allowTalking: true,
    autoClose: false,
    closeTime: 10,
  });

  const [activeRooms, setActiveRooms] = useState<any[]>([]);

  // Socket Connection
  useEffect(() => {
    if (isConfiguring || !serverUrl) return;

    socket?.disconnect();
    socket = io(serverUrl, { transports: ["websocket"] });

    socket.on("connect_error", () => {
      setConnectionError("Failed to connect to server. Check URL.");
    });

    socket.on("connect", () => {
      setConnectionError("");
    });

    socket.on("active-rooms", setActiveRooms);

    return () => socket?.disconnect();
  }, [isConfiguring, serverUrl]);


  const clearServer = async () => {
    localStorage.removeItem("buddyhall_server_url");

    if (window.electronAPI) {
      await window.electronAPI.clearServerUrl();
    }

    setIsConfiguring(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = Math.random().toString(36).substring(2, 9);
    localStorage.setItem(`room_settings_${id}`, JSON.stringify(formData));

    // We'll emit create-room when the user actually joins the room as creator
    // Pass serverUrl so the room page knows where to connect
    router.push(`/room?id=${id}&username=${encodeURIComponent(formData.username)}&creator=true&serverUrl=${encodeURIComponent(serverUrl)}`);
  };

  if (isConfiguring) {
    return (
      <main className={styles.container}>
        <div className={`${styles.card} glass`}>
          <h2>Connect to BuddyHall Server</h2>
          <div className={styles.form}>
            {connectionError && <div style={{ color: '#ef4444', marginBottom: '10px' }}>{connectionError}</div>}
            <div className={styles.inputGroup}>
              <label>Server URL</label>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://buddyhall.render.com"
                required
                autoFocus
              />
            </div>
            <button
              className={styles.ctaButton}
              onClick={() => {
                localStorage.setItem("buddyhall_server_url", serverUrl);
                setIsConfiguring(false);

                if (window.electronAPI) {
                  window.electronAPI.saveServerUrl(serverUrl).catch(console.error);
                }
              }}
            >
              Connect
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      {connectionError && (
        <div className={styles.toast} style={{ top: '20px', bottom: 'auto', background: '#ef4444' }}>
          {connectionError}
          <button onClick={clearServer} style={{ marginLeft: '10px', textDecoration: 'underline' }}>Change Server</button>
        </div>
      )}
      <header className={styles.header}>
        <h1 className="gradient-text">BuddyHall</h1>
        <p>Watch, Talk, and Hang out with your buddies.</p>
        <button onClick={clearServer} style={{ fontSize: '0.8rem', color: '#6366f1', marginTop: '0.5rem' }}>
          Connected to: {serverUrl} (Change)
        </button>
      </header>

      <div className={styles.mainGrid}>
        <div className={`${styles.card} glass`}>
          <h2>Create a Room</h2>
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* ... form content ... */}
            <div className={styles.inputGroup}>
              <label htmlFor="username">Your Nickname</label>
              <input
                id="username"
                type="text"
                required
                placeholder="e.g. PixelWarrior"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="roomName">Room Name</label>
              <input
                id="roomName"
                type="text"
                required
                placeholder="e.g. Movie Night"
                value={formData.roomName}
                onChange={(e) => setFormData({ ...formData, roomName: e.target.value })}
              />
            </div>

            <div className={styles.row}>
              <div className={styles.checkboxGroup}>
                <input
                  id="isPublic"
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                />
                <label htmlFor="isPublic">Public Room</label>
              </div>
              <div className={styles.checkboxGroup}>
                <input
                  id="allowCommenting"
                  type="checkbox"
                  checked={formData.allowCommenting}
                  onChange={(e) => setFormData({ ...formData, allowCommenting: e.target.checked })}
                />
                <label htmlFor="allowCommenting">Allow Comments</label>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.checkboxGroup}>
                <input
                  id="allowTalking"
                  type="checkbox"
                  checked={formData.allowTalking}
                  onChange={(e) => setFormData({ ...formData, allowTalking: e.target.checked })}
                />
                <label htmlFor="allowTalking">Allow Talking</label>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <div className={styles.checkboxGroup}>
                <input
                  id="autoClose"
                  type="checkbox"
                  checked={formData.autoClose}
                  onChange={(e) => setFormData({ ...formData, autoClose: e.target.checked })}
                />
                <label htmlFor="autoClose">Auto Close Room</label>
              </div>
              {formData.autoClose && (
                <div className={styles.timeInput}>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={formData.closeTime}
                    onChange={(e) => setFormData({ ...formData, closeTime: parseInt(e.target.value) })}
                  />
                  <span>minutes</span>
                </div>
              )}
            </div>

            <button type="submit" className={styles.ctaButton}>
              Create Room
            </button>
          </form>
        </div>

        <div className={`${styles.card} glass`}>
          <h2>Active Rooms</h2>
          <div className={styles.roomList}>
            {activeRooms.length === 0 ? (
              <p className={styles.noRooms}>No active rooms. Be the first to start one!</p>
            ) : (
              activeRooms.map((room) => (
                <div
                  key={room.id}
                  className={styles.roomCard}
                  onClick={() => router.push(`/room?id=${room.id}&serverUrl=${encodeURIComponent(serverUrl)}`)}
                >
                  <div className={styles.roomInfo}>
                    <h3>{room.name}</h3>
                    <p>Host: {room.hostName}</p>
                  </div>
                  <div className={styles.roomMeta}>
                    <span className={styles.userCount}>👥 {room.participantCount}</span>
                    <button className={styles.joinBtn}>Join</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
