import App, { serialize } from './app.js';
import { Client, GomokuMatch, GomokuServer } from "./interfaces.js";

// Only dry run tested.
//TODO: redis, logging (tracking).

const port = 3001;
const host = "localhost";
const devFrontend = "http://localhost:8080";
const origin = process.env["GOMOKU_ORIGIN"] || devFrontend

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
  // Exclusive middlewares for users being in a match from here
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

