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

function IncomingMessage(socket) {
  let streamOptions;

  if (socket) {
    streamOptions = {
      highWaterMark: socket.readableHighWaterMark
    };
  }

  Stream.Readable.call(this, { autoDestroy: false, ...streamOptions });

  this._readableState.readingMore = true;

  this.socket = socket;

  this.httpVersionMajor = null;
  this.httpVersionMinor = null;
  this.httpVersion = null;
  this.complete = false;
  this.headers = {};
  this.rawHeaders = [];
  this.trailers = {};
  this.rawTrailers = [];

  this.aborted = false;

  this.upgrade = null;

  this.statusCode = null;
  this.statusMessage = null;
  this.client = socket;

  this._consuming = false;
  // Flag for when we decide that this message cannot possibly be
  // read by the user, so there's no point continuing to handle it.
  this._dumped = false;
}

Object.setPrototypeOf(IncomingMessage.prototype, Stream.Readable.prototype);
Object.setPrototypeOf(IncomingMessage, Stream.Readable);

Object.defineProperty(IncomingMessage.prototype, 'connection', {
  get: function() {
    return this.socket;
  },
  set: function(val) {
    this.socket = val;
  }
});

IncomingMessage.prototype.setTimeout = function setTimeout(msecs, callback) {
  if (callback)
    this.on('timeout', callback);
  this.socket.setTimeout(msecs);
  return this;
};


IncomingMessage.prototype._read = function _read(n) {
  if (!this._consuming) {
    this._readableState.readingMore = false;
    this._consuming = true;
  }

  // We actually do almost nothing here, because the parserOnBody
  // function fills up our internal buffer directly.  However, we
  // do need to unpause the underlying socket so that it flows.
  if (this.socket.readable)
    readStart(this.socket);
};


// It's possible that the socket will be destroyed, and removed from
// any messages, before ever calling this.  In that case, just skip
// it, since something else is destroying this connection anyway.
IncomingMessage.prototype.destroy = function destroy(error) {
  // TODO(ronag): Implement in terms of _destroy
  this.destroyed = true;
  if (this.socket)
    this.socket.destroy(error);
  return this;
};