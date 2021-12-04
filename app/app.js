import { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';

function serialize (type, message) {
  return JSON.stringify({
    type,
    ...message
  })
}

class App extends EventEmitter {
  middlewares = [];
  context = {
    app: this,
    throw (status, message) {
      const err = new Error(message || status);
      err.status = status;
      err.expose = true;
      throw err;
    },
    assert (shouldBeTruthy, status, message) {
      if(!shouldBeTruthy) {
        this.throw(status, message);
      }
    },
    serialize
  }

  prepend (middleware) {
    this.middlewares.unshift(middleware);
    return this;
  }

  use (middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  callback () {
    if (!this.listenerCount('error')) {
      console.info(
        "\x1b[1m\x1b[30mNo listener attached for 'error' event,",
        "forwarding all errors to console...\x1b[0m"
      );
      this.on('error', console.error);
    }

    return async (ws, req) => {
      const context = {
        ...this.context,
        ws,
        state: {},
        secure: req.socket.encrypted,
        ip: proxyHeader(req, "X-Forwarded-For") || req.socket.remoteAddress
      }

      ws.on('message', async payload => {
        const ctx = context;
  
        let index = 0;
        const next = async () => {
          if(index >= this.middlewares.length)
            return ;
          return this.middlewares[index++](ctx, next);
        };

        try {
          const data = JSON.parse(payload);
          const command = data.type;
          if(command !== "Beep")
          console.log('\x1b[33mreceived: %s\x1b[0m', payload);

          ctx.data = data;
          ctx.command = command;
          await next();
        } catch (err) {
          const status = Number(err.status || 500);
          ws.send(serialize("Error", {
            status,
            message: err.message
          }));
          this.emit("error", err);
        }
      });
    
      ws.once('close', () => {
        this.emit("close", ws);
      });

      const send = ws.send.bind(ws)
    
      ws.send = (...args) => {
        if(args[0] !== "{\"type\":\"Boop\"}")
        console.log('\x1b[36msent:', args.length === 1 ? args[0] : args, "\x1b[0m");
        return send(...args);
      }
    }
  }

  listen (...argvs) {
    const wss = new WebSocketServer(...argvs);
    this.wss = wss;
    return (
      wss.on("connection", this.callback())
      .on("error", err => this.emit("error", err))
      .on("close", arg => this.emit("close", arg))
    );
  }
}

function proxyHeader(req, name) {
  name = name.toLowerCase();
  if(req.headers[name])
    return req.headers[name].split(",", 1)[0].trim();
  else
    return false;
}

export default App
export { serialize }