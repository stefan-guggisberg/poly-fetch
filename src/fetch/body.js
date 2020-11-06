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

const getStream = require('get-stream');

const EMPTY_BUFFER = Buffer.alloc(0);
const INTERNALS = Symbol('Body internals');

/**
 * Convert a NodeJS Buffer to an ArrayBuffer
 *
 * @see https://stackoverflow.com/a/31394257
 *
 * @param {Buffer} buf
 * @returns {ArrayBuffer}
 */
const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

/**
 * Body mixin
 *
 * @see https://fetch.spec.whatwg.org/#body
 */
class Body {
  /**
   * Constructs a new Body instance
   * 
   * @constructor
   * @param {Readable} stream readable stream
   */
  constructor(stream, mimeType) {
    this[INTERNALS] = {
      stream,
      disturbed: false,
    };
  }

  /**
   * Return a Node.js Readable stream.
   * (deviation from spec)
   * 
   * @return {Promise<Readable>}
   */
	get body() {
		return this[INTERNALS].stream;
	}

	get bodyUsed() {
		return this[INTERNALS].disturbed;
	}

  /**
   * Consume the body and return a promise that will resolve to a Node.js Buffer.
   * (extension)
   * 
	 * @return {Promise<Buffer>}
   */
  async buffer() {
    return consume(this);
  }

	/**
   * Consume the body and return a promise that will resolve to an ArrayBuffer.
	 *
	 * @return {Promise<ArrayBuffer>}
	 */
  async arrayBuffer() {
    return toArrayBuffer(await this.buffer());
  }

	/**
   * Consume the body and return a promise that will resolve to a String.
	 *
	 * @return {Promise<String>}
	 */
  async text() {
    const buf = await consume(this);
    return buf.toString();
  }

	/**
   * Consume the body and return a promise that will resolve to the result of JSON.parse(responseText).
	 *
	 * @return {Promise<*>}
	 */
  async json() {
    return JSON.parse(await this.text());
  }
}

/**
 * Consume the body's stream and return a Buffer with the stream's content.
 *
 * Ref: https://fetch.spec.whatwg.org/#concept-body-consume-body
 *
 * @return Promise<Buffer>
 */
const consume = async (body) => {
	if (body[INTERNALS].disturbed) {
    throw new TypeError('Already read');
	}

	body[INTERNALS].disturbed = true;

	const { stream } = body[INTERNALS];

	if (stream === null) {
		return EMPTY_BUFFER;
	}

	if (!(stream instanceof Readable)) {
		return EMPTY_BUFFER;
  }
  
  return getStream.buffer(stream);
};

module.exports = {
  Body
};
