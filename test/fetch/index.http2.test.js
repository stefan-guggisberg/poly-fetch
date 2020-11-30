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

/* eslint-env mocha */

'use strict';

const assert = require('assert');
const crypto = require('crypto');

const {
  fetch,
  context,
  reset,
} = require('../../src/fetch');

describe('HTTP/2-specific Fetch Tests', () => {
  afterEach(async () => {
    await reset();
  });

  it('fetch supports HTTP/2 server push', async () => {
    let customCtx;
    const pushedResource = new Promise((resolve) => {
      const pushHandler = (url, response) => {
        resolve({ url, response });
      };
      customCtx = context({ h2: { pushHandler } });
    });

    try {
      // see https://nghttp2.org/blog/2015/02/10/nghttp2-dot-org-enabled-http2-server-push/
      const resp = await customCtx.fetch('https://nghttp2.org');
      assert.strictEqual(resp.httpVersion, '2.0');
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(resp.headers.get('content-type'), 'text/html');
      let buf = await resp.buffer();
      assert.strictEqual(+resp.headers.get('content-length'), buf.length);
      // pushed resource
      const { url, response } = await pushedResource;
      assert.strictEqual(url, 'https://nghttp2.org/stylesheets/screen.css');
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('content-type'), 'text/css');
      buf = await response.buffer();
      assert.strictEqual(+response.headers.get('content-length'), buf.length);
    } finally {
      await customCtx.reset();
    }
  });

  it('concurrent HTTP/2 requests to same origin', async () => {
    const N = 500; // # of parallel requests
    const TEST_URL = 'https://httpbin.org/bytes/'; // HTTP2
    // generete array of 'randomized' urls
    const urls = Array.from({ length: N }, () => Math.floor(Math.random() * N)).map((num) => `${TEST_URL}${num}`);
    // send requests
    const responses = await Promise.all(urls.map((url) => fetch(url)));
    // read bodies
    await Promise.all(responses.map((resp) => resp.text()));
    const ok = responses.filter((res) => res.ok && res.httpVersion === '2.0');
    assert.strictEqual(ok.length, N);
  });

  it('handles concurrent HTTP/2 requests to subdomains sharing the same IP address (using wildcard SAN cert)', async () => {
    // https://github.com/adobe/helix-fetch/issues/52
    const doFetch = async (url) => {
      const res = await fetch(url);
      assert.strictEqual(res.httpVersion, '2.0');
      const data = await res.text();
      return crypto.createHash('md5').update(data).digest().toString('hex');
    };

    const results = await Promise.all([
      doFetch('https://en.wikipedia.org/wiki/42'),
      doFetch('https://fr.wikipedia.org/wiki/42'),
      doFetch('https://it.wikipedia.org/wiki/42'),
    ]);

    assert.strictEqual(results.length, 3);
    assert.notStrictEqual(results[0], results[1]);
    assert.notStrictEqual(results[0], results[2]);
    assert.notStrictEqual(results[1], results[2]);
  });
});
