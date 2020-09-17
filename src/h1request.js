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

// TODO: custom agent options?
// TODO: configurable context option
const agentOptions = {}; 
http.customAgent = new http.Agent(agentOptions);
https.customAgent = new https.Agent(agentOptions);

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
  const { customAgent, request } = url.protocol === 'https:' ? https : http;
  const opts = { ...options, agent: customAgent };
  const { socket, body } = opts;
  if (socket) {
    // reuse socket
    delete opts.socket;
    opts.createConnection = (url, options) => socket;
  }

  return new Promise((resolve, reject) => {
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

module.exports = h1Request;
