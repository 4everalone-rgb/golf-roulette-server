// download/golf-roulette-final/game-server/index.ts
import { createServer } from "http";
import { Server } from "socket.io";
var httpServer = createServer();
var io = new Server(httpServer, {
  path: process.env.SOCKET_PATH || "/socket",
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 6e4,
  pingInterval: 25e3
});
var HANDICAPS = [
  { id: "putter-tee", name: "Putter Off The Tee", description: "Must use your putter from the tee box. Good luck with distance!", emoji: "\u{1F3CC}\uFE0F", severity: 2 },
  { id: "wrong-hand", name: "Wrong Hand", description: "Play this entire hole with your non-dominant hand. Ambidextrous? Use your elbow!", emoji: "\u{1F91A}", severity: 3 },
  { id: "blind-tee", name: "Blind Tee Shot", description: "Close your eyes for your tee shot. Feel the force, Luke.", emoji: "\u{1F648}", severity: 3 },
  { id: "spin-master", name: "Spin Master", description: "Spin around 3 times before each shot. Channel your inner tornado!", emoji: "\u{1F504}", severity: 2 },
  { id: "kneeling-tee", name: "Kneeling Tee Shot", description: "Hit your tee shot from your knees. Prayer position recommended.", emoji: "\u{1F9B5}", severity: 2 },
  { id: "one-club", name: "One Club Wonder", description: "Play the ENTIRE hole with just one randomly selected club. Choose wisely... oh wait, you can't!", emoji: "\u{1F3B2}", severity: 3 },
  { id: "no-practice", name: "No Practice Swings", description: "No warm-up swings allowed this hole. Grip it and rip it, cold!", emoji: "\u{1F6AB}", severity: 1 },
  { id: "foot-wedge", name: "Foot Wedge", description: "Must kick the ball once during the hole instead of hitting it. Soccer meets golf!", emoji: "\u26BD", severity: 2 },
  { id: "between-legs", name: "Between The Legs", description: "Hit at least one shot between your legs, backwards stance style. Crowd pleaser!", emoji: "\u{1F3AA}", severity: 2 },
  { id: "breath-hold", name: "Breath Holder", description: "Hold your breath during every swing on this hole. No passing out!", emoji: "\u{1F4A8}", severity: 1 },
  { id: "upside-down", name: "Circus Shot", description: "Hit one shot with the club upside down. Under-handed grip required!", emoji: "\u{1F3AD}", severity: 3 },
  { id: "compliment", name: "Self Hype", description: 'Must loudly compliment your own swing BEFORE every shot. "OH YEAH THAT WAS BEAUTIFUL!"', emoji: "\u{1F5E3}\uFE0F", severity: 1 },
  { id: "wrong-club", name: "Random Club Roulette", description: "Your tee shot must be with a randomly selected club. Could be driver, could be lob wedge... SPIN THE WHEEL!", emoji: "\u{1F3B0}", severity: 2 },
  { id: "ballerina", name: "Ballerina Finish", description: "Must hold a perfect pose for 3 seconds after every swing. Points for style!", emoji: "\u{1FA70}", severity: 1 },
  { id: "slow-mo", name: "Slow Motion", description: "Your entire swing must be in slow motion. Think dramatic movie scene.", emoji: "\u{1F3AC}", severity: 1 },
  { id: "song", name: "Karaoke Drive", description: "Must sing a song while driving off the tee. Full volume, no whispering!", emoji: "\u{1F3A4}", severity: 1 },
  { id: "eyes-closed-putt", name: "Eyes Closed Putting", description: "All putts on this hole must be taken with eyes closed. Trust the force.", emoji: "\u{1F52E}", severity: 2 },
  { id: "opposite-stance", name: "Goofy Stance", description: "Play the hole standing on the opposite side of the ball. Switch your stance completely!", emoji: "\u{1F643}", severity: 2 }
];
var games = /* @__PURE__ */ new Map();
var playerGameMap = /* @__PURE__ */ new Map();
function generateGameCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
function getRandomHandicap() {
  return HANDICAPS[Math.floor(Math.random() * HANDICAPS.length)];
}
function getGamePublicState(game) {
  return {
    id: game.id,
    code: game.code,
    hostId: game.hostId,
    players: Array.from(game.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      scores: p.scores,
      handicaps: p.handicaps
    })),
    currentHole: game.currentHole,
    totalHoles: game.totalHoles,
    status: game.status,
    spinning: game.spinning,
    currentHandicap: game.currentHandicap,
    scoresEntered: Array.from(game.scoresEntered)
  };
}
io.on("connection", (socket) => {
  console.log(`[GOLF] Connected: ${socket.id}`);
  socket.on("create-game", (data) => {
    const { playerName, avatar, totalHoles } = data;
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const code = generateGameCode();
    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const host = {
      id: playerId,
      socketId: socket.id,
      name: playerName,
      avatar,
      scores: {},
      handicaps: {}
    };
    const game = {
      id: gameId,
      code,
      hostId: playerId,
      players: /* @__PURE__ */ new Map([[playerId, host]]),
      currentHole: 0,
      totalHoles: totalHoles || 9,
      status: "lobby",
      spinning: false,
      currentHandicap: null,
      scoresEntered: /* @__PURE__ */ new Set(),
      createdAt: /* @__PURE__ */ new Date()
    };
    games.set(gameId, game);
    playerGameMap.set(socket.id, gameId);
    socket.join(gameId);
    socket.emit("game-created", {
      gameId,
      playerId,
      code,
      game: getGamePublicState(game)
    });
    console.log(`[GOLF] Game created: ${code} by ${playerName}`);
  });
  socket.on("join-game", (data) => {
    const { code, playerName, avatar } = data;
    let targetGame = null;
    for (const [, game] of games) {
      if (game.code === code.toUpperCase()) {
        targetGame = game;
        break;
      }
    }
    if (!targetGame) {
      socket.emit("error-message", { message: "Game not found! Check the code and try again." });
      return;
    }
    if (targetGame.status !== "lobby") {
      socket.emit("error-message", { message: "Game already in progress!" });
      return;
    }
    if (targetGame.players.size >= 8) {
      socket.emit("error-message", { message: "Game is full! Max 8 players." });
      return;
    }
    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const player = {
      id: playerId,
      socketId: socket.id,
      name: playerName,
      avatar,
      scores: {},
      handicaps: {}
    };
    targetGame.players.set(playerId, player);
    playerGameMap.set(socket.id, targetGame.id);
    socket.join(targetGame.id);
    socket.emit("game-joined", {
      gameId: targetGame.id,
      playerId,
      game: getGamePublicState(targetGame)
    });
    io.to(targetGame.id).emit("game-updated", {
      game: getGamePublicState(targetGame),
      event: `${playerName} joined the game!`
    });
    console.log(`[GOLF] ${playerName} joined game ${targetGame.code}`);
  });
  socket.on("start-game", (data) => {
    const game = games.get(data.gameId);
    if (!game) return;
    if (game.hostId !== data.playerId) {
      socket.emit("error-message", { message: "Only the host can start the game!" });
      return;
    }
    if (game.players.size < 2) {
      socket.emit("error-message", { message: "Need at least 2 players to start!" });
      return;
    }
    game.status = "playing";
    game.currentHole = 1;
    game.scoresEntered = /* @__PURE__ */ new Set();
    io.to(game.id).emit("game-updated", {
      game: getGamePublicState(game),
      event: "\u{1F3CC}\uFE0F GAME ON! Let's hit the links!"
    });
    console.log(`[GOLF] Game ${game.code} started with ${game.players.size} players`);
  });
  socket.on("spin-wheel", (data) => {
    const game = games.get(data.gameId);
    if (!game) return;
    if (game.spinning) return;
    if (game.status !== "playing") return;
    game.spinning = true;
    const players = Array.from(game.players.values());
    const selectedPlayer = players[Math.floor(Math.random() * players.length)];
    const handicap = getRandomHandicap();
    const result = {
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      handicap
    };
    game.currentHandicap = result;
    selectedPlayer.handicaps[game.currentHole] = result;
    io.to(game.id).emit("wheel-spin-start", {
      players: players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar }))
    });
    setTimeout(() => {
      game.spinning = false;
      io.to(game.id).emit("wheel-spin-result", {
        result,
        game: getGamePublicState(game)
      });
      console.log(`[GOLF] Hole ${game.currentHole}: ${selectedPlayer.name} got "${handicap.name}"`);
    }, 3e3);
  });
  socket.on("enter-score", (data) => {
    const game = games.get(data.gameId);
    if (!game) return;
    const player = game.players.get(data.playerId);
    if (!player) return;
    if (game.scoresEntered.has(data.playerId)) {
      socket.emit("error-message", { message: "You already entered a score for this hole!" });
      return;
    }
    player.scores[data.hole] = data.strokes;
    game.scoresEntered.add(data.playerId);
    console.log(`[GOLF] Score: ${player.name} = ${data.strokes} on hole ${data.hole} (${game.scoresEntered.size}/${game.players.size} entered)`);
    io.to(game.id).emit("game-updated", {
      game: getGamePublicState(game),
      event: `${player.name} scored ${data.strokes} on hole ${data.hole}`
    });
    if (game.scoresEntered.size === game.players.size) {
      setTimeout(() => {
        if (game.currentHole >= game.totalHoles) {
          game.status = "finished";
          io.to(game.id).emit("game-updated", {
            game: getGamePublicState(game),
            event: "\u{1F3C6} GAME OVER! Check the final scores!"
          });
          console.log(`[GOLF] Game ${game.code} finished!`);
        } else {
          game.currentHole++;
          game.scoresEntered = /* @__PURE__ */ new Set();
          game.currentHandicap = null;
          console.log(`[GOLF] Game ${game.code} advancing to hole ${game.currentHole}`);
          io.to(game.id).emit("hole-advance", {
            game: getGamePublicState(game),
            event: `\u26F3 Hole ${game.currentHole} - Spin the wheel!`,
            hole: game.currentHole
          });
        }
      }, 1500);
    }
  });
  socket.on("rejoin-game", (data) => {
    const game = games.get(data.gameId);
    if (!game) {
      socket.emit("error-message", { message: "Game not found!" });
      return;
    }
    const player = game.players.get(data.playerId);
    if (!player) {
      socket.emit("error-message", { message: "Player not found in this game!" });
      return;
    }
    player.socketId = socket.id;
    playerGameMap.set(socket.id, game.id);
    socket.join(game.id);
    socket.emit("game-rejoined", {
      playerId: data.playerId,
      game: getGamePublicState(game)
    });
    io.to(game.id).emit("game-updated", {
      game: getGamePublicState(game),
      event: `${player.name} reconnected!`
    });
  });
  socket.on("leave-game", () => {
    const gameId = playerGameMap.get(socket.id);
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game) return;
    const playerToRemove = Array.from(game.players.values()).find((p) => p.socketId === socket.id);
    if (!playerToRemove) return;
    game.players.delete(playerToRemove.id);
    socket.leave(gameId);
    playerGameMap.delete(socket.id);
    if (game.players.size === 0) {
      games.delete(gameId);
      console.log(`[GOLF] Game ${game.code} deleted (no players)`);
    } else {
      if (game.hostId === playerToRemove.id) {
        const newHost = Array.from(game.players.values())[0];
        game.hostId = newHost.id;
      }
      io.to(gameId).emit("game-updated", {
        game: getGamePublicState(game),
        event: `${playerToRemove.name} left the game`
      });
    }
    console.log(`[GOLF] ${playerToRemove.name} left game ${game.code}`);
  });
  socket.on("disconnect", () => {
    const gameId = playerGameMap.get(socket.id);
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game) return;
    console.log(`[GOLF] Disconnected: ${socket.id} (still in game ${game.code})`);
    setTimeout(() => {
      const playerToRemove = Array.from(game.players.values()).find((p) => p.socketId === socket.id);
      if (playerToRemove) {
        game.players.delete(playerToRemove.id);
        playerGameMap.delete(socket.id);
        if (game.players.size === 0) {
          games.delete(gameId);
        } else {
          if (game.hostId === playerToRemove.id) {
            const newHost = Array.from(game.players.values())[0];
            game.hostId = newHost.id;
          }
          io.to(gameId).emit("game-updated", {
            game: getGamePublicState(game),
            event: `${playerToRemove.name} disconnected`
          });
        }
      }
    }, 3e5);
  });
  socket.on("error", (error) => {
    console.error(`[GOLF] Socket error (${socket.id}):`, error);
  });
});
var PORT = parseInt(process.env.PORT || "3003", 10);
httpServer.on("request", (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", games: games.size, uptime: process.uptime() }));
  }
});
httpServer.listen(PORT, () => {
  console.log(`[GOLF] \u{1F3CC}\uFE0F Golf Game WebSocket server running on port ${PORT}`);
});
process.on("SIGTERM", () => {
  console.log("[GOLF] Received SIGTERM, shutting down...");
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[GOLF] Received SIGINT, shutting down...");
  httpServer.close(() => process.exit(0));
});
