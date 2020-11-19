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

const { Body } = require('./body');
const { Headers } = require('./headers');
const { Request } = require('./request');
const { Response } = require('./response');
const { AbortController, AbortSignal } = require('./abort');

// core abstraction layer
const { context } = require('../index');

const fetch = async (ctx, url, options) => {
  const { request } = ctx.context;

  const req = new Request(url, options);

  const { signal } = req;

  return request(req.url, {
    ...options,
    method: req.method,
    headers: req.headers.plain(),
    body: req.body,
  })
    .then(({ 
      statusCode,
      statusText,
      httpVersion,
      headers,
      readable
    }) => new Response(readable, { statusCode, statusText, headers, httpVersion }));
 }

class FetchContext {

  constructor(options) {
    // setup context
    this.options = { ...(options || {}) };
    this.context = context(this.options);
  }

  /**
   * Returns the Fetch API.
   */
  api() {
    return {
      /**
       * Fetches a resource from the network. Returns a Promise which resolves once
       * the response is available.
       */
      fetch: async (url, options) => this.fetch(url, options),

      Body,
      Headers,
      Request,
      Response,
      AbortController,
      AbortSignal,

      // extensions

      /**
       * This function returns an object which looks like the public API,
       * i.e. it will have the functions `fetch`, `context`, `reset`, etc. and provide its
       * own isolated caches and specific behavior according to `options`.
       *
       * @param {Object} options
       */
      context: (options = {}) => new FetchContext(options).api(),

      /**
       * Resets the current context, i.e. disconnects all open/pending sessions, clears caches etc..
       */
      reset: async () => this.context.reset(),

      ALPN_HTTP2: this.context.ALPN_HTTP2,
      ALPN_HTTP2C: this.context.ALPN_HTTP2C,
      ALPN_HTTP1_1: this.context.ALPN_HTTP1_1,
      ALPN_HTTP1_0: this.context.ALPN_HTTP1_0,
    };
  }

  async fetch(url, options) {
    return fetch(this, url, options);
  }
}

module.exports = new FetchContext().api();
