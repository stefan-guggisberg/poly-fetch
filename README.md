# poly-fetch

> Lightweight Fetch implementation transparently supporting both HTTP/1(.1) and HTTP/2.

## Features

* [x] supports reasonable subset of the standard [Fetch specification](https://fetch.spec.whatwg.org/)
* [x] Transparent handling of HTTP/1(.1) and HTTP/2 connections
* [x] Support `gzip/deflate/br` content encoding
* [x] HTTP/2 request and response multiplexing support
* [x] HTTP/2 Server Push support
* [x] overridable User-Agent
* [x] low-level HTTP/1.* agent/connect options support (e.g. `keepAlive`, `rejectUnauthorized`)

## Development

For troubleshooting and debugging, you can enable low-level debug console output from Node.js
(`NODE_DEBUG=<module list>`) and/or from `poly-fetch` (`DEBUG=poly-fetch*`), for example:
```
NODE_DEBUG=http*,tls DEBUG=poly-fetch* node myTest.js
```

## Acknowledgement

Thanks to [node-fetch](https://github.com/node-fetch/node-fetch) and [whatwg-fetch](https://github.com/github/fetch) for providing a solid implementation reference.
