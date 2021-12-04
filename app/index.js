import App, { serialize } from './app.js';
import crypto from "crypto"
import { EventEmitter } from 'events';

const devFrontend = "http://localhost:8081";
const port = 8080;
const host = "localhost";
const origin = process.env["GOMOKU_ORIGIN"] || devFrontend

class Client {
  constructor (id) {
    this.id = id;
  }
}

const nil = Infinity;
class GomokuMatch {
  players = new Array(2);
  constructor (gomoku, size, client, ws) {
    this.board = new Array(size).fill(void 0).map(
      _ => new Array(size).fill(nil)
    );
    this.boardSize = size;
    this.playerUp = 0;
    this.finished = false;
    this.id = uuidv4();
    this.players[0] = this.newPlayer(client, ws);

    this.reconnect(client, ws);
    this.gomoku = gomoku;
    this.gomoku.addMatch(this);
  }

  joined = false;
  join (client, ws) {
    if(this.joined) {
      return false;
    }
    this.joined = true;
    this.players[1] = this.newPlayer(client, ws);
    this.reconnect(client, ws);
    return true;
  }

  newPlayer (client, ws) {
    return {
      color: nil,
      colorPref: "",
      client,
      ws,
      disconnected: false,
      quited: false,
      event: new EventEmitter()
    };
  }

  chooseColorPromise = null;
  async chooseColor (client, color) {
    if(!["BLACK", "WHITE", "ANY"].includes(color)) {
      this.chooseColorPromise && this.chooseColorPromise.reject();
      throw new Error("unexpected color " + color);
    }

    if(!this.hasClient(client)) {
      this.chooseColorPromise && this.chooseColorPromise.reject();
      throw new Error("ghost client " + client.id);
    }

    let index = 0;
    for (; index < this.players.length; index++) {
      if(this.players[index]?.client?.id === client.id) {
        this.players[index].colorPref = color;
        break;
      }
    }

    const player0 = this.players[index];
    const player1 = this.players[1 - index];
    const colorPref0 = player0?.colorPref;
    const colorPref1 = player1?.colorPref;

    if(colorPref0 && colorPref1) {
      switch (colorPref0) {
        case "BLACK":
          if(colorPref1 === "WHITE") {
            player0.color = colorPref0;
            player1.color = colorPref1;
            break;
          }

          if (colorPref1 === "BLACK") {
            const ret = ["BLACK", "WHITE"];
            const i = Number(Math.random() >= .5);
            player0.color = ret[1 - i];
            player1.color = ret[i];
            break;
          }

          // player1: ANY
          player0.color = colorPref0;
          player1.color = "WHITE";
          break;
        case "WHITE":
          if(colorPref1 === "BLACK") {
            player0.color = colorPref0;
            player1.color = colorPref1;
            break;
          }

          if (colorPref1 === "WHITE") {
            const ret = ["BLACK", "WHITE"];
            const i = Number(Math.random() >= .5);
            player0.color = ret[1 - i];
            player1.color = ret[i];
            break;
          }

          // player1: ANY
          player0.color = colorPref0;
          player1.color = "BLACK";
          break;
        case "ANY":
          if(colorPref1 === "ANY") {
            const ret = ["BLACK", "WHITE"];
            const i = Number(Math.random() >= .5);
            player0.color = ret[1 - i];
            player1.color = ret[i];
            break;
          }

          player1.color = colorPref1;
          player0.color = player1.color === "BLACK" ? "WHITE" : "BLACK";
          break;
        default:
          throw new Error("unexpected color " + colorPref0);
      }

      this.chooseColorPromise.resolve(player1.color);
      return player0.color;
    } else {
      if(this.chooseColorPromise) {
        return this.chooseColorPromise.promise;
      }

      this.chooseColorPromise = {};
      const promise = new Promise((resolve, reject) => {
        this.chooseColorPromise.resolve = resolve;
        this.chooseColorPromise.reject = reject;
      });
      this.chooseColorPromise.promise = promise;
      return promise;
    }
  }

  hasClient (client) {
    return this.players.some(
      player => player && player.client?.id === client.id
    )
  }

  reconnect (client, ws) {
    const i = this.players[0].client.id === client.id ? 0 : 1;

    this.players[i].client = client;
    this.players[i].ws = ws;
    this.players[i].disconnected = false;
    this.players[i].event.emit("reconnect");

    ws.once("close", () => {
      console.log("close");
      if(!this.players[i].quited) {
        this.players[i].disconnected = true;
        this.players[i].event.emit("disconnect");
        setTimeout(() => {
          if(this.players[i].disconnected) {
            this.quit(client, ws);
          }
        }, 1000);
      }
    });
  }

