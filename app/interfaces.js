import { EventEmitter } from 'events';
import { serialize } from './app.js';
import { uuidv4 } from "./helpers.js";

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
      color: "",
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
      this.players[i].disconnected = true;
      this.players[i].event.emit("disconnect");
      if(!this.players[1 - i]) {
        return this.quit(client);
      }
      if(!this.players[i].quited) {
        setTimeout(() => {
          if(this.players[i].disconnected) {
            this.quit(client);
          }
        }, 2000);
      }
    });
  }

  quit(client) {
    const opponent = this.getOpponent(client);
    const i = this.players[0].client.id === client.id ? 0 : 1;

    this.players[i].ws = null;
    this.players[i].quited = true;
    const cb = () => {
      opponent?.ws && opponent.ws.send(serialize("OpponentQuit"));
      // this.gomoku.purgeMatch(this);
    }

    if(opponent?.quited) {
      this.finished = true;
      return this.gomoku.purgeMatch(this);
    }

    if(opponent?.disconnected) {
      opponent.event.once("reconnect", cb);
    } else {
      cb();
    }
  }

  getPlayer (client) {
    if(this.players[0]?.client?.id === client.id) {
      return this.players[0];
    } else {
      return this.players[1];
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

  locked = false;
  lockPromise = null;
  async lock () {
    while(this.locked) {
      await this.lockPromise.promise;
    }
    this.locked = true;
    this.lockPromise = {};
    this.lockPromise.initing = true;
    this.lockPromise.promise = new Promise((resolve, reject) => {
      if(this.lockPromise.resolved) {
        return resolve();
      }
      this.lockPromise.resolve = resolve;
      this.lockPromise.reject = reject;
      this.lockPromise.initing = false;
    })
  }

  async unlock () {
    this.locked = false;
    if(this.lockPromise.initing) {
      this.lockPromise.resolved = true;
    } else {
      this.lockPromise.resolve();
    }
  }

  async getPlayerUp () {
    await this.lock();
    const playerUp = this.playerUp;
    await this.unlock();
    return playerUp === 0 ? "BLACK" : "WHITE";
  }

  moves = [];
  async getTurn () {
    await this.lock();
    const turn = this.moves.length + 1;
    await this.unlock();
    return turn;
  }

  async getMoves () {
    await this.lock();
    const moves = this.moves;
    await this.unlock();
    return moves;
  }

  async move (coord, playerColor) {
    await this.lock();
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
      turn: this.moves.length + 1
    });
    await this.unlock();
    return true;
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

  hasMatch(id) {
    if(id instanceof GomokuMatch) {
      return this.matches.has(id.id);
    } else {
      return this.matches.has(id);
    }
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

export { Client, GomokuMatch, GomokuServer };
