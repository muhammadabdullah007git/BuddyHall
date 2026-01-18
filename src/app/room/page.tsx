"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import styles from "./room.module.css";

let socket: Socket;

function RoomPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const roomId = searchParams.get("id") || "";

    const [username, setUsername] = useState(searchParams.get("username") || "");
    const [isJoined, setIsJoined] = useState(!!username);
    const [participants, setParticipants] = useState<any[]>([]);
    const [messages, setMessages] = useState<any[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [videoUrl, setVideoUrl] = useState("");
    const [isPlaying, setIsPlaying] = useState(false);
    const [roomSettings, setRoomSettings] = useState<any>({
        watch: true,
        talk: true,
        comment: true,
        roomName: "BuddyHall Room",
        creatorUid: null
    });
    const [isCreator, setIsCreator] = useState(searchParams.get("creator") === "true");
    const [isTalking, setIsTalking] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isHostStreaming, setIsHostStreaming] = useState(false);

    // Identity & Custom UI State
    const [userId, setUserId] = useState<string>("");
    const [toast, setToast] = useState<{ message: string, visible: boolean }>({ message: "", visible: false });
    const [showShareModal, setShowShareModal] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [showAudioHelp, setShowAudioHelp] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamVideoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const peersRef = useRef<any>({});
    const isStreamingRef = useRef(false);
    const localStreamRef = useRef<MediaStream | null>(null);
    const isCreatorRef = useRef(false);

    useEffect(() => {
        isStreamingRef.current = isStreaming;
        isCreatorRef.current = isCreator;
    }, [isStreaming, localStream, isCreator]);

    const micStreamRef = useRef<MediaStream | null>(null);

    const handleMicToggle = async () => {
        if (!roomSettings.talk && !isCreator) return;

        if (isTalking) {
            // Stop Mic
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
            }
            setIsTalking(false);
        } else {
            // Start Mic
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast("🚫 Mic requires HTTPS or localhost!");
                console.error("MediaDevices API missing. Browser likely blocking insecure origin.");
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                micStreamRef.current = stream;
                setIsTalking(true);
                // Future: Add track to peers
            } catch (err) {
                console.error("Mic permission denied", err);
                showToast("Microphone permission denied 🚫");
            }
        }
    };

    useEffect(() => {
        if (streamVideoRef.current) {
            const stream = isStreaming ? localStream : remoteStream;
            if (streamVideoRef.current.srcObject !== stream) {
                console.log("Setting srcObject:", stream ? "Stream present" : "null");
                streamVideoRef.current.srcObject = stream;
            }
        }
    }, [isStreaming, localStream, remoteStream, isHostStreaming]);

    useEffect(() => {
        setMounted(true);
        if (typeof window !== "undefined") {
            let id = sessionStorage.getItem("bh_user_id");
            if (!id) {
                id = 'user_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36).substring(4);
                sessionStorage.setItem("bh_user_id", id);
            }
            setUserId(id);
        }
    }, []);

    const showToast = (message: string) => {
        setToast({ message, visible: true });
        setTimeout(() => setToast({ message: "", visible: false }), 3000);
    };

    useEffect(() => {
        if (!isJoined || !userId) return;

        // Connect to socket
        const serverUrl = searchParams.get("serverUrl");
        socket = io(serverUrl || undefined);

        const isCreatorInitial = searchParams.get("creator") === "true";

        if (isCreatorInitial) {
            const savedSettings = localStorage.getItem(`room_settings_${roomId}`);
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                socket.emit("create-room", {
                    roomId,
                    userId,
                    settings: {
                        watch: parsed.allowWatching ?? true,
                        talk: parsed.allowTalking ?? true,
                        comment: parsed.allowCommenting ?? true,
                        roomName: parsed.roomName || "BuddyHall Room"
                    },
                    closeTime: parsed.autoClose ? parsed.closeTime : null
                });
            }
        }

        socket.emit("join-room", { roomId, username, userId });

        socket.on("join-error", (error) => {
            showToast(error);
            setIsJoined(false);
            setUsername("");
        });

        socket.on("room-closed", (message) => {
            showToast(message);
            router.push("/");
        });

        socket.on("room-state", ({ participants, settings, creatorUid, streamStatus }) => {
            setParticipants(participants);
            const effectiveCreatorUid = creatorUid || settings?.creatorUid;
            if (settings) {
                setRoomSettings({ ...settings, creatorUid: effectiveCreatorUid });
            }
            if (effectiveCreatorUid && userId) {
                setIsCreator(effectiveCreatorUid === userId || searchParams.get("creator") === "true");
            }
            if (streamStatus?.active) {
                setIsHostStreaming(true);
            }
        });

        socket.on("user-joined", ({ username, id, socketId }) => {
            console.log("User joined:", username, socketId);
            setParticipants(prev => {
                const filtered = prev.filter(p => p.id !== id);
                return [...filtered, { username, id, socketId }];
            });
            setMessages(prev => [...prev, { system: true, message: `${username} joined the room.` }]);

            // If I am the creator and I am currently streaming, initiate to this new user
            if (isCreatorRef.current && isStreamingRef.current && localStreamRef.current && socketId) {
                console.log("Initiating stream to late-comer:", socketId);
                import("simple-peer").then((Peer) => {
                    const peer = new Peer.default({
                        initiator: true,
                        trickle: false,
                        stream: localStreamRef.current!,
                        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] }
                    });

                    peer.on("signal", (data: any) => {
                        socket.emit("signal", { roomId, to: socketId, signal: data, from: socket.id });
                    });

                    peer.on("error", (err) => console.error("Peer error:", err));

                    peersRef.current[socketId] = peer;
                });
            }
        });

        socket.on("user-left", ({ username, id }) => {
            console.log("User left:", username, id);
            setParticipants(prev => {
                const user = prev.find(p => p.id === id);
                if (user?.socketId && peersRef.current[user.socketId]) {
                    peersRef.current[user.socketId].destroy();
                    delete peersRef.current[user.socketId];
                }
                return prev.filter(p => p.id !== id);
            });
            setMessages(prev => [...prev, { system: true, message: `${username} left the room.` }]);
        });

        socket.on("chat-received", (msg) => {
            setMessages((prev) => [...prev, msg]);
        });

        socket.on("re-initiate-stream", ({ to }) => {
            if (isCreatorRef.current && isStreamingRef.current && localStreamRef.current) {
                console.log("Re-initiating stream to:", to);
                import("simple-peer").then((Peer) => {
                    if (peersRef.current[to]) {
                        peersRef.current[to].destroy();
                    }
                    const peer = new Peer.default({
                        initiator: true,
                        trickle: false,
                        stream: localStreamRef.current!,
                        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] }
                    });

                    peer.on("signal", (data: any) => {
                        socket.emit("signal", { roomId, to: to, signal: data, from: socket.id });
                    });

                    peer.on("error", (err) => console.error("Peer error:", err));

                    peersRef.current[to] = peer;
                });
            }
        });

        socket.on("settings-updated", (newSettings) => {
            setRoomSettings(newSettings);
        });

        socket.on("video-sync", ({ action, time, url }) => {
            if (url && url !== videoUrl) {
                setVideoUrl(url);
            }

            if (videoRef.current) {
                if (action === "play") {
                    videoRef.current.play().catch(() => { });
                    setIsPlaying(true);
                } else if (action === "pause") {
                    videoRef.current.pause();
                    setIsPlaying(false);
                }

                if (time !== undefined && Math.abs(videoRef.current.currentTime - time) > 1.5) {
                    videoRef.current.currentTime = time;
                }
            }
        });

        socket.on("signal", ({ signal, from }) => {
            console.log("Received signal from:", from);
            const peer = peersRef.current[from];
            if (peer) {
                peer.signal(signal);
            } else {
                // Incoming connection from host
                import("simple-peer").then((Peer) => {
                    const p = new Peer.default({
                        initiator: false,
                        trickle: false,
                        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] }
                    });

                    p.on("signal", (data: any) => {
                        console.log("Sending signal reply to:", from);
                        socket.emit("signal", { roomId, to: from, signal: data, from: socket.id });
                    });

                    p.on("stream", (stream: MediaStream) => {
                        setRemoteStream(stream);
                        showToast("Live stream connected!");
                    });

                    p.on("error", (err) => {
                        console.error("Peer error:", err);
                        showToast("Stream connection error.");
                    });

                    p.signal(signal);
                    peersRef.current[from] = p;
                });
            }
        });

        socket.on("stream-status", ({ active, userId: hostId, socketId }) => {
            setIsHostStreaming(active);
            if (!active) {
                setRemoteStream(null);
                // Cleanup peer
                const pId = socketId || hostId;
                if (peersRef.current[pId]) {
                    peersRef.current[pId].destroy();
                    delete peersRef.current[pId];
                }
            }
        });

        return () => {
            socket.disconnect();
            Object.values(peersRef.current).forEach((p: any) => p.destroy());
        };
    }, [roomId, username, isJoined, userId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        const name = (e.target as any).username.value.trim();
        if (name) {
            setUsername(name);
            setIsJoined(true);
        }
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomSettings.comment && !isCreator) return;
        if (inputValue.trim()) {
            socket.emit("chat-message", { roomId, message: inputValue, username, userId });
            setInputValue("");
        }
    };

    const handleVideoAction = (action: string) => {
        if (!roomSettings.watch && !isCreator) return;
        if (videoRef.current) {
            socket.emit("video-action", {
                roomId,
                action,
                time: videoRef.current.currentTime,
                url: videoUrl
            });
        }
    };

    const updateSettings = (key: string, value: boolean) => {
        const newSettings = { ...roomSettings, [key]: value };
        setRoomSettings(newSettings);
        socket.emit("update-settings", { roomId, settings: newSettings, userId });
    };

    const loadVideo = (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomSettings.watch && !isCreator) return;
        const url = (e.target as any).url.value;
        if (url) {
            setVideoUrl(url);
            socket.emit("video-action", { roomId, action: "load", url });
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setVideoUrl(url);
            // We don't broadcast the blob URL because it's local to this machine
            socket.emit("chat-message", { roomId, message: "Host started watching a local file. Participants should select the same file or watch the current stream.", username: "System" });
            socket.emit("video-action", { roomId, action: "load", url: null });
        }
    };

    const startStreaming = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    // @ts-ignore
                    suppressLocalAudioPlayback: false
                }
            });
            setLocalStream(stream);
            setIsStreaming(true);
            setIsHostStreaming(true);

            socket.emit("stream-active", { roomId, active: true, userId });
            console.log("Stream captured:", {
                hasVideo: stream.getVideoTracks().length > 0,
                hasAudio: stream.getAudioTracks().length > 0
            });
            if (stream.getAudioTracks().length === 0) {
                showToast("No audio detected. Click 'Audio Help' for tips!");
                setShowAudioHelp(true);
            } else {
                showToast("Stream started with high-quality audio!");
                setShowAudioHelp(false);
            }

            // Connect to everyone
            import("simple-peer").then((Peer) => {
                participants.forEach(p => {
                    if (p.id !== userId) {
                        const peer = new Peer.default({
                            initiator: true,
                            trickle: false,
                            stream: stream,
                            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] }
                        });

                        peer.on("signal", (data: any) => {
                            console.log("Initiating signal to:", p.socketId);
                            socket.emit("signal", { roomId, to: p.socketId, signal: data, from: socket.id });
                        });

                        peersRef.current[p.socketId] = peer;
                    }
                });
            });

            stream.getVideoTracks()[0].onended = () => stopStreaming();
        } catch (err) {
            console.error(err);
            showToast("Failed to start screen share.");
        }
    };

    const stopStreaming = () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        setIsStreaming(false);
        setIsHostStreaming(false);
        socket.emit("stream-active", { roomId, active: false, userId });
        Object.values(peersRef.current).forEach((p: any) => p.destroy());
        peersRef.current = {};
        setRemoteStream(null);
    };

    if (!isJoined) {
        return (
            <div className={styles.joinContainer}>
                <div className={`${styles.joinCard} glass`}>
                    <h1 className="gradient-text">Join Room</h1>
                    <p>This room requires a nickname to join.</p>
                    <form onSubmit={handleJoin} className={styles.joinForm}>
                        <input name="username" type="text" placeholder="Your Nickname" required autoFocus />
                        <button type="submit" className={styles.ctaButton}>Join Room</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <aside className={`${styles.sidebar} glass`}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.titleRow}>
                        <h2>{roomSettings.roomName}</h2>
                        {isCreator && <span className={styles.hostBadge}>HOST</span>}
                    </div>
                    <p className={styles.participantCount}>{participants.length} buddies online</p>
                </div>

                <div className={styles.participantsSection}>
                    <h3>Participants</h3>
                    <ul className={styles.userList}>
                        {participants.map(p => (
                            <li key={p.id} className={styles.userItem}>
                                <div className={styles.avatar}>{p.username[0].toUpperCase()}</div>
                                <div className={styles.userInfo}>
                                    <span>{p.username} {p.id === userId && "(You)"}</span>
                                    {p.id === roomSettings.creatorUid && <span className={styles.creatorTag}>Host</span>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                {isCreator && (
                    <div className={styles.creatorControls}>
                        <h3>Room Controls</h3>
                        <div className={styles.controlItem}>
                            <span>Allow Watching</span>
                            <input type="checkbox" checked={roomSettings.watch} onChange={(e) => updateSettings("watch", e.target.checked)} />
                        </div>
                        <div className={styles.controlItem}>
                            <span>Allow Talking</span>
                            <input type="checkbox" checked={roomSettings.talk} onChange={(e) => updateSettings("talk", e.target.checked)} />
                        </div>
                        <div className={styles.controlItem}>
                            <span>Allow Comments</span>
                            <input type="checkbox" checked={roomSettings.comment} onChange={(e) => updateSettings("comment", e.target.checked)} />
                        </div>
                        <button
                            className={`${styles.streamBtn} ${isStreaming ? styles.active : ""}`}
                            onClick={isStreaming ? stopStreaming : startStreaming}
                        >
                            {isStreaming ? "🛑 Stop Streaming" : "🖥️ Stream My Desktop"}
                        </button>
                    </div>
                )}

                <div className={styles.chatSection}>
                    <div className={styles.chatHeader}>Comments</div>
                    <div className={styles.chatMessages}>
                        {messages.map((m, i) => (
                            <div key={i} className={m.system ? styles.systemMsg : styles.msg}>
                                {!m.system && <strong className={styles.msgUser}>{m.username}: </strong>}
                                <span className={styles.msgContent}>{m.message}</span>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
                    <div className={styles.chatInputWrapper}>
                        <button
                            type="button"
                            className={`${styles.micBtn} ${isTalking ? styles.active : ""}`}
                            disabled={!roomSettings.talk && !isCreator}
                            onClick={handleMicToggle}
                        >
                            {isTalking ? "🎙️" : "🔇"}
                        </button>
                        <form onSubmit={handleSendMessage} className={styles.chatInputForm}>
                            <input
                                type="text"
                                placeholder={roomSettings.comment || isCreator ? "Type..." : "Disabled"}
                                disabled={!roomSettings.comment && !isCreator}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                            />
                        </form>
                    </div>
                </div>
            </aside>

            <main className={styles.mainContent}>
                <div className={styles.videoHeader}>
                    <form onSubmit={loadVideo} className={styles.videoLoader}>
                        <input name="url" type="text" placeholder="Video URL (direct link)..." />
                        <button type="submit" disabled={!roomSettings.watch && !isCreator}>Load</button>
                        <input
                            type="file"
                            accept="video/*"
                            ref={fileInputRef}
                            style={{ display: "none" }}
                            onChange={handleFileSelect}
                        />
                        <button
                            type="button"
                            className={styles.fileBtn}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!roomSettings.watch && !isCreator}
                        >
                            📁 File
                        </button>
                    </form>

                    <div className={styles.actionButtons}>
                        <button className={styles.shareBtn} onClick={() => setShowShareModal(true)}>Share Room</button>
                    </div>
                </div>

                <div className={`${styles.playerWrapper} glass`}>
                    {isHostStreaming ? (
                        <div className={styles.streamContainer}>
                            <video
                                ref={streamVideoRef}
                                autoPlay
                                playsInline
                                muted={isStreaming}
                                className={styles.videoPlayer}
                                style={{ display: (isStreaming || remoteStream) ? "block" : "none" }}
                            />
                            {(!isStreaming && !remoteStream) && (
                                <div className={styles.streamLoading}>
                                    <div className={styles.loader}></div>
                                    <p>Connecting to stream...</p>
                                    <button
                                        onClick={() => {
                                            socket.emit("request-reconnect", { roomId, userId });
                                        }}
                                        className={styles.reconnectBtn}
                                    >
                                        Force Reconnect
                                    </button>
                                </div>
                            )}
                            <div className={styles.streamBadge}>LIVE STREAM</div>

                            {showAudioHelp && (
                                <div className={`${styles.audioHelp} glass`}>
                                    <button className={styles.closeHelp} onClick={() => setShowAudioHelp(false)}>×</button>
                                    <h3>🔇 No Audio Detected</h3>
                                    <p>Browsers often block audio capture for "Windows" or "Entire Screens".</p>
                                    <div className={styles.helpSteps}>
                                        <div className={styles.step}>
                                            <strong>Chrome (Linux/Mac):</strong> Open your video in a <strong>Chrome Tab</strong> and share that specific tab.
                                        </div>
                                        <div className={styles.step}>
                                            <strong>Firefox/Safari:</strong> These browsers currently do not support audio capture via screen share. Please use **Chrome** or **Edge** for streaming audio.
                                        </div>
                                        <div className={styles.step}>
                                            <strong>Checkbox:</strong> Always check "Share system audio" at the bottom of the picker.
                                        </div>
                                    </div>
                                    <button className={styles.reTryBtn} onClick={() => { stopStreaming(); setTimeout(startStreaming, 500); }}>
                                        Try Again
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : videoUrl ? (
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            className={styles.videoPlayer}
                            controls={roomSettings.watch || isCreator}
                            playsInline
                            onPlay={() => handleVideoAction("play")}
                            onPause={() => handleVideoAction("pause")}
                            onSeeked={() => handleVideoAction("play")}
                        />
                    ) : (
                        <div className={styles.noVideo}>
                            <div className={styles.noVideoIcon}>🎬</div>
                            <p>Ready to watch? Paste a video link above.</p>
                            <small>Supported formats: MP4, WebM, etc.</small>
                        </div>
                    )}
                    <button
                        className={styles.fullscreenBtn}
                        onClick={() => {
                            const el = isHostStreaming ? streamVideoRef.current : videoRef.current;
                            if (el) {
                                if (document.fullscreenElement) document.exitFullscreen();
                                else el.requestFullscreen();
                            }
                        }}
                    >
                        ⛶
                    </button>
                </div>
            </main >

            {/* Custom Toast */}
            {
                toast.visible && (
                    <div className={`${styles.toast} glass`}>
                        {toast.message}
                    </div>
                )
            }

            {/* Custom Modal */}
            {
                showShareModal && (
                    <div className={styles.modalOverlay} onClick={() => setShowShareModal(false)}>
                        <div className={`${styles.modal} glass`} onClick={e => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h3>Share Invitation</h3>
                                <button onClick={() => setShowShareModal(false)} className={styles.closeBtn}>&times;</button>
                            </div>
                            <div className={styles.modalBody}>
                                <p>Copy the link below to invite your buddies.</p>
                                <div className={styles.shareLinkBox}>
                                    <code>{mounted ? `${window.location.origin}/room?id=${roomId}` : ""}</code>
                                    <button onClick={() => {
                                        if (mounted) {
                                            navigator.clipboard.writeText(`${window.location.origin}/room?id=${roomId}`);
                                            showToast("Link copied to clipboard!");
                                        }
                                    }}>Copy</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

export default function RoomPage() {
    return (
        <Suspense fallback={<div style={{ color: "white", padding: "2rem" }}>Loading Room...</div>}>
            <RoomPageContent />
        </Suspense>
    );
}
