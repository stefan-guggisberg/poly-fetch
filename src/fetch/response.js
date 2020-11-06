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

const INTERNALS = Symbol('Response internals');

/**
 * Response class
 *
 * @see https://fetch.spec.whatwg.org/#response-class
 */
class Response extends Body {
  /**
   * Constructs a new Response instance
   * 
   * @constructor
   * @param {Readable} [body=null] readable stream
   * @param {Object} [init={}]
   */
  constructor(body = null, init = {}) {
    super(body);

    const headers = new Headers(init.headers);

    this[INTERNALS] = {
      url: init.url,
      status: init.status || 200,
      statusText: init.statusText || '',
      headers,
			counter: init.counter,
    };
  }

  get url() {
		return this[INTERNALS].url || '';
	}

	get status() {
		return this[INTERNALS].status;
	}

	get statusText() {
		return this[INTERNALS].statusText;
	}

  get ok() {
		return this[INTERNALS].status >= 200 && this[INTERNALS].status < 300;
	}

	get redirected() {
		return this[INTERNALS].counter > 0;
	}

	get headers() {
		return this[INTERNALS].headers;
	}
}

module.exports = {
  Response
};
