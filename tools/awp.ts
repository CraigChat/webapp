declare const AudioWorkletProcessor: {
  prototype: {
    readonly port: MessagePort;
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
  };
  new (): {
    readonly port: MessagePort;
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
  };
};

declare function registerProcessor(name: string, processorCtor: any): void;

const BUFFER_SIZE = 96000;

// General-purpose processor for doing work in a Worker
class WorkerProcessor extends AudioWorkletProcessor {
  workerPort?: MessagePort;

  /** Can we use shared memory? */
  canShared = typeof SharedArrayBuffer !== 'undefined';

  /* OUTGOING: a number of shared buffers equal to the number of channels,
   * and a shared read/write head */
  outgoing?: Float32Array[];
  outgoingRW?: Int32Array;

  // INCOMING
  incoming?: Float32Array[];
  incomingRW?: Int32Array;

  constructor() {
    super();

    // The only message from the AWP port is the worker port
    this.port.onmessage = (ev) => {
      const msg = ev.data;
      switch (msg.c) {
        case 'workerPort':
          console.log('AWP: Got worker port');
          this.workerPort = msg.p;
          this.workerPort!.onmessage = (ev) => {
            // Message-passing data receipt
            let writeHead = this.incomingRW[1];
            const buf = ev.data.d;
            const len = buf[0].length;
            if (writeHead + len > BUFFER_SIZE) {
              // We loop around
              const brk = BUFFER_SIZE - writeHead;
              for (let i = 0; i < this.incoming.length; i++) {
                this.incoming[i].set(buf[i % buf.length].subarray(0, brk), writeHead);
                this.incoming[i].set(buf[i % buf.length].subarray(brk), 0);
              }
            } else {
              // Simple case
              for (let i = 0; i < this.incoming.length; i++) this.incoming[i].set(buf[i % buf.length], writeHead);
            }
            writeHead = (writeHead + len) % BUFFER_SIZE;
            this.incomingRW[1] = writeHead;
          };
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    if (!this.workerPort || inputs.length === 0 || inputs[0].length === 0) return true;

    // SETUP

    if (!this.incoming) {
      console.log('AWP: Setting up incoming packets, using shared memory:', this.canShared);
      const chans = inputs[0].length;
      this.incoming = [];
      for (let i = 0; i < chans; i++) {
        this.incoming.push(
          new Float32Array(this.canShared ? new SharedArrayBuffer(BUFFER_SIZE * 4) : new ArrayBuffer(BUFFER_SIZE * 4))
        );
      }
      this.incomingRW = new Int32Array(this.canShared ? new SharedArrayBuffer(8) : new ArrayBuffer(8));

      if (this.canShared) {
        // Don't need outgoing at all if we can't use shared memory
        this.outgoing = [];
        for (let i = 0; i < chans; i++) {
          this.outgoing.push(new Float32Array(new SharedArrayBuffer(BUFFER_SIZE * 4)));
        }
        this.outgoingRW = new Int32Array(new SharedArrayBuffer(8));

        // Tell the worker about our buffers
        this.workerPort.postMessage({
          c: 'buffers',
          incoming: this.incoming,
          incomingRW: this.incomingRW,
          outgoing: this.outgoing,
          outgoingRW: this.outgoingRW
        });
      }
    }

    // INPUT (outgoing)

    // Transmit our current data
    const inp = inputs[0];
    if (this.canShared) {
      // Write it into the buffer
      let writeHead = this.outgoingRW![1];
      const len = inp[0].length;
      if (writeHead + len > BUFFER_SIZE) {
        // We wrap around
        const brk = BUFFER_SIZE - writeHead;
        for (let i = 0; i < this.outgoing.length; i++) {
          this.outgoing[i].set(inp[i % inp.length].subarray(0, brk), writeHead);
          this.outgoing[i].set(inp[i % inp.length].subarray(brk), 0);
        }
      } else {
        // Simple case
        for (let i = 0; i < this.outgoing.length; i++) this.outgoing[i].set(inp[i % inp.length], writeHead);
      }
      writeHead = (writeHead + len) % BUFFER_SIZE;
      Atomics.store(this.outgoingRW!, 1, writeHead);

      // Notify the worker
      Atomics.notify(this.outgoingRW!, 1);
    } else {
      /* Just send the data, along with a timestamp. Minimize allocation
       * by sending plain */
      this.workerPort.postMessage(Date.now());
      this.workerPort.postMessage(inputs[0]);
    }

    // OUTPUT (incoming)

    let readHead: number = this.incomingRW[0];
    let writeHead: number;
    if (this.canShared) writeHead = Atomics.load(this.incomingRW, 1);
    else writeHead = this.incomingRW[1];
    if (readHead === writeHead) return true;
    let len = writeHead - readHead;
    if (len < 0) len += BUFFER_SIZE;

    // Drain any excess buffer
    if (len > 4800) {
      readHead = writeHead - 4800;
      if (readHead < 0) readHead += BUFFER_SIZE;
    }

    // Don't use too little data
    if (len < outputs[0].length) return true;

    // Finally, send the buffered output
    const out = outputs[0];
    const readEnd = (readHead + out[0].length) % BUFFER_SIZE;
    if (readEnd < readHead) {
      // We wrap around
      const brk = BUFFER_SIZE - readHead;
      for (let i = 0; i < out.length; i++) {
        out[i].set(this.incoming[i % this.incoming.length].subarray(readHead), 0);
        out[i].set(this.incoming[i % this.incoming.length].subarray(0, readEnd), brk);
      }
    } else {
      // Simple case
      for (let i = 0; i < out.length; i++) {
        out[i].set(this.incoming[i % this.incoming.length].subarray(readHead, readEnd), 0);
      }
    }

    // And update the read head
    if (this.canShared) {
      Atomics.store(this.incomingRW, 0, readEnd);
      Atomics.notify(this.incomingRW, 0);
    } else {
      this.incomingRW[0] = readEnd;
    }

    return true;
  }
}

registerProcessor('worker-processor', WorkerProcessor);
