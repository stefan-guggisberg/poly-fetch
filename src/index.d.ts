/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

export enum ALPNProtocol {
  ALPN_HTTP2 = 'h2',
  ALPN_HTTP2C = 'h2c',
  ALPN_HTTP1_1 = 'http/1.1',
  ALPN_HTTP1_0 = 'http/1.0',
}
export interface Http1Options {
  /**
   * Keep sockets around in a pool to be used by other requests in the future.
   * @default false
   */
  keepAlive?: boolean;
  /**
   * When using HTTP KeepAlive, how often to send TCP KeepAlive packets over sockets being kept alive.
   * Only relevant if keepAlive is set to true.
   * @default 1000
   */
  keepAliveMsecs?: number;
  /**
   * Maximum number of sockets to allow per host.
   * @default Infinity
   */
  maxSockets?: number;
  /**
   * Maximum number of sockets allowed for all hosts in total. Each request will use a new socket until the maximum is reached.
   * @default Infinity
   */
  maxTotalSockets?: number;
  /**
   * Maximum number of sockets to leave open in a free state. Only relevant if keepAlive is set to true.
   * @default 256
   */
  maxFreeSockets?: number;
  /**
   * Socket timeout in milliseconds. This will set the timeout when the socket is connected.
   */
  timeout?: number;
  /**
   * Scheduling strategy to apply when picking the next free socket to use.
   * @default 'fifo'
   */
  scheduling?: 'fifo' | 'lifo';
  /**
   * (HTTPS only)
   * If not false, the server certificate is verified against the list of supplied CAs. An 'error' event is emitted if verification fails; err.code contains the OpenSSL error code.
   * @default true
   */
  rejectUnauthorized?: boolean;
  /**
   * (HTTPS only)
   * Maximum number of TLS cached sessions. Use 0 to disable TLS session caching.
   * @default 100
   */
  maxCachedSessions?: number;
}

export interface Response {
  statusCode: number;
  httpVersion: string;
  httpVersionMajor: number;
  httpVersionMinor: number;
  headers: NodeJS.Dict<string | string[]>;
  readable: NodeJS.ReadableStream;
};

export type PushPromiseHandler = (
  url: string,
  headers: NodeJS.Dict<string | string[]>,
	reject: () => void
) => void;

export type PushHandler = (
  url: string,
  headers: NodeJS.Dict<string | string[]>,
  response: Response
) => void;

export interface Http2Options {
  /**
   * Max idle time in milliseconds after which a session will be automatically closed. 
   * @default 5 * 60 * 1000
   */
  idleSessionTimeout?: number;
  pushPromiseHandler?: PushPromiseHandler;
  pushHandler?: PushHandler;
  /**
   * Max idle time in milliseconds after which a pushed stream will be automatically closed. 
   * @default 5000
   */
  pushedStreamIdleTimeout?: number;
};

export interface ContextOptions {
  /**
   * Value of `user-agent` request header
   * @default 'polyglot-fetch/1.0.0'
   */
  userAgent?: string;
  /**
   * The protocols to be negotiated, in order of preference
   * @default [ALPN_HTTP2, ALPN_HTTP1_1, ALPN_HTTP1_0]
   */
  alpnProtocols?: ReadonlyArray< ALPNProtocol >;
  /**
   * How long (in milliseconds) should ALPN information be cached for a given host?
   * @default 60 * 60 * 1000
   */
  alpnCacheTTL?: number;
  /**
   * Maximum number of ALPN cache entries
   * @default 100
   */
  alpnCacheSize?: number;
  h1?: Http1Options;
  h2?: Http2Options;
};

type AbortSignal = {
	readonly aborted: boolean;

	addEventListener(type: 'abort', listener: (this: AbortSignal) => void): void;
	removeEventListener(type: 'abort', listener: (this: AbortSignal) => void): void;
};

type HeadersInit = Headers | Record<string, string> | Iterable<readonly [string, string]> | Iterable<Iterable<string>>;

export interface RequestOptions {
  /**
   * A string specifying the HTTP request method.
   * @default 'GET'
   */
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'PATCH';
	/**
	 * A Headers object, an object literal, or an array of two-item arrays to set request's headers.
   * @default {}
	 */
  headers?: Headers | Record<string, string> | Iterable<readonly [string, string]> | Iterable<Iterable<string>>;
	/**
	 * The request's body.
   * @default null
	 */
	body?: Readable | Buffer | String | Record<string, string> | URLSearchParams | FormData;
	/**
	 * A string indicating whether request follows redirects, results in an error upon encountering a redirect, or returns the redirect (in an opaque fashion). Sets request's redirect.
   * @default 'follow'
	 */
	redirect?: 'follow' | 'manual' | 'error';
	/**
	 * An AbortSignal to set request's signal.
   * @default null
	 */
  signal?: AbortSignal;

  // extensions
  /**
   * A boolean specifying support of gzip/deflate/brotli content encoding.
   * @default true
   */
  compress?: boolean;
  /**
   * Maximum number of redirects to follow, 0 to not follow redirect.
   * @default 20
   */
  follow?: number;
};