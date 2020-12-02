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
  // ClientHttp2Session,
  // ClientHttp2Stream,
  connect,
  constants,
  // IncomingHttpHeaders,
  // SecureClientSessionOptions,
} = require('http2');
const { Readable } = require('stream');

const debug = require('debug')('polyglot-fetch:h2');

const { RequestAbortedError } = require('./errors');
const { decodeStream } = require('../common/utils');

const { NGHTTP2_CANCEL } = constants;

const SESSION_IDLE_TIMEOUT = 5 * 60 * 1000; // 5m
const PUSHED_STREAM_IDLE_TIMEOUT = 5000; // 5s

const setupContext = (ctx) => {
  ctx.h2 = { sessionCache: {} };
};

// eslint-disable-next-line arrow-body-style
const resetContext = async ({ h2 }) => {
  return Promise.all(Object.values(h2.sessionCache).map(
    // TODO: if there are pushed streams which aren't consumed yet session.close() will hang,
    // i.e. the callback won't be called. Use session.destroy() ?
    (session) => new Promise((resolve) => session.close(resolve)),
  ));
  /*
  // we're seeing occasional segfaults when destroying the session ...
  const sessions = Object.values(h2.sessionCache);
  for (const session of sessions) {
    session.destroy();
  }
  */
};

const createResponse = (headers, clientHttp2Stream, onError = () => {}) => {
  const hdrs = { ...headers };
  const statusCode = hdrs[':status'];
  delete hdrs[':status'];

  return {
    statusCode,
    statusText: '',
    httpVersion: '2.0',
    httpVersionMajor: 2,
    httpVersionMinor: 0,
    headers: hdrs, // header names are always lower-cased
    readable: decodeStream(statusCode, headers, clientHttp2Stream, onError),
  };
};

const handlePush = (ctx, origin, pushedStream, requestHeaders, flags) => {
  const {
    options: {
      h2: {
        pushPromiseHandler,
        pushHandler,
        pushedStreamIdleTimeout = PUSHED_STREAM_IDLE_TIMEOUT,
      },
    },
  } = ctx;

  const path = requestHeaders[':path'];
  const url = `${origin}${path}`;

  debug(`received PUSH_PROMISE: ${url}, stream #${pushedStream.id}, headers: ${JSON.stringify(requestHeaders)}, flags: ${flags}`);
  if (pushPromiseHandler) {
    const rejectPush = () => {
      pushedStream.close(NGHTTP2_CANCEL);
    };
    // give handler opportunity to reject the push
    pushPromiseHandler(url, rejectPush);
  }
  pushedStream.on('push', (responseHeaders, flgs) => {
    // received headers for the pushed streamn
    // similar to 'response' event on ClientHttp2Stream
    debug(`received push headers for ${origin}${path}, stream #${pushedStream.id}, headers: ${JSON.stringify(responseHeaders)}, flags: ${flgs}`);

    // set timeout to automatically discard pushed streams that aren't consumed for some time
    pushedStream.setTimeout(pushedStreamIdleTimeout, () => {
      debug(`closing pushed stream #${pushedStream.id} after ${pushedStreamIdleTimeout} ms of inactivity`);
      pushedStream.close(NGHTTP2_CANCEL);
    });

    if (pushHandler) {
      pushHandler(url, createResponse(responseHeaders, pushedStream));
    }
  });
  // log stream errors
  pushedStream.on('aborted', () => {
    debug(`pushed stream #${pushedStream.id} aborted`);
  });
  pushedStream.on('error', (err) => {
    debug(`pushed stream #${pushedStream.id} encountered error: ${err}`);
  });
  pushedStream.on('frameError', (type, code, id) => {
    debug(`pushed stream #${pushedStream.id} encountered frameError: type: ${type}, code: ${code}, id: ${id}`);
  });
};

