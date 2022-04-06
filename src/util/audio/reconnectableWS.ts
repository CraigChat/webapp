export default class ReconnectableWebSocket {
  sock?: WebSocket;
  url: string;
  connecter: (arg0: WebSocket) => Promise<unknown>;
  closeHandler: (arg0: CloseEvent) => unknown;
  promise: Promise<unknown>;
  keepaliveTimeout: null | number;

  constructor(url: string, closeHandler: (arg0: CloseEvent) => unknown, connecter: (arg0: WebSocket) => Promise<unknown>) {
    this.url = url;
    this.closeHandler = closeHandler;
    this.connecter = connecter;
    this.promise = Promise.all([]);
    this.keepaliveTimeout = null;
  }

  // Perform the initial connection
  connect() {
    let sock: WebSocket;
    let connectTimeout: null | any = null;
    this.promise = this.promise
      .then(() => {
        // Set up the web socket
        sock = this.sock = new WebSocket(this.url);
        sock.binaryType = 'arraybuffer';
        sock.onerror = this.closeHandler as any;
        sock.onclose = this.closeHandler;

        return new Promise((res, rej) => {
          sock.onopen = () => {
            this.connecter(sock).then(res).catch(rej);
          };

          connectTimeout = setTimeout(rej, 10000);
        });
      })
      .then(() => {
        clearTimeout(connectTimeout);

        // Now the connecter is done. Give it a second, then set up automatic reconnection.
        setTimeout(() => {
          if (sock !== this.sock) return;
          sock.onclose = (ev: CloseEvent) => {
            if (ev.code === 1000) this.closeHandler(ev);
            else this.connect().catch(this.closeHandler);
          };
        }, 1000);
      });
    return this.promise;
  }

  // Send data
  send(data: any) {
    if (this.sock && this.sock.readyState !== WebSocket.OPEN) return;
    this.promise = this.promise.then(() => {
      this.sock!.send(data);
    });
    return this.promise;
  }

  // Close the connection
  close() {
    this.promise = this.promise.then(() => {
      this.sock!.onclose = this.closeHandler;
      this.sock!.close();
    });
    return this.promise;
  }
}
