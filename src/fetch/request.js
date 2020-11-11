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
const { URLSearchParams } = require('url');

const { AbortSignal } = require('./abort');
const { Body, cloneStream } = require('./body');
const { Headers } = require('./headers');

const { isPlainObject } = require('../utils');

const INTERNALS = Symbol('Request internals');

/**
 * Request class
 *
 * @see https://fetch.spec.whatwg.org/#request-class
 */
class Request extends Body {
  /**
   * Constructs a new Request instance
   * 
   * @constructor
   * @param {Request|String} input
   * @param {Object} [init={}]
   */
  constructor(input, init = {}) {
    // normalize input
    const req = input instanceof Request ? input : null;
    const parsedURL = req ? new URL(req.url) : new URL(input);

    let method = init.method || (req && req.method) || 'GET';
    method = method.toUpperCase();

		// eslint-disable-next-line no-eq-null, eqeqeq
    if ((init.body != null // neither null nor undefined 
      || (req && req.body !== null))
      && ['GET', 'HEAD'].includes(method)) {
      throw new TypeError('Request with GET/HEAD method cannot have body');
    }

    let body = init.body || (req && req.body ? cloneStream(req) : null);
    const headers = new Headers(init.headers || (req && req.headers) || {});

    if (body !== null && !headers.has('content-type')) {
      if (isPlainObject(body)) {
        // extension: support plain js object body (JSON serialization)
        body = JSON.stringify(body);
        headers.append('content-type', 'application/json');
      } else {
        const contentType = guessContentType(body);
        if (contentType) {
          headers.append('content-type', contentType);
        }
      }
    }

    // call Body constructor
    super(body);

    let signal = req ? req.signal : null;
		if ('signal' in init) {
      signal = init.signal;
    }
1
    if (signal && !(signal instanceof AbortSignal)) {
      throw new TypeError('signal needs to be an instanceof AbortSignal');
    }

    this[INTERNALS] = {
      init: { ...init },
      method,
      redirect: init.redirect || (req && req.redirect) || 'follow',
      headers,
      parsedURL,
      signal
    };

    // extension options
    this.counter = init.counter || input.counter || 0;
  }

  get method() {
    return this[INTERNALS].method;
  }

  get url() {
    return this[INTERNALS].parsedURL.toString();
  }

  get headers() {
    return this[INTERNALS].headers;
  }

  get redirect() {
    return this[INTERNALS].redirect;
  }

  get signal() {
    return this[INTERNALS].signal;
  }

  /**
   * Clone this request
   *
   * @return {Request}
   */
  clone() {
    return new Request(this);
  }

  get [Symbol.toStringTag]() {
    return this.constructor.name;
  }
}

Object.defineProperties(Request.prototype, {
  method: { enumerable: true },
  url: { enumerable: true },
  headers: { enumerable: true },
  redirect: { enumerable: true },
  clone: { enumerable: true },
  signal: { enumerable: true }
});

/**
 * Guesses the `Content-Type` based on the type of body.
 * 
 * @param {Readable|Buffer|String|URLSearchParams} body Any options.body input
 * @returns {string|null}
 */
const guessContentType = (body) => {
  if (body === null) {
    return null;
  }

  if (typeof body === 'string') {
    return 'text/plain;charset=UTF-8';
  }

  if (body instanceof URLSearchParams) {
    return 'application/x-www-form-urlencoded;charset=UTF-8';
  }

  if (Buffer.isBuffer(body)) {
    return null;
  }

  if (body instanceof Readable) {
    return null;
  }

  // fallback: body is coerced to string
  return 'text/plain;charset=UTF-8';
};

module.exports = {
  Request
};