  quit(client, ws) {
    const opponent = this.getOpponent(client);
    const i = this.players[0].client.id === client.id ? 0 : 1;

    this.players[i].ws = null;
    this.players[i].quited = true;
    const cb = () => {
      opponent?.ws && opponent.ws.send(serialize("OpponentQuit"));
      // this.gomoku.purgeMatch(this);
    }

    if(opponent?.quited) {
      return this.gomoku.purgeMatch(this);
    }

    if(opponent?.disconnected) {
      opponent.event.once("reconnect", cb);
    } else {
      cb();
    }
  }

  getOpponent (client) {
    if(this.players[0]?.client?.id === client.id) {
      return this.players[1];
    } else {
      return this.players[0];
    }
  }

  broadcast (type, messsage) {
    const payload = serialize(type, messsage);
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      
      if(!player || player.quited) {
        continue;
      }

      if(player.disconnected) {
        player.event.once("reconnect", () => {
          player.ws.send(payload);
        })
      } else {
        player.ws.send(payload);
      }
    }
  }

  getPlayerUp () {
    return this.playerUp === 0 ? "BLACK" : "WHITE";
  }

  moves = [];
  getTurn () {
    return this.moves.length + 1;
  }

  getMoves () {
    return this.moves;
  }

  move (coord, playerColor) {
    const player = playerColor === "BLACK" ? 0 : 1;

    if(this.playerUp !== player) {
      return false;
    }
    if(!coord) {
      // pass

    } else {
      const { x, y } = coord;
      if(x < 0 || x >= this.boardSize) {
        return false;
      }
      if(y < 0 || y >= this.boardSize) {
        return false;
      }
      if(this.board[x][y] !== nil) {
        return false;
      }
  
      this.board[x][y] = player;
    }

    this.playerUp = 1 - player;
    this.moves.push({
      coord,
      player: playerColor,
      turn: this.getTurn()
    });
    return true;
  }

  isBoardFull () {
    return this.board.every(
      row => row.every(vertex => vertex === nil))
  }
}

class GomokuServer {
  clients = new Map()
  matches = new Map()
  queuing = []
  addClient (client) {
    if(!(client instanceof Client)) {
      return;
    }
    this.clients.set(
      client.id, client
    );
  }

  addMatch (match) {
    if(!(match instanceof GomokuMatch)) {
      return;
    }
    this.matches.set(
      match.id, match
    );
  }

  getMatch (id) {
    return this.matches.get(
      id
    );
  }

  purgeMatch (match) {
    this.matches.delete(match.id);
  }
}

const gomoku = new GomokuServer();

const app = new App();
app.listen({ port, host, clientTracking : true });

app.use((ctx, next) => {
  if(ctx.command === "Beep") {
    return ctx.ws.send(serialize("Boop"));
  }
  return next();
});

const uuidMatcher = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i
app.use((ctx, next) => {
  const ws = ctx.ws;
  if(ctx.command === "Identify") {
    if(typeof ctx.data.clientId !== "string") {
      return ws.send(serialize("IdentityRejected"));
    }

    if(uuidMatcher.exec(ctx.data.clientId) === null) {
      return ws.send(serialize("IdentityRejected"));
    }

    const client = new Client(ctx.data.clientId);
    gomoku.addClient(client);
    ctx.state.client = client;
    ctx.state.clientId = ctx.data.clientId;
    return ws.send(serialize("IdentityAcknowledged"));
  }

  if(!ctx.state.clientId) {
    return ws.send(serialize("IdentityRequired"));
  }
  return next();
});

app.use((ctx, next) => {
  if(ctx.command === "ProvideIdleStatus") {
    return ctx.ws.send(serialize(
      "IdleStatusProvided", {
        status: "Online"
      }
    ));
  }
  return next();
});