const request = async (ctx, url, options) => {
  const {
    origin, pathname, search, hash,
  } = url;
  const path = `${pathname || '/'}${search}${hash}`;

  const {
    options: {
      h2: ctxOpts = {},
    },
    h2: {
      sessionCache,
    },
  } = ctx;
  const {
    idleSessionTimeout = SESSION_IDLE_TIMEOUT,
    pushPromiseHandler,
    pushHandler,
  } = ctxOpts;

  const opts = { ...options };
  const {
    method,
    headers = {},
    socket,
    body,
  } = opts;
  if (socket) {
    delete opts.socket;
  }
  if (headers.host) {
    headers[':authority'] = headers.host;
    delete headers.host;
  }

  return new Promise((resolve, reject) => {
    // lookup session from session cache
    let session = sessionCache[origin];
    if (!session || session.closed) {
      // connect and setup new session
      // (connect options: https://nodejs.org/api/http2.html#http2_http2_connect_authority_options_listener)
      const connectOptions = ctxOpts;
      if (socket) {
        // reuse socket
        connectOptions.createConnection = (/* url, options */) => {
          debug(`reusing socket #${socket.id} (${socket.servername})`);
          return socket;
        };
      }

      const enablePush = !!(pushPromiseHandler || pushHandler);
      session = connect(origin, { ...connectOptions, settings: { enablePush } });
      session.setTimeout(idleSessionTimeout, () => {
        debug(`closing session ${origin} after ${idleSessionTimeout} ms of inactivity`);
        session.close();
      });
      session.once('connect', () => {
        debug(`session ${origin} established`);
      });
      session.once('localSettings', (settings) => {
        debug(`session ${origin} setttings: ${JSON.stringify(settings)}`);
      });
      session.once('close', () => {
        debug(`session ${origin} closed`);
        delete sessionCache[origin];
      });
      session.once('error', (err) => {
        debug(`session ${origin} encountered error: ${err}`);
        reject(err); // TODO: correct?
      });
      session.on('frameError', (type, code, id) => {
        debug(`session ${origin} encountered frameError: type: ${type}, code: ${code}, id: ${id}`);
      });
      session.once('goaway', (errorCode, lastStreamID, opaqueData) => {
        debug(`session ${origin} received GOAWAY frame: errorCode: ${errorCode}, lastStreamID: ${lastStreamID}, opaqueData: ${opaqueData ? opaqueData.toString() : undefined}`);
      });
      session.on('stream', (stream, hdrs, flags) => {
        handlePush(ctx, origin, stream, hdrs, flags);
      });
      sessionCache[origin] = session;
    } else {
      // we have a cached session
      // eslint-disable-next-line no-lonely-if
      if (socket && socket.id !== session.socket.id) {
        // we have no use for the passed socket
        debug(`discarding redundant socket used for ALPN: #${socket.id} ${socket.host}`);
        socket.destroy();
      }
    }

    debug(`${method} ${url.host}${path}`);
    let req;

    // intercept abort signal in order to cancel request
    const { signal } = opts;
    const onAbortSignal = () => {
      signal.removeEventListener('abort', onAbortSignal);
      reject(new RequestAbortedError());
      if (req) {
        req.close(NGHTTP2_CANCEL);
      }
    };
    if (signal) {
      if (signal.aborted) {
        reject(new RequestAbortedError());
        return;
      }
      signal.addEventListener('abort', onAbortSignal);
    }

    req = session.request({ ':method': method, ':path': path, ...headers });
    req.once('response', (hdrs) => {
      if (signal) {
        signal.removeEventListener('abort', onAbortSignal);
      }
      resolve(createResponse(hdrs, req, reject));
    });
    // /*
    req.once('error', (err) => {
      // error occured during the request
      if (signal) {
        signal.removeEventListener('abort', onAbortSignal);
      }
      // if (!req.aborted) {
      if (req.rstCode !== NGHTTP2_CANCEL) {
        debug(`${opts.method} ${url.href} failed with: ${err.message}`);
        req.close(NGHTTP2_CANCEL); // neccessary?
        reject(err);
      }
    });
    // */
    req.on('push', (hdrs, flags) => {
      debug(`received 'push' event: headers: ${JSON.stringify(hdrs)}, flags: ${flags}`);
    });
    // send request body?
    if (body instanceof Readable) {
      body.pipe(req);
    } else {
      if (body) {
        req.write(body);
      }
      req.end();
    }
  });
};

module.exports = { request, setupContext, resetContext };
