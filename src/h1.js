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

const http = require('http');
const https = require('https');
const { Readable } = require('stream');

const debug = require('debug')('polyglot-http-client:h1');

const getAgent = (ctx, protocol) => {
  const { h1, options: { h1: opts} } = ctx;

  if (protocol === 'https:') {
    // secure http
    if (h1.httpsAgent) {
      return h1.httpsAgent;
    }
    if (opts) {
      return h1.httpsAgent = new https.Agent(opts);
    }
    // use default (global) agent
    return undefined;
  } else {
    // plain http
    if (h1.httpAgent) {
      return h1.httpAgent;
    }
    if (opts) {
      return h1.httpAgent = new http.Agent(opts);
    }
    // use default (global) agent
    return undefined;
  }
}

const setupContext = (ctx) => {
  const { options: { h1: opts } } = ctx;
  ctx.h1 = {};
  // custom agents will be lazily instantiated
}

const resetContext = async ({ h1 }) => {
  if (h1.httpAgent) {
    h1.httpAgent.destroy();
    delete h1.httpAgent;
  }  
  if (h1.httpsAgent) {
    h1.httpsAgent.destroy();
    delete h1.httpsAgent;
  }  
}

const createResponse = (incomingMessage) => {
  const {
    statusCode,
    httpVersion,
    httpVersionMajor,
    httpVersionMinor,
    headers
  } = incomingMessage;
  return {
    statusCode,
    httpVersion,
    httpVersionMajor,
    httpVersionMinor,
    headers,
    readable: incomingMessage
  };
}

const h1Request = async (ctx, url, options) => {
  const { request } = url.protocol === 'https:' ? https : http;
  const agent = getAgent(ctx, url.protocol);
  const opts = { ...options, agent };
  const { socket, body } = opts;
  if (socket) {
    delete opts.socket;
    // reuse socket for actual request
    if (agent) {
      // if there's an agent we need to override the agent's createConnection
      opts.agent = new Proxy(agent, {
        get: (target, property) => {
          if (property === 'createConnection') {
            return (options, cb) => {
              debug(`agent reusing socket #${socket.id} ${socket.host}`)
              cb(null, socket);
            };
          } else {
            return target[property];
          }
        }
      });
    } else {
      // no agent, provide createConntection in options 
      opts.createConnection = (url, options) => {
        debug(`reusing socket  #${socket.id} ${socket.host}`)
        return socket;
      }
    }
  }

  return new Promise((resolve, reject) => {
    debug(`${opts.method} ${url.href}`);
    const req = request(url, opts, (res) => {
      resolve(createResponse(res));
    });
    req.on('error', reject);
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

module.exports = { request: h1Request, setupContext, resetContext };
