import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = [os.environ["DINOX_HELPER_TEST_EXE"]] if os.environ.get("DINOX_HELPER_TEST_EXE") else [sys.executable, str(ROOT / "dinox_helper.py")]
sys.path.insert(0, str(ROOT))
from dinox_helper import configure
from proxy.config import proxy_config


class DinoxTests(unittest.TestCase):
    def test_restricted_policy(self):
        configure(dict(port=1443, secret="ab" * 16, host="0.0.0.0", cfproxy=True))
        self.assertEqual(proxy_config.host, "127.0.0.1")
        self.assertFalse(proxy_config.fallback_cfproxy)
        self.assertFalse(proxy_config.disable_secure)
        self.assertEqual(proxy_config.cfproxy_worker_domains, [])
        self.assertEqual(proxy_config.pool_size, 0)

    def test_rejects_invalid_configuration(self):
        for port, secret in [(80, "ab" * 16), (65536, "ab" * 16), (True, "ab" * 16), (1443, "x" * 32), (1443, "ab" * 15)]:
            with self.assertRaises(ValueError):
                configure(dict(port=port, secret=secret))

    def test_ready_lifetime_and_no_secret_in_output(self):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        child = subprocess.Popen(HELPER, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        try:
            secret = os.urandom(16).hex()
            child.stdin.write((json.dumps(dict(port=port, secret=secret)) + "\n").encode())
            child.stdin.flush()
            # communicate closes stdin, simulating Dinox exit/crash; a hung child fails in 8s.
            output, error = child.communicate(timeout=8)
            self.assertIn(b'"ready": true', output)
            self.assertNotIn(secret.encode(), output + error)
            self.assertEqual(child.returncode, 0)
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", port))
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()

    def test_port_conflict_does_not_kill_owner(self):
        with socket.socket() as owner:
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                owner.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            owner.bind(("127.0.0.1", 0))
            owner.listen()
            payload = json.dumps(dict(port=owner.getsockname()[1], secret="ab" * 16)) + "\n"
            child = subprocess.run(HELPER, input=payload, capture_output=True, text=True, timeout=8, creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
            self.assertIn('"error": "port_unavailable"', child.stdout)
            self.assertGreater(owner.fileno(), 0)


if __name__ == "__main__":
    unittest.main()
