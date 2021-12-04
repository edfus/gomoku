#!/bin/sh

if \ 
  case `(printf 'GET /health-check HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n'; sleep 1;) | nc 127.0.0.1 8081 | head -1` \
   in 'HTTP/1.1 200 OK'*) true;; *) false;; esac; then
  exit 0
else
  exit 1
fi