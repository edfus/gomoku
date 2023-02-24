import App, { serialize } from './app.js';
import { uuidv4 } from './helpers.js';
import { Client, GomokuMatch, GomokuServer } from "./interfaces.js";

// Only dry run tested.
//TODO: max connections per IP, logging (tracking).

const port = 3001;
const host = process.env["NODE_ENV"] === "production" ? "0.0.0.0" : "0.0.0.0";
const devFrontend = "http://localhost:8080";
const origin = process.env["GOMOKU_ORIGIN"] || devFrontend;

const gomoku = new GomokuServer();

const app = new App();
app.listen({ port, host, clientTracking: true });

app.use((ctx, next) => {
  if (ctx.command === "Beep") {
    return ctx.ws.send(serialize("Boop"));
  }
  return next();
});

const uuidMatcher = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
app.use((ctx, next) => {
  const ws = ctx.ws;
  if (ctx.command === "Identify") {
    if (typeof ctx.data.clientId !== "string") {
      return ws.send(serialize("IdentityRejected"));
    }

    if (uuidMatcher.exec(ctx.data.clientId) === null) {
      return ws.send(serialize("IdentityRejected"));
    }

    const client = new Client(ctx.data.clientId);
    gomoku.addClient(client);
    ctx.state.client = client;
    ctx.state.clientId = ctx.data.clientId;
    return ws.send(serialize("IdentityAcknowledged"));
  }

  if (!ctx.state.clientId) {
    return ws.send(serialize("IdentityRequired"));
  }
  return next();
});

app.use((ctx, next) => {
  if (ctx.command === "ProvideIdleStatus") {
    return ctx.ws.send(serialize(
      "IdleStatusProvided", {
      status: "Online"
    }
    ));
  }
  return next();
});

