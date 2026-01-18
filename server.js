const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = process.env.PORT || 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer(handle);

    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    const rooms = new Map();
    // socketId -> { roomId, userId } for quick lookup during disconnect
    const socketToUser = new Map();

    const broadcastActiveRooms = () => {
        const activeRooms = Array.from(rooms.entries()).map(([id, room]) => ({
            id,
            name: room.settings.roomName,
            participantCount: room.participants.size,
            hostName: room.participants.get(room.creatorUid)?.username || "Host"
        }));
        io.emit("active-rooms", activeRooms);
    };

    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);
        broadcastActiveRooms(); // Send to new connection

        socket.on("join-room", ({ roomId, username, userId }) => {
            if (!rooms.has(roomId)) {
                // Auto-create room if it doesn't exist (e.g. first user joins)
                rooms.set(roomId, {
                    creatorUid: userId,
                    streamStatus: { active: false, userId: null, socketId: null },
                    participants: new Map(),
                    settings: {
                        watch: true,
                        talk: true,
                        comment: true,
                        roomName: "New Room"
                    }
                });
            }

            const room = rooms.get(roomId);

            // If user already in room (refresh), update socket
            if (room.participants.has(userId)) {
                const existingUser = room.participants.get(userId);
                existingUser.socketId = socket.id;
                existingUser.username = username || existingUser.username;
            } else {
                // Unique username check for new users
                const isNameTaken = Array.from(room.participants.values()).some(p => p.username === username);
                if (isNameTaken) {
                    socket.emit("join-error", "Username already taken in this room.");
                    return;
                }
                room.participants.set(userId, { username, socketId: socket.id, id: userId });
            }

            socket.join(roomId);
            socketToUser.set(socket.id, { roomId, userId });
            console.log(`${username} joined room ${roomId} (UID: ${userId})`);

            // Notify others
            socket.to(roomId).emit("user-joined", { username, id: userId, socketId: socket.id });

            // Send current state to the new user
            socket.emit("room-state", {
                participants: Array.from(room.participants.values()),
                settings: { ...room.settings, creatorUid: room.creatorUid },
                creatorUid: room.creatorUid,
                streamStatus: room.streamStatus
            });

            broadcastActiveRooms();
        });

        socket.on("create-room", ({ roomId, settings, closeTime, userId }) => {
            rooms.set(roomId, {
                creatorUid: userId,
                streamStatus: { active: false, userId: null, socketId: null },
                participants: new Map(),
                settings: {
                    ...(settings || {
                        watch: true,
                        talk: true,
                        comment: true,
                        roomName: "BuddyHall Room"
                    }),
                    creatorUid: userId // Redundant but safe
                }
            });
            if (closeTime) {
                setTimeout(() => {
                    if (rooms.has(roomId)) {
                        io.to(roomId).emit("room-closed", "Room has been closed automatically.");
                        rooms.delete(roomId);
                        broadcastActiveRooms();
                    }
                }, closeTime * 60 * 1000);
            }
            broadcastActiveRooms();
        });

        socket.on("update-settings", ({ roomId, settings, userId }) => {
            if (rooms.has(roomId)) {
                const room = rooms.get(roomId);
                if (room.creatorUid === userId) {
                    room.settings = settings;
                    io.to(roomId).emit("settings-updated", settings);
                    broadcastActiveRooms();
                }
            }
        });

        socket.on("video-action", ({ roomId, action, time, url }) => {
            socket.to(roomId).emit("video-sync", { action, time, url });
        });

        socket.on("signal", ({ roomId, to, signal, from }) => {
            io.to(to).emit("signal", { signal, from, roomId });
        });

        socket.on("stream-active", ({ roomId, active, userId }) => {
            if (rooms.has(roomId)) {
                const room = rooms.get(roomId);
                room.streamStatus = { active, userId, socketId: active ? socket.id : null };
                io.to(roomId).emit("stream-status", room.streamStatus);
            }
        });

        socket.on("chat-message", ({ roomId, message, username, userId }) => {
            io.to(roomId).emit("chat-received", { message, username, userId, timestamp: Date.now() });
        });

        socket.on("request-reconnect", ({ roomId, userId }) => {
            const room = rooms.get(roomId);
            if (room && room.creatorUid) {
                // Find socket of creator
                const creator = Array.from(room.participants.values()).find(p => p.id === room.creatorUid);
                if (creator) {
                    io.to(creator.socketId).emit("re-initiate-stream", { to: socket.id });
                }
            }
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
            if (socketToUser.has(socket.id)) {
                const { roomId, userId } = socketToUser.get(socket.id);
                socketToUser.delete(socket.id);

                if (rooms.has(roomId)) {
                    const room = rooms.get(roomId);
                    const user = room.participants.get(userId);

                    if (user && user.socketId === socket.id) {
                        // Wait a bit before removing to allow refresh
                        setTimeout(() => {
                            if (rooms.has(roomId)) {
                                const latestRoom = rooms.get(roomId);
                                const currentUser = latestRoom.participants.get(userId);
                                if (currentUser && currentUser.socketId === socket.id) {
                                    latestRoom.participants.delete(userId);
                                    io.to(roomId).emit("user-left", { username: user.username, id: userId });

                                    // Close room only if empty
                                    if (latestRoom.participants.size === 0) {
                                        rooms.delete(roomId);
                                        console.log(`Room ${roomId} closed because it is empty.`);
                                    }
                                    broadcastActiveRooms();
                                }
                            }
                        }, 5000);
                    }
                }
            }
        });
    });

    httpServer
        .once("error", (err) => {
            console.error(err);
            process.exit(1);
        })
        .listen(port, () => {
            console.log(`> Ready on http://${hostname}:${port}`);
        });
});
