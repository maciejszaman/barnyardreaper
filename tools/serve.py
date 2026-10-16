#!/usr/bin/env python3
"""Serves the game folder for the game and its tools, and lets the tools save data files.

    python3 tools/serve.py            # http://localhost:8000  (game: /, talent creator: /tools/talents/)
    python3 tools/serve.py --port 8080

Like `python3 -m http.server`, plus:
  GET  /api/ping   -> {"ok": true}: the tools use it to know they can save
  POST /api/save   {"file": "cat_talents.json", "text": "..."} -> writes data/<file>
Only .json files directly inside data/ can be written, only valid JSON, and the old file is kept in
tools/backups/ first (the newest 40 per file). It listens on this computer only (127.0.0.1).
"""
import argparse
import datetime
import functools
import http.server
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
BACKUPS = os.path.join(ROOT, 'tools', 'backups')
KEEP = 40
MAX_BODY = 20 * 1024 * 1024
NAME = re.compile(r'^[A-Za-z0-9_\-]+\.json$')


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')   # edited JSON shows up on the next reload
        super().end_headers()

    def reply(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/ping':
            return self.reply(200, {'ok': True, 'data': sorted(f for f in os.listdir(DATA) if f.endswith('.json'))})
        return super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/api/save':
            return self.reply(404, {'ok': False, 'error': 'unknown endpoint'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n <= 0 or n > MAX_BODY:
                return self.reply(413, {'ok': False, 'error': 'empty or too large'})
            req = json.loads(self.rfile.read(n).decode('utf-8'))
            name, text = req.get('file'), req.get('text')
            if not isinstance(name, str) or not NAME.match(name) or not isinstance(text, str):
                return self.reply(400, {'ok': False, 'error': 'expected {"file": "<name>.json", "text": "..."}'})
            try:
                json.loads(text)
            except ValueError as e:
                return self.reply(400, {'ok': False, 'error': 'not valid JSON: %s' % e})
            path = os.path.join(DATA, name)
            backup = None
            if os.path.exists(path):
                os.makedirs(BACKUPS, exist_ok=True)
                stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
                backup = os.path.join(BACKUPS, '%s.%s.json' % (name[:-5], stamp))
                with open(path, 'rb') as src, open(backup, 'wb') as dst:
                    dst.write(src.read())
                old = sorted(f for f in os.listdir(BACKUPS) if f.startswith(name[:-5] + '.') and f.endswith('.json'))
                for f in old[:-KEEP]:
                    os.remove(os.path.join(BACKUPS, f))
            tmp = path + '.tmp'
            with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
                f.write(text)
            os.replace(tmp, path)
            self.log_message('saved data/%s (%d bytes)', name, len(text))
            return self.reply(200, {'ok': True, 'file': 'data/' + name, 'backup': os.path.relpath(backup, ROOT) if backup else None})
        except Exception as e:   # report anything else to the tool instead of hanging up
            return self.reply(500, {'ok': False, 'error': str(e)})


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--host', default='127.0.0.1')
    a = ap.parse_args()
    srv = http.server.ThreadingHTTPServer((a.host, a.port), functools.partial(Handler, directory=ROOT))
    print('Barnyard Reaper on http://localhost:%d/  ·  talent creator: http://localhost:%d/tools/talents/' % (a.port, a.port))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