app.use(async (ctx, next) => {
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
      if (foundMatch && foundMatch.join(ctx.state.client, ctx.ws) == true) {
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
          if (foundMatch.join(ctx.state.client, ctx.ws) == true) {
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

        if (foundMatch && foundMatch.hasClient(ctx.state.client) && !foundMatch.finished) {
          ctx.state.match = foundMatch;

          foundMatch.reconnect(ctx.state.client, ctx.ws);

          return ctx.ws.send(serialize(
            "Reconnected", {
            gameId,
            playerUp: await foundMatch.getPlayerUp()
          }
          ));
        } else {
          return ctx.ws.send(serialize(
            "OpponentQuit", { //NOTE
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
  if (ctx.state.filtered) {
    return;
  }
  // Exclusive middlewares for users being in a match from here
  if (
    !ctx.state.match || !ctx.state.match.hasClient(ctx.state.client)
    /* !gomoku.hasMatch(ctx.state.match) */) {
    ctx.state.filtered = true;
    console.error("!ctx.state.match || !ctx.state.match.hasClient(ctx.state.client)");
    return ctx.ws.send(serialize("OpponentQuit")); //
  }
  return next();
});

app.use(async (ctx, next) => {
  switch (ctx.command) {
    case "ChooseColorPref":
      const match = ctx.state.match;
      if (!match.finished) {
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
        //NOTE
        ctx.ws.send(serialize(
          "YourColor", {
          gameId: match.id,
          yourColor: ctx.data.colorPref
        }
        ));
        ctx.ws.send(serialize(
          "GameReady", {
          gameId: match.id,
          boardSize: match.boardSize
        }
        ));
        return ctx.ws.send(serialize(
          "OpponentQuit", { //
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
      if (!ctx.state.quited && match.getOpponent(ctx.state.client)?.quited) {
        return ctx.ws.send(serialize("OpponentQuit"));
      }

      return ctx.ws.send(serialize(
        "SyncReply", {
        replyTo: reqId,
        gameId: match.id,
        playerUp: await match.getPlayerUp(),
        turn: await match.getTurn(),
        moves: await match.getMoves(),
      }
      ));
    case "MakeMove":
      if (ctx.data.gameId !== match.id) {
        return ctx.ws.send(serialize(
          "MoveRejected", { //NOTE
          gameId: ctx.data.gameId
        }
        ));
      }

      const playerColor0 = match.getPlayer(ctx.state.client).color;

      if (playerColor0 === ctx.data.player) {
        const coord = ctx.data.coord;
        const ret = await match.move(
          coord, playerColor0
        );

        if (ret === true) {
          return match.broadcast(
            "MoveMade", {
            gameId: match.id,
            replyTo: ctx.data.reqId,
            player: match.getPlayer(ctx.state.client).color,
            coord: coord
          });
        }
      }

      return ctx.ws.send(serialize(
        "MoveRejected", { //NOTE
        gameId: match.id,
        replyTo: ctx.data.reqId,
        player: ctx.data.player
      }));
    case "QuitGame":
      ctx.state.quited = true;
      return match.quit(ctx.state.client);
    case "ReqUndoResponse":
      const player = match.getPlayer(ctx.state.client);
      player.event.emit("ReqUndoResponse", ctx.data);
      return ctx.ws.send(serialize(
        "ReqUndoResponseAck", {
        gameId: match.id,
        replyTo: ctx.data.reqId,
        id: ctx.data.replyTo
      }
      ));
    case "UndoMove":
      const opponent = match.getOpponent(ctx.state.client);
      if (opponent.quit || !opponent?.ws) {
        return ctx.ws.send(serialize(
          "OpponentQuit", { //NOTE
          gameId: match.id,
          player: ctx.data.player
        }
        ));
      }

      const playerColor = match.getPlayer(ctx.state.client).color;

      if (playerColor !== ctx.data.player) {
        return ctx.ws.send(serialize(
          "UndoRejected", { //NOTE
          gameId: match.id,
          player: ctx.data.player
        }
        ));
      }

      await match.lock();

      const reqUndoId = uuidv4();
      let responseReceived = false, response = "";
      const cb = data => {
        const { replyTo, answer } = data;
        if (replyTo === reqUndoId) {
          responseReceived = true;
          response = answer;
          opponent.event.removeListener("ReqUndoResponse", cb);
        }
      };
      opponent.event.on("ReqUndoResponse", cb);

      let throttle = 0;
      while (!responseReceived && !opponent.disconnected && !opponent.quited) {
        if(++throttle > 20) {
          opponent.ws.send(serialize("ReqUndoMove", {
            gameId: match.id,
            player: playerColor,
            reqId: reqUndoId
          }));
          throttle = 0;
        }

        await new Promise(cb => setTimeout(cb, 50));
      }

      switch (response) {
        case "MoveUndone":
          const player = playerColor === "BLACK" ? 0 : 1;
          let move = match.moves.pop();
          while (move && move.player !== playerColor) {
            move = match.moves.pop();
          }
          if (!move) { // square one
            match.playerUp = 0;
          } else {
            match.playerUp = player;
          }
          await match.unlock();
          return ctx.ws.send(serialize(
            "MoveUndone", {
            gameId: match.id,
            player: playerColor
          }
          ));
        case "UndoRejected":
        // fallthrough
        default:
          await match.unlock();
          return ctx.ws.send(serialize(
            "UndoRejected", { //NOTE
            gameId: match.id,
            player: playerColor
          }
          ));
      }
    default:
      break;
  }

  return next();
});

const shutdown = async () => {
  process.exitCode = 0;
  console.info("Closing servers...");
  if (process.env["NODE_ENV"] !== "production") {
    await Promise.all(
      Array.from(app.wss.clients).map(
        client => new Promise(resolve => {
          client.terminate();
          return resolve();
        })
      )
    );
  }

  await Promise.all(
    [app.wss].map(
      server => new Promise(resolve => {
        server.unref && server.unref();
        server.close(resolve);
      })
    )
  );
  console.info("Have a nice day.");
};

process.once("SIGINT", shutdown);
process.once("SIGQUIT", shutdown);

