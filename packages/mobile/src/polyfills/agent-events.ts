import "partysocket/event-target-polyfill";

import {
  ReadableStream as PolyfillReadableStream,
  TransformStream as PolyfillTransformStream,
  WritableStream as PolyfillWritableStream,
} from "web-streams-polyfill";

type MessageEventInitLike = EventInit & {
  data?: unknown;
  origin?: string;
  lastEventId?: string;
  source?: MessageEventSource | null;
  ports?: MessagePort[];
};

class BaindarMessageEvent<T = unknown> extends Event implements MessageEvent<T> {
  readonly data: T;
  readonly origin: string;
  readonly lastEventId: string;
  readonly source: MessageEventSource | null;
  readonly ports: readonly MessagePort[];

  constructor(type: string, eventInitDict: MessageEventInitLike = {}) {
    super(type, eventInitDict);
    this.data = eventInitDict.data as T;
    this.origin = eventInitDict.origin ?? "";
    this.lastEventId = eventInitDict.lastEventId ?? "";
    this.source = eventInitDict.source ?? null;
    this.ports = eventInitDict.ports ?? [];
  }

  initMessageEvent(): void {}
}

const globals = globalThis as typeof globalThis & {
  crypto?: Crypto;
  MessageEvent?: typeof MessageEvent;
  structuredClone?: typeof structuredClone;
};
const mutableGlobals = globalThis as Record<string, unknown>;

globals.crypto ??= {} as Crypto;
globals.crypto.getRandomValues ??= getRandomValues;
globals.crypto.randomUUID ??= randomUUID;
globals.MessageEvent ??= BaindarMessageEvent as typeof MessageEvent;
globals.structuredClone ??= structuredCloneFallback;
mutableGlobals.ReadableStream ??= PolyfillReadableStream;
mutableGlobals.TransformStream ??= PolyfillTransformStream;
mutableGlobals.WritableStream ??= PolyfillWritableStream;

function getRandomValues<T extends ArrayBufferView | null>(array: T): T {
  if (array === null) return array;
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return array;
}

function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (digit) =>
    (
      Number(digit) ^
      (getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(digit) / 4)))
    ).toString(16),
  ) as `${string}-${string}-${string}-${string}-${string}`;
}

function structuredCloneFallback<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
