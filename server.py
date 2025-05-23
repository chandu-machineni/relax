#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 8000

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Handle /about route - rewrite to about.html
        if self.path == '/about':
            self.path = '/about.html'
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

with socketserver.TCPServer(("", PORT), RequestHandler) as httpd:
    print(f"Server running at http://localhost:{PORT}")
    print("Press Ctrl+C to stop")
    httpd.serve_forever() 