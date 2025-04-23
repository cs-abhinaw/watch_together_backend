const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let rooms = {};

io.on("connection", (socket) => {
  console.log(`[INFO] User connected: ${socket.id}`);

  socket.on("join-room", ({ roomId, name }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        members: [],
        videoUrl: "",
        currentTime: 0,
        playing: false,
        leader: socket.id,
      };
      console.log(`[INFO] Room ${roomId} created by ${socket.id}`);
    }

    rooms[roomId].members.push({ id: socket.id, username: name });
    socket.join(roomId);

    console.log(`[INFO] ${name} joined room ${roomId}`);
    io.to(roomId).emit("update-members", rooms[roomId].members);
    socket.emit("change-video", rooms[roomId].videoUrl);
    socket.emit("sync-time", rooms[roomId].currentTime);
    socket.emit(rooms[roomId].playing ? "play" : "pause");

    if (rooms[roomId].leader && socket.id !== rooms[roomId].leader) {
      io.to(rooms[roomId].leader).emit("request-sync", { roomId });
    }
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    io.to(roomId).emit("receive-message", { username, message });
  });

  socket.on("change-video", ({ roomId, url }) => {
    if (rooms[roomId]) {
      rooms[roomId].videoUrl = url;
      rooms[roomId].currentTime = 0;
      rooms[roomId].playing = false;
      console.log(`[INFO] Video changed in room ${roomId} to ${url}`);
      io.to(roomId).emit("change-video", url);
      io.to(roomId).emit("sync-time", 0);
      io.to(roomId).emit("pause");
    }
  });

  socket.on("play", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].playing = true;
      console.log(`[INFO] Play event in room ${roomId}, currentTime: ${rooms[roomId].currentTime}`);
      io.to(roomId).emit("play");
    }
  });

  socket.on("pause", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].playing = false;
      console.log(`[INFO] Pause event in room ${roomId}`);
      io.to(roomId).emit("pause");
      if (socket.id === rooms[roomId].leader) {
        socket.emit("request-current-time", { roomId });
      }
    }
  });

  socket.on("time-update", ({ roomId, currentTime }) => {
    if (rooms[roomId] && socket.id === rooms[roomId].leader && currentTime > 0) {
      rooms[roomId].currentTime = currentTime;
      console.log(`[INFO] Time update from leader in room ${roomId}: ${currentTime}`);
      socket.to(roomId).emit("sync-time", currentTime);
    }
  });

  socket.on("respond-current-time", ({ roomId, currentTime }) => {
    if (rooms[roomId] && currentTime > 0) {
      rooms[roomId].currentTime = currentTime;
      console.log(`[INFO] Current time response in room ${roomId}: ${currentTime}`);
      io.to(roomId).emit("sync-time", currentTime);
    }
  });

  socket.on("request-sync", ({ roomId }) => {
    if (rooms[roomId] && socket.id === rooms[roomId].leader) {
      console.log(`[INFO] Sync requested in room ${roomId}, sending currentTime: ${rooms[roomId].currentTime}`);
      io.to(roomId).emit("sync-time", rooms[roomId].currentTime);
    }
  });

  socket.on("seek", ({ roomId, time }) => {
    if (rooms[roomId] && time >= 0) {
      rooms[roomId].currentTime = time;
      console.log(`[INFO] Seek event in room ${roomId} to time: ${time}`);
      io.to(roomId).emit("sync-time", time);
    }
  });

  socket.on("disconnect", () => {
    console.log(`[INFO] User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const wasLeader = room.leader === socket.id;

      room.members = room.members.filter((m) => m.id !== socket.id);

      if (wasLeader && room.members.length > 0) {
        room.leader = room.members[0].id;
        console.log(`[INFO] New leader assigned in room ${roomId}: ${room.leader}`);
        io.to(room.leader).emit("assigned-leader");
      }

      io.to(roomId).emit("update-members", room.members);

      if (room.members.length === 0) {
        console.log(`[INFO] Room ${roomId} deleted (empty)`);
        delete rooms[roomId];
      }
    }
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("Server is running");
});

server.listen(5000, () => {
  console.log("[INFO] Server running on port 5000");
});
