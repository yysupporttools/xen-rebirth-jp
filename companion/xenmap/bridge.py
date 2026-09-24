"""Authenticated loopback only API. No filesystem paths, shell commands or remote capture."""
import hmac
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SITE = 'https://yysupporttools.github.io'
PORT = 18765


def make_server(token, snapshot, commands, port=PORT):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def allowed(self):
            return (self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}' and
                    self.headers.get('Origin') == SITE)

        def reply(self, code, payload):
            body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            if self.allowed():
                self.send_header('Access-Control-Allow-Origin', SITE)
                self.send_header('Vary', 'Origin')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            if not self.allowed():
                self.reply(403, {'error': 'origin'})
                return
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', SITE)
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.end_headers()

        def authorized(self):
            if not self.allowed():
                self.reply(403, {'error': 'origin'})
                return False
            if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
                self.reply(401, {'error': 'pairing'})
                return False
            return True

        def do_GET(self):
            if not self.authorized():
                return
            if self.path == '/state':
                self.reply(200, snapshot())
            else:
                self.reply(404, {'error': 'path'})

        def do_POST(self):
            if not self.authorized():
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 4096:
                    raise ValueError()
                self.connection.settimeout(3)
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError()
                if self.path == '/destination':
                    name = data.get('name', '')
                    if not isinstance(name, str) or name not in snapshot()['destinations']:
                        raise ValueError()
                    commands.put(('destination', name, bool(data.get('transports', False))))
                elif self.path == '/clear':
                    commands.put(('clear',))
                elif self.path == '/forget':
                    name = data.get('name')
                    if not isinstance(name, str) or name not in snapshot()['maps']:
                        raise ValueError()
                    commands.put(('forget', name))
                else:
                    self.reply(404, {'error': 'path'})
                    return
                self.reply(202, {'accepted': True})
            except (ValueError, TypeError, TimeoutError):
                self.reply(400, {'error': 'invalid request'})

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    return server
