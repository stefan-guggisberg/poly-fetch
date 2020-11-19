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
const stream = require('stream');
const { URLSearchParams } = require('url');
const { promisify } = require('util');

const isStream = require('is-stream');
const nock = require('nock');
const { WritableStreamBuffer } = require('stream-buffers');

const { fetch, context, reset, ALPN_HTTP1_1 } = require('../../src/fetch');

const WOKEUP = 'woke up!';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms, WOKEUP));

describe('Fetch Tests', () => {

  afterEach(async () => {
    await reset();
  });

  it('fetch supports HTTP/1(.1)', async () => {
    const resp = await fetch('http://httpbin.org/status/200');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.httpVersion, '1.1');
  });

  it('fetch supports HTTP/2', async () => {
    const resp = await fetch('https://www.nghttp2.org/httpbin/status/200');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.httpVersion, '2.0');
  });

  it('fetch supports json response body', async () => {
    const resp = await fetch('https://httpbin.org/json');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), 'application/json');
    const json = await resp.json();
    assert(json !== null && typeof json === 'object');
  });

  it('fetch supports binary response body (ArrayBuffer)', async () => {
    const dataLen = 64 * 1024; // httpbin.org/stream-bytes/{n} has a limit of 100kb ...
    const contentType = 'application/octet-stream';
    const resp = await fetch(`https://httpbin.org/stream-bytes/${dataLen}`, {
      headers: { accept: contentType },
    });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), contentType);
    const buffer = await resp.arrayBuffer();
    assert(buffer !== null && buffer instanceof ArrayBuffer);
    assert.strictEqual(buffer.byteLength, dataLen);
  });

  it('fetch supports binary response body (Stream)', async () => {
    const dataLen = 64 * 1024; // httpbin.org/stream-bytes/{n} has a limit of 100kb ...
    const contentType = 'application/octet-stream';
    const resp = await fetch(`https://httpbin.org/stream-bytes/${dataLen}`, {
      headers: { accept: contentType },
    });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), contentType);
    const imageStream = resp.body;
    assert(isStream.readable(imageStream));

    const finished = promisify(stream.finished);
    const out = new WritableStreamBuffer();
    imageStream.pipe(out);
    await finished(out);
    assert.strictEqual(out.getContents().length, dataLen);
  });

  it('fetch supports json POST', async () => {
    const method = 'POST';
    const body = { foo: 'bar' };
    const resp = await fetch('https://httpbin.org/post', { method, body });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), 'application/json');
    const jsonResponseBody = await resp.json();
    assert(jsonResponseBody !== null && typeof jsonResponseBody === 'object');
    assert.deepStrictEqual(jsonResponseBody.json, body);
  });

  it('fetch sanitizes lowercase method names', async () => {
    const method = 'post';
    const body = { foo: 'bar' };
    const resp = await fetch('https://httpbin.org/post', { method, body });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), 'application/json');
    const jsonResponseBody = await resp.json();
    assert(jsonResponseBody !== null && typeof jsonResponseBody === 'object');
    assert.deepStrictEqual(jsonResponseBody.json, body);
  });

  it('fetch rejects on non-string method option', async () => {
    assert.rejects(() => fetch('http://httpbin.org/status/200', { method: true }));
  });

  it.skip('fetch supports HTTP/2 server push', async function test() {
    this.timeout(5000);

    // returns a promise which resolves with the url of the pushed resource
    const receivedPush = () => new Promise((resolve) => {
      const handler = (url) => {
        offPush(handler);
        resolve(url);
      };
      onPush(handler);
    });

    const [resp, url] = await Promise.all([
      // see https://nghttp2.org/blog/2015/02/10/nghttp2-dot-org-enabled-http2-server-push/
      fetch('https://nghttp2.org'),
      // resolves with either WOKEUP or the url of the pushed resource
      Promise.race([sleep(2000), receivedPush()]),
    ]);
    assert.strictEqual(resp.httpVersion, '2.0');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), 'text/html');
    assert.strictEqual(resp.headers.get('content-length'), (await resp.text()).length);
    assert.notEqual(url, WOKEUP);

    // check cache for pushed resource (stylesheets/screen.css)
    nock.disableNetConnect();
    try {
      const pushedResp = await fetch(url);
      assert.strictEqual(pushedresp.httpVersion, '2.0');
      assert.strictEqual(pushedResp.status, 200);
      assert(pushedResp.fromCache);
    } finally {
      nock.cleanAll();
      nock.enableNetConnect();
    }
  });

  it.skip('timeoutSignal works (slow response)', async function test() {
    this.timeout(5000);
    const ts0 = Date.now();
    try {
      // the server responds with a 2 second delay, the timeout is set to 1 second.
      await fetch('https://httpbin.org/delay/2', { cache: 'no-store', signal: timeoutSignal(1000) });
      assert.fail();
    } catch (err) {
      assert(err instanceof AbortError);
    }
    const ts1 = Date.now();
    assert((ts1 - ts0) < 1000 * 1.1);
  });

  it.skip('timeoutSignal works (dripping response)', async function test() {
    this.timeout(10000);

    const DRIPPING_DURATION = 5; // seconds
    const FETCH_TIMEOUT = 3000; // ms
    const TEST_URL = `https://httpbin.org/drip?duration=${DRIPPING_DURATION}&numbytes=10&code=200&delay=0`;

    const ts0 = Date.now();
    try {
      const res = await fetch(TEST_URL, { cache: 'no-store', signal: timeoutSignal(FETCH_TIMEOUT) });
      await res.buffer();
      assert.fail();
    } catch (err) {
      assert(err instanceof AbortError);
    }
    const ts1 = Date.now();
    assert((ts1 - ts0) < FETCH_TIMEOUT * 1.1);
  });

  it.skip('AbortController works', async function test() {
    this.timeout(5000);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 1000);
    const { signal } = controller;

    const ts0 = Date.now();
    try {
      // the server responds with a 2 second delay, fetch is aborted after 1 second.
      await fetch('https://httpbin.org/delay/2', { cache: 'no-store', signal });
      assert.fail();
    } catch (err) {
      assert(err instanceof AbortError);
    }
    const ts1 = Date.now();
    assert((ts1 - ts0) < 1000 * 1.1);
  });

  it('creating custom fetch context works', async () => {
    const ctx = context();
    const resp = await ctx.fetch('https://httpbin.org/status/200');
    assert.strictEqual(resp.status, 200);
    await ctx.reset();
  });

  it('overriding user-agent works', async () => {
    const customUserAgent = 'custom-fetch';
    const ctx = context({
      userAgent: customUserAgent,
      overwriteUserAgent: true,
    });
    const resp = await ctx.fetch('https://httpbin.org/user-agent');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), 'application/json');
    const json = await resp.json();
    assert.strictEqual(json['user-agent'], customUserAgent);
    await ctx.reset();
  });

  it('forcing HTTP/1(.1) works', async function test() {
    this.timeout(5000);
    // endpoint supporting http2 & http1
    const url = 'https://www.nghttp2.org/httpbin/status/200';
    // default context defaults to http2
    let resp = await fetch(url);
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.httpVersion, '2.0');

    // custom context forces http1
    const ctx = context({
      alpnProtocols: [ ALPN_HTTP1_1 ],
    });
    resp = await ctx.fetch(url);
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.httpVersion, '1.1');
    await ctx.reset();
  });

  it('headers.plain() works', async () => {
    const resp = await fetch('https://httpbin.org/put', {
      method: 'PUT',
      body: JSON.stringify({ foo: 'bar' }),
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
    });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.plain()['content-type'], 'application/json');
    const json = await resp.json();
    assert(json !== null && typeof json === 'object');
  });

  it('can override host header', async () => {
    const host = 'foobar.com';
    const resp = await fetch('https://httpbin.org/headers', { headers: { host } });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), 'application/json');
    const json = await resp.json();
    let hostHeaderValue;
    Object.keys(json.headers || {}).forEach((name) => {
      if (name.toLowerCase() === 'host') {
        hostHeaderValue = json.headers[name];
      }
    });
    assert.strictEqual(hostHeaderValue, host);
  });

  it.skip('supports redirects (GET/HEAD)', async () => {
    // default (follow)
    let resp = await fetch('https://httpstat.us/307');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.redirected, true);
    await resp.text();
    // manual
    resp = await fetch('https://httpstat.us/307', { redirect: 'manual' });
    assert.strictEqual(resp.status, 307);
    assert.strictEqual(resp.headers.get('location'), 'https://httpstat.us');
    await resp.text();
    // follow
    resp = await fetch('https://httpstat.us/307', { redirect: 'follow' });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.redirected, true);
    await resp.text();
    // error
    assert.rejects(() => fetch('https://httpstat.us/307', { redirect: 'error' }));
  });

  it('fetch supports URLSearchParams body', async () => {
    const params = {
      name: 'André Citroën',
      rumple: 'stiltskin',
    };
    const method = 'POST';
    const body = new URLSearchParams(params);
    const resp = await fetch('https://httpbin.org/post', { method, body });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), 'application/json');
    const jsonResponseBody = await resp.json();
    assert(jsonResponseBody !== null && typeof jsonResponseBody === 'object');
    assert.strictEqual(jsonResponseBody.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
    assert.deepStrictEqual(jsonResponseBody.form, params);
  });

  it.skip('fetch supports FormData body', async () => {
    const params = {
      name: 'André Citroën',
      rumple: 'stiltskin',
    };
    const method = 'POST';
    const form = new FormData();
    Object.entries(params).forEach(([k, v]) => form.append(k, v));

    const resp = await fetch('https://httpbin.org/post', { method, body: form });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('content-type'), 'application/json');
    const jsonResponseBody = await resp.json();
    assert(jsonResponseBody !== null && typeof jsonResponseBody === 'object');
    assert(jsonResponseBody.headers['Content-Type'].startsWith('multipart/form-data;boundary='));
    assert.deepStrictEqual(jsonResponseBody.form, params);
  });

  it('handles concurrent http2 requests', async function test() {
    this.timeout(10000);
    // https://github.com/adobe/helix-fetch/issues/52
    const doFetch = async (url) => {
      const res = await fetch(url, { cache: 'no-store' });
      assert.strictEqual(res.httpVersion, '2.0');
      const data = await res.text();
      return crypto.createHash('md5').update(data).digest().toString('hex');
    };

    const results = await Promise.all([
      doFetch('https://helix-fetch--adobe.hlx.page/README.html'),
      doFetch('https://helix-home--adobe.hlx.page/README.html'),
    ]);

    assert.strictEqual(results.length, 2);
    assert.notStrictEqual(results[0], results[1]);
  });
});
