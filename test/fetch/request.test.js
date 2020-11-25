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

const { Readable } = require('stream');

const chai = require('chai');
const { expect } = chai;

const { Request, AbortController } = require('../../src/fetch');

const BASE_URL = 'https://example.com/';

describe('Request Tests', () => {

  it('should have attributes conforming to Web IDL', () => {
    const request = new Request('https://github.com/');
    const enumerableProperties = [];
    for (const property in request) {
      enumerableProperties.push(property);
    }

    for (const toCheck of [
      'body',
      'bodyUsed',
      'json',
      'text',
      'method',
      'url',
      'headers',
      'redirect',
      'clone',
      'signal'
    ]) {
      expect(enumerableProperties).to.contain(toCheck);
    }

    for (const toCheck of [
      'body', 'bodyUsed', 'method', 'url', 'headers', 'redirect', 'signal'
    ]) {
      expect(() => {
        request[toCheck] = 'abc';
      }).to.throw();
    }
  });

  it('should support wrapping Request instance', () => {
    const url = `${BASE_URL}hello`;

    const params = new URLSearchParams();
    params.append('a', '1');
    const { signal } = new AbortController();

    const r1 = new Request(url, {
      method: 'POST',
      follow: 1,
      body: params,
      signal
    });
    const r2 = new Request(r1, {
      follow: 2
    });

    expect(r2.url).to.equal(url);
    expect(r2.method).to.equal('POST');
    expect(r2.signal).to.equal(signal);
    expect(r1.counter).to.equal(0);
    expect(r2.counter).to.equal(0);
    return r2.text().then(str => expect(str).to.equal(params.toString()));
  });

  it('should override signal on derived Request instances', () => {
    const parentAbortController = new AbortController();
    const derivedAbortController = new AbortController();
    const parentRequest = new Request(`${BASE_URL}hello`, {
      signal: parentAbortController.signal
    });
    const derivedRequest = new Request(parentRequest, {
      signal: derivedAbortController.signal
    });
    expect(parentRequest.signal).to.equal(parentAbortController.signal);
    expect(derivedRequest.signal).to.equal(derivedAbortController.signal);
  });

  it('should allow removing signal on derived Request instances', () => {
    const parentAbortController = new AbortController();
    const parentRequest = new Request(`${BASE_URL}hello`, {
      signal: parentAbortController.signal
    });
    const derivedRequest = new Request(parentRequest, {
      signal: null
    });
    expect(parentRequest.signal).to.equal(parentAbortController.signal);
    expect(derivedRequest.signal).to.equal(null);
  });

  it('should throw error with GET/HEAD requests with body', () => {
    expect(() => new Request(BASE_URL, {body: ''}))
      .to.throw(TypeError);
    expect(() => new Request(BASE_URL, {body: 'a'}))
      .to.throw(TypeError);
    expect(() => new Request(BASE_URL, {body: '', method: 'HEAD'}))
      .to.throw(TypeError);
    expect(() => new Request(BASE_URL, {body: 'a', method: 'HEAD'}))
      .to.throw(TypeError);
    expect(() => new Request(BASE_URL, {body: 'a', method: 'get'}))
      .to.throw(TypeError);
    expect(() => new Request(BASE_URL, {body: 'a', method: 'head'}))
      .to.throw(TypeError);
  });

  it('should default to null as body', () => {
    const request = new Request(BASE_URL);
    expect(request.body).to.equal(null);
    return request.text().then(result => expect(result).to.equal(''));
  });

  it('should support parsing headers', () => {
    const url = BASE_URL;
    const request = new Request(url, {
      headers: {
        a: '1'
      }
    });
    expect(request.url).to.equal(url);
    expect(request.headers.get('a')).to.equal('1');
  });

  it('should support arrayBuffer() method', () => {
    const url = BASE_URL;
    const request = new Request(url, {
      method: 'POST',
      body: 'a=1'
    });
    expect(request.url).to.equal(url);
    return request.arrayBuffer().then(result => {
      expect(result).to.be.an.instanceOf(ArrayBuffer);
      const string = String.fromCharCode.apply(null, new Uint8Array(result));
      expect(string).to.equal('a=1');
    });
  });

  it('should support text() method', () => {
    const url = BASE_URL;
    const request = new Request(url, {
      method: 'POST',
      body: 'a=1'
    });
    expect(request.url).to.equal(url);
    return request.text().then(result => {
      expect(result).to.equal('a=1');
    });
  });

  it('should support json() method', () => {
    const url = BASE_URL;
    const request = new Request(url, {
      method: 'POST',
      body: '{"a":1}'
    });
    expect(request.url).to.equal(url);
    return request.json().then(result => {
      expect(result.a).to.equal(1);
    });
  });

  it('should support buffer() method', () => {
    const url = BASE_URL;
    const request = new Request(url, {
      method: 'POST',
      body: 'a=1'
    });
    expect(request.url).to.equal(url);
    return request.buffer().then(result => {
      expect(result.toString()).to.equal('a=1');
    });
  });

  it('should support clone() method', () => {
    const url = BASE_URL;
    const body = Readable.from('a=1');
    const {signal} = new AbortController();
    const request = new Request(url, {
      body,
      method: 'POST',
      redirect: 'manual',
      headers: {
        b: '2'
      },
      follow: 3,
      compress: false,
      signal
    });
    const cl = request.clone();
    expect(cl.url).to.equal(url);
    expect(cl.method).to.equal('POST');
    expect(cl.redirect).to.equal('manual');
    expect(cl.headers.get('b')).to.equal('2');
    expect(cl.method).to.equal('POST');
    expect(cl.counter).to.equal(0);
    expect(cl.signal).to.equal(signal);
    // Clone body shouldn't be the same body
    expect(cl.body).to.not.equal(body);
    return Promise.all([cl.text(), request.text()]).then(results => {
      expect(results[0]).to.equal('a=1');
      expect(results[1]).to.equal('a=1');
    });
  });
});
