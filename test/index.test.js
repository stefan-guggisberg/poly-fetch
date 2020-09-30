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
const stream = require('stream');
const { promisify } = require('util');

const isStream = require('is-stream');
const nock = require('nock');
const { WritableStreamBuffer } = require('stream-buffers');

const { request, context, reset, ALPN_HTTP1_1 } = require('../src/index');

const streamFinished = promisify(stream.finished);

describe('Polyglot HTTP Client Tests', () => {

  let defaultCtx;

  before(async () => {
    defaultCtx = context();
  });

  after(async () => {
    await defaultCtx.reset();
  });
  
  it('request supports HTTP/1(.1)', async () => {
    const resp = await defaultCtx.request('http://httpbin.org/status/200');
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(resp.httpVersionMajor, 1);
  });

  it.only('request supports HTTP/2', async () => {
    let resp = await defaultCtx.request('https://www.nghttp2.org/httpbin/status/200');
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(resp.httpVersionMajor, 2);

    resp = await defaultCtx.request('https://www.nghttp2.org/httpbin/status/201');
    assert.strictEqual(resp.statusCode, 201);
    assert.strictEqual(resp.httpVersionMajor, 2);
  });

  it('request supports binary response body (Stream)', async () => {
    const dataLen = 64 * 1024; // httpbin.org/stream-bytes/{n} has a limit of 100kb ...
    const contentType = 'application/octet-stream';
    const resp = await defaultCtx.request(`https://httpbin.org/stream-bytes/${dataLen}`, {
      headers: { accept: contentType },
    });
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(resp.headers['content-type'], contentType);
    assert(isStream.readable(resp.readable));

    const out = new WritableStreamBuffer();
    resp.readable.pipe(out);
    await streamFinished(out);
    assert.strictEqual(out.getContents().length, dataLen);
  });

  it('creating custom context works', async () => {
    const customCtx = context();
    try {
      const resp = await customCtx.request('https://httpbin.org/status/200');
      assert.strictEqual(resp.statusCode, 200);
    } finally {
      await customCtx.reset();
    }
  });

  it('overriding user-agent works', async () => {
    const customUserAgent = 'custom-agent';
    const customCtx = context({
      userAgent: customUserAgent,
      overwriteUserAgent: true,
    });
    try {
      const resp = await customCtx.request('https://httpbin.org/user-agent');
      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(resp.headers['content-type'], 'application/json');
  
      const out = new WritableStreamBuffer();
      resp.readable.pipe(out);
      await streamFinished(out);
      const json = JSON.parse(out.getContents());
      assert.strictEqual(json['user-agent'], customUserAgent);
    } finally {
      customCtx.reset();
    }
  });

  it('forcing HTTP/1.1 works', async function test() {
    this.timeout(5000);
    // endpoint supporting http2 & http1
    const url = 'https://www.nghttp2.org/httpbin/status/200';
    // default context defaults to http2
    let resp = await defaultCtx.request(url);
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(resp.httpVersionMajor, 2);

    // custom context forces http1
    const h1Ctx = context({
      alpnProtocols: [ ALPN_HTTP1_1 ],
    });
    try {
      resp = await h1Ctx.request(url);
      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(resp.httpVersionMajor, 1);
      assert.strictEqual(resp.httpVersionMinor, 1);
    } finally {
      h1Ctx.reset();
    }
  });

  it('forcing HTTP/1.1 works', async function test() {
    this.timeout(5000);
    // endpoint supporting http2 & http1
    const url = 'https://www.nghttp2.org/httpbin/status/200';
    // custom context forces http1
    const h1Ctx = context({
      alpnProtocols: [ ALPN_HTTP1_1 ],
    });
    try {
      const resp = await h1Ctx.request(url);
      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(resp.httpVersionMajor, 1);
      assert.strictEqual(resp.httpVersionMinor, 1);
    } finally {
      h1Ctx.reset();
    }
  });
});
