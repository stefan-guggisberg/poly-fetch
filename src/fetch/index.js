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

const { Readable } = require('stream');

const { Body } = require('./body');
const { Headers } = require('./headers');
const { Request } = require('./request');
const { Response } = require('./response');
const { FetchBaseError, FetchError, AbortError } = require('./errors');
const { AbortController, AbortSignal } = require('./abort');

// core abstraction layer
const { context } = require('../index');

const fetch = async (ctx, url, options = {}) => {
  const { request } = ctx.context;

  const req = new Request(url, options);

  // TODO: implement abort logic
  const { signal } = req;
/*
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
    }) => new Response(readable, { status: statusCode, statusText, headers, httpVersion }));
*/
  
  let resp;
  try {
    // call underlying protocol agnostic abstraction
    resp = await request(req.url, {
      ...options,
      method: req.method,
      headers: req.headers.plain(),
      body: req.body,
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw err;
    }
    // wrap system error in a FetchError instance
    throw new FetchError(err.message, 'system', err);
  }

  const {
    statusCode,
    statusText,
    httpVersion,
    headers,
    readable
  } = resp;

  // redirect?
  // https://fetch.spec.whatwg.org/#concept-http-fetch step 6
  if ([301, 302, 303, 307, 308].includes(statusCode)) {
    // https://fetch.spec.whatwg.org/#concept-http-fetch step 6.2
    const location = headers['location'];
    // https://fetch.spec.whatwg.org/#concept-http-fetch step 6.3
    const locationURL = location === null ? null : new URL(location, req.url);
    // https://fetch.spec.whatwg.org/#concept-http-fetch step 6.5
    switch (req.redirect) {
      case 'error':
        // TODO: cleanup?
        throw new FetchError(`uri requested responds with a redirect, redirect mode is set to 'error': ${req.url}`, 'no-redirect');
      case 'manual':
        // extension: set location header to the resolved url
        if (locationURL !== null) {
          headers['location'] = locationURL;
        }
        break;
      case 'follow': {
        // https://fetch.spec.whatwg.org/#http-redirect-fetch step 2
        if (locationURL === null) {
          break;
        }

        // https://fetch.spec.whatwg.org/#http-redirect-fetch step 5
        if (req.counter >= req.follow) {
          // TODO: cleanup?
          throw new FetchError(`maximum redirect reached at: ${req.url}`, 'max-redirect');
        }

        // https://fetch.spec.whatwg.org/#http-redirect-fetch step 6 (counter increment)
        // Create a new Request object.
        const requestOptions = {
          headers: new Headers(req.headers),
          follow: req.follow,
          counter: req.counter + 1,
          method: req.method,
          body: req.body,
          signal: req.signal,
        };

        // https://fetch.spec.whatwg.org/#http-redirect-fetch step 9
        if (statusCode !== 303 && req.body && options.body instanceof Readable) {
          // TODO: cleanup?
          throw new FetchError('Cannot follow redirect with body being a readable stream', 'unsupported-redirect');
        }

        // https://fetch.spec.whatwg.org/#http-redirect-fetch step 11
        if (statusCode === 303 || ((statusCode === 301 || statusCode === 302) && req.method === 'POST')) {
          requestOptions.method = 'GET';
          requestOptions.body = undefined;
          requestOptions.headers.delete('content-length');
        }

        // https://fetch.spec.whatwg.org/#http-redirect-fetch step 15
        return fetch(ctx, new Request(locationURL, requestOptions), options.compress === undefined ? {} : { compress: options.compress });
      }

      default:
        // fall through
    }
  }

  return new Response(
    readable,
    {
      status: statusCode,
      statusText,
      headers,
      httpVersion,
      counter: req.counter,
    },
  );
}

class FetchContext {

  constructor(options) {
    // setup context
    this.options = { ...(options || {}) };
    if (this.options.h2 && this.options.h2.pushHandler) {
      // HTTP/2 push handler: need to wrap the response
      const handler = this.options.h2.pushHandler;
      this.options.h2.pushHandler = (url, response) => {
        const { 
          statusCode,
          statusText,
          httpVersion,
          headers,
          readable
        } = response;
        handler(url, new Response(readable, { status: statusCode, statusText, headers, httpVersion }));
      }
    }
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

      FetchBaseError,
      FetchError,
      AbortError,

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