app.use((ctx, next) => {
  switch (ctx.command) {
    case "CreatePrivateGame":
      const boardSize = ctx.data.boardSize;
      const match = new GomokuMatch(gomoku, boardSize, ctx.state.client, ctx.ws);
      
      ctx.state.match = match;

      return ctx.ws.send(serialize(
        "WaitForOpponent", {
          gameId: match.id,
          link: new URL(
            `/?join=${match.id}`,
            origin
          ).toString(),
          visibility: "Private"
        }
      ));
    case "JoinPrivateGame":
      const gameId = ctx.data.gameId;
      const foundMatch = gomoku.getMatch(gameId);
      if(foundMatch && foundMatch.join(ctx.state.client, ctx.ws) == true) {
        ctx.state.match = foundMatch;
        
        return foundMatch.broadcast(
          "GameReady", {
            gameId,
            boardSize: foundMatch.boardSize
          }
        );
      } else {
        return ctx.ws.send(serialize(
          "PrivateGameRejected", {
            gameId
          }
        ));
      }
    case "FindPublicGame":
      {
        while (gomoku.queuing.length) {
          const foundMatch = gomoku.queuing.shift();
          if(foundMatch.join(ctx.state.client, ctx.ws) == true) {
            ctx.state.match = foundMatch;
            
            foundMatch._publicready = true;
            return foundMatch.broadcast(
              "GameReady", {
                gameId: foundMatch.id,
                boardSize: foundMatch.boardSize
              }
            );
          }
        }
        
        const match = new GomokuMatch(gomoku, 19, ctx.state.client, ctx.ws);
        gomoku.queuing.push(match);
        ctx.state.match = match;
  
        return ctx.ws.send(serialize(
          "WaitForOpponent", {
            gameId: match.id,
            visibility: "Public"
          }
        ));
      }
    case "Reconnect":
      {
        const gameId = ctx.data.gameId;
        const foundMatch = gomoku.getMatch(gameId);
        
        if(foundMatch && foundMatch.hasClient(ctx.state.client) && !foundMatch.finished) {
          ctx.state.match = foundMatch;

          foundMatch.reconnect(ctx.state.client, ctx.ws);

          return ctx.ws.send(serialize(
            "Reconnected", {
              gameId,
              playerUp: foundMatch.getPlayerUp()
            }
          ));
        } else {
          return ctx.ws.send(serialize(
            "ReconnectRejected", {
              gameId
            }
          ));
        }
      }
    default:
      break;
  }

  return next();
});

app.use(async (ctx, next) => {
  // Following are exclusive middlewares for users being in a match
  if(!ctx.state.match || !ctx.state.match.hasClient(ctx.state.client)) {
    console.error("!ctx.state.match || !ctx.state.match.hasClient(ctx.state.client)");
    return ctx.ws.send(serialize("OpponentQuit")); //
  }
  return next();
});

app.use(async (ctx, next) => {
  switch (ctx.command) {
    case "ChooseColorPref":
      const match = ctx.state.match;
      if(!match.finished) {
        const color = await match.chooseColor(ctx.state.client, ctx.data.colorPref);
        ctx.ws.send(serialize(
          "YourColor", {
            gameId: match.id,
            yourColor: color
          }
        ));

        return ctx.ws.send(serialize(
          "GameReady", {
            gameId: match.id,
            boardSize: match.boardSize
          }
        ));
      } else {
        return ctx.ws.send(serialize(
          "ChooseColorPrefReject", {
            gameId: match?.id
          }
        ));
      }
    default:
      break;
  }

  return next();
});

// Sync
app.use(async (ctx, next) => {
  const match = ctx.state.match;
  switch (ctx.command) {
    case "ReqSync":
      const reqId = ctx.data.reqId;
      // ?
      if(!ctx.state.quited && match.getOpponent(ctx.state.client)?.quited) {
        return ctx.ws.send(serialize("OpponentQuit"));
      }

      return ctx.ws.send(serialize(
        "SyncReply", {
          replyTo: reqId,
          gameId: match.id,
          playerUp: match.getPlayerUp(),
          turn: match.getTurn(),
          moves: match.getMoves(),
        }
      ));
    case "MakeMove":
      if(ctx.data.gameId !== match.id) {
        return ctx.ws.send(serialize(
          "MakeMoveReject", {
            gameId: ctx.data.gameId
          }
        ));
      }

      const coord = ctx.data.coord;
      const ret = match.move(coord, ctx.data.player);

      if(ret === true) {
        return match.broadcast(
          "MoveMade", {
            gameId: match.id,
            replyTo: ctx.data.reqId,
            player: ctx.data.player,
            coord: coord
          }
        );
      } else {
        return ctx.ws.send(serialize(
          "MoveRejected", {
            gameId: match.id,
            replyTo: ctx.data.reqId,
            player: ctx.data.player
          }
        ));
      }
    case "QuitGame":
      ctx.state.quited = true;
      return match.quit(ctx.state.client, ctx.ws);
    default:
      break;
  }

  return next();
});

const shutdown = async () => {
  process.exitCode = 0;
  console.info("Closing servers...");
  await Promise.all(
    Array.from(app.wss.clients).map(
      client => new Promise(resolve => {
        client.terminate()
        return resolve();
      })
    )
  );
  await Promise.all(
    [ app.wss ].map(
      server => new Promise(resolve => {
        server.unref && server.unref()
        server.close(resolve)
      })
    )
  );
  console.info("Have a nice day.");
};

process.once("SIGINT", shutdown);
process.once("SIGQUIT", shutdown);

function uuidv4 () {
  return crypto.randomUUID();
}