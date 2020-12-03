# poly-fetch

> Lightweight Fetch implementation transparently supporting both HTTP/1(.1) and HTTP/2.

## Features

* [x] Transparent handling of HTTP/1(.1) and HTTP/2 connections
* [x] Promise API/`async & await`
* [x] Streaming support
* [x] HTTP/2 request and response multiplexing support
* [x] Support gzip/deflate/br content encoding
* [x] HTTP/2 Server Push support
* [x] Redirect support
* [x] overridable User-Agent
* [x] low-level HTTP/1.* agent/connect options support (e.g. `keepAlive`, `rejectUnauthorized`)

## Development

For troubleshooting and debugging, you can enable low-level debug console output from Node.js
(`NODE_DEBUG=<module list>`) and/or from `poly-fetch` (`DEBUG=poly-fetch*`), for example:
```
NODE_DEBUG=http2,tls DEBUG=poly-fetch* node myTest.js
```