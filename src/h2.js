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

 'use strict';

 const {
  ClientHttp2Session,
  ClientHttp2Stream,
  connect,
  constants,
  IncomingHttpHeaders,
  SecureClientSessionOptions,
} = require('http2');
const { Readable } = require('stream');

const debug = require('debug')('polyglot-http-client:h2');

const IDLE_SESSION_TIMEOUT = 5 * 60 * 1000; // 5m

const setupContext = (ctx) => {
  const { options: { h2: { idleSessionTimeout = IDLE_SESSION_TIMEOUT } = {} } } = ctx;
  ctx.h2 = { sessionCache: {} };
  ctx.h2.idleSessionTimeout = idleSessionTimeout;
}

const resetContext = async ({ h2 }) => {
  //Object.values(h2.sessionCache).forEach((session) => session.destroy());
  //return Promise.resolve();
  return Promise.all(Object.values(h2.sessionCache).map((session) => {
    return new Promise((resolve, reject) => session.close(resolve));
  }));
}

const createResponse = (headers, clientHttp2Stream) => {
  const statusCode = headers[':status'];
  delete headers[':status'];
  return {
    statusCode,
		httpVersion: '2.0',
		httpVersionMajor: 2,
		httpVersionMinor: 0,
    headers,
    readable: clientHttp2Stream
  };
}

const request = async (ctx, url, options) => {
  const { origin, pathname, search, hash } = url;
  const path = `${pathname || '/'}${search}${hash}`;

  const { options: { h2: ctxOpts }, ctxOptions, h2: { sessionCache }} = ctx;

  const opts = { ...options };
  const { method, headers = {}, socket, body } = opts;
  if (socket) {
    delete opts.socket;
  }
  if (headers.host) {
    headers[':authority'] = headers.host;
    delete headers.host;
  }

  // lookup session from session cache
  let session = sessionCache[origin];
  if (!session || session.closed) {
    // connect and setup new session
    // (connect options: https://nodejs.org/api/http2.html#http2_http2_connect_authority_options_listener)
    const connectOptions = ctxOpts || {};
    if (socket) {
      // reuse socket
      connectOptions.createConnection = (url, options) => {
        debug(`reusing socket ${url.hostname}`)
        return socket;
      }
    }
    session = connect(origin, connectOptions);
    session.setTimeout(IDLE_SESSION_TIMEOUT);
    session.on('origin', (origins) => {
      origins.forEach((origin) => {
        debug(`origin: ${origin}`);
      });
    });
    session.once('timeout', () => {
      debug(`session ${origin} timed out`);
      session.close();
    });
    session.once('close', () => {
      debug(`session ${origin} closed`);
      delete sessionCache[origin];
    });
    session.on('error', (err) => {
      debug(`session ${origin} encountered error: ${err}`);
      // TODO: propagate error
    });
    sessionCache[origin] = session;
  } else {
    // we have a cached session 
    if (socket) {
      // we have no use for the passed socket
      debug(`discarding redundant socket used for ALPN ${socket.host}`);
      socket.destroy();
    }
  }

  return new Promise((resolve, reject) => {
    const req = session.request({ ':method': method, ':path': path, ...headers });
    req.once('response', (headers, flags) => {
      resolve(createResponse(headers, req));
    });
    // send request body?
    if (body instanceof Readable) {
      body.pipe(req);
    } else if (body instanceof Buffer) {
      req.write(body);
    } else if (body) {
      req.write(body);
    }
    req.end();
  });
}

module.exports = { request, setupContext, resetContext };
