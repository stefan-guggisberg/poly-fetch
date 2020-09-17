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

const { request } = require('./request');

const DEFAULT_CONTEXT_OPTIONS = { userAgent: 'polyglot-http-client', overwriteUserAgent: true };

class Context {
  constructor(options = {}) {
    // setup context
    const opts = { ...DEFAULT_CONTEXT_OPTIONS, ...options };
    this._ctx = context(opts);
  }

  /**
   * Returns the `polyglot-http-client` API.
   */
  api() {
    return {
      /**
       * Fetches a resource from the network. Returns a Promise which resolves once
       * the Response is available.
       */
      fetch: async (url, options) => this.fetch(url, options),

      /**
       * This function returns an object which looks like the global `polyglot-http-client` API,
       * i.e. it will have the functions `fetch`, `disconnectAll`, etc. and provide its
       * own isolated caches.
       *
       * @param {Object} options
       */
      context: (options = {}) => this.context(options),

      /**
       * Disconnect all open/pending sessions.
       */
      disconnectAll: async () => this.disconnectAll(),
    };
  }

  // eslint-disable-next-line class-methods-use-this
  context(options) {
    return new Context(options).api();
  }

  async fetch(url, options) {
    return request(this._ctx, url, options);
  }
}

module.exports = new Context().api();
