import http.client
import json
import queue
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'companion'))
from xenmap.model import Atlas, title_name
from xenmap.bridge import SITE, make_server


class AtlasTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'atlas.json'
        self.atlas = Atlas(self.path)

    def test_unknown_area_repeated_exit_and_restart(self):
        self.assertFalse(self.atlas.observe('New Meadow', {'Essene': [30, 250]}))
        self.assertTrue(self.atlas.observe('New Meadow', {'Essene': [31, 250]}))
        self.assertEqual(self.atlas.route('New Meadow', 'Essene'), [])
        self.atlas.observe('New Meadow', {'Essene': [32, 251]})
        self.assertEqual(self.atlas.route('New Meadow', 'Essene'), ['New Meadow', 'Essene'])
        self.assertEqual(self.atlas.route('Essene', 'New Meadow'), [])
        restored = Atlas(self.path)
        self.assertEqual(restored.point('New Meadow', 'Essene'), [32, 251])
        restored.remove('New Meadow')
        self.assertNotIn('New Meadow', Atlas(self.path).maps)
        self.assertFalse(Atlas(self.path).observe('New Meadow', {}))

    def test_unstable_exit_and_invalid_coordinates(self):
        for point in ([1, 250], [1, 250], [450, 250], [float('nan'), 0], [-5, 0]):
            self.atlas.observe('New Meadow', {'Essene': point})
        self.assertIsNone(self.atlas.point('New Meadow', 'Essene'))

    def test_transport_is_opt_in_and_directional(self):
        self.assertEqual(self.atlas.route('Candyvault', 'Eir', True), ['Candyvault', 'Eir'])
        walking = self.atlas.route('Candyvault', 'Eir')
        self.assertNotEqual(walking, ['Candyvault', 'Eir'])

    def test_title_normalization(self):
        self.assertEqual(title_name('Eir'), 'Eir')
        self.assertEqual(title_name('   New   Meadow  '), 'New Meadow')
        self.assertEqual(title_name('world map'), '')
        self.assertEqual(title_name('12'), '')


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.commands = queue.Queue()
        self.server = make_server('test-secret', lambda: {'destinations': ['Eir'], 'maps': {'New Meadow': {}}}, self.commands, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, body=None, **headers):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        connection.request(method, path, json.dumps(body) if body is not None else None,
                           {'Origin': SITE, 'Authorization': 'Bearer test-secret', **headers})
        response = connection.getresponse()
        result = response.status, response.getheaders(), response.read()
        connection.close()
        return result

    def test_origin_host_auth_and_no_wildcard(self):
        self.assertEqual(self.request('GET', '/state', Authorization='')[0], 401)
        self.assertEqual(self.request('GET', '/state', Origin='https://evil.example')[0], 403)
        self.assertEqual(self.request('GET', '/state', Host='evil.example')[0], 403)
        status, headers, body = self.request('GET', '/state')
        self.assertEqual(status, 200)
        self.assertEqual(dict(headers)['Access-Control-Allow-Origin'], SITE)
        self.assertNotIn(b'test-secret', body)
        self.assertEqual(self.request('GET', '/../../secret')[0], 404)

    def test_preflight_and_destination_queue(self):
        status, headers, _ = self.request('OPTIONS', '/destination')
        self.assertEqual(status, 204)
        self.assertEqual(dict(headers)['Access-Control-Allow-Private-Network'], 'true')
        self.assertEqual(self.request('POST', '/destination', {'name': 'Eir'})[0], 202)
        self.assertEqual(self.commands.get_nowait(), ('destination', 'Eir', False))
        self.assertEqual(self.request('POST', '/destination', {'name': 'nonsense'})[0], 400)
        self.assertEqual(self.request('POST', '/destination', [1, 2])[0], 400)
        self.assertEqual(self.request('POST', '/clear', {})[0], 202)


if __name__ == '__main__':
    unittest.main()
