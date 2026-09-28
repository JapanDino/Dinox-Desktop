"""Dinox's restricted, headless host for the pinned Flowseal transport.

One JSON config line arrives over inherited stdin; EOF means the parent exited.
No account credentials, third-party relays, tray UI, updates, or on-disk logs.
"""
import asyncio
import json
import logging
import sys
import threading

from proxy.config import proxy_config
from proxy.pool import ws_pool, cf_worker_pool
from proxy.stats import stats
from proxy.tg_ws_proxy import _handle_client
from proxy.utils import DC_DEFAULT_IPS


def configure(value):
    port = value.get("port")
    secret = value.get("secret", "")
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ValueError("invalid_config")
    if not isinstance(secret, str) or len(secret) != 32:
        raise ValueError("invalid_config")
    try:
        key = bytes.fromhex(secret)
    except ValueError:
        raise ValueError("invalid_config") from None
    if len(key) != 16:
        raise ValueError("invalid_config")
    proxy_config.host = "127.0.0.1"
    proxy_config.port = port
    proxy_config.secret = secret
    proxy_config.dc_redirects = dict(DC_DEFAULT_IPS)
    proxy_config.fallback_cfproxy = False
    proxy_config.cfproxy_user_domains = []
    proxy_config.cfproxy_worker_domains = []
    proxy_config.disable_secure = False
    proxy_config.pool_size = 0  # no idle network connections / SNI fronting
    proxy_config.buffer_size = 64 * 1024
    return key


def report(**value):
    print(json.dumps(value), flush=True)


async def serve(value):
    key = configure(value)
    ws_pool.reset()
    cf_worker_pool.reset()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    tasks = set()

    def parent_lifetime():
        # Not the default executor: a daemon thread must not delay process exit.
        sys.stdin.buffer.read()
        try:
            loop.call_soon_threadsafe(stop.set)
        except RuntimeError:
            pass

    threading.Thread(target=parent_lifetime, daemon=True).start()

    async def client(reader, writer):
        task = asyncio.current_task()
        if len(tasks) >= 64:
            writer.close()
            await writer.wait_closed()
            return
        tasks.add(task)
        try:
            await _handle_client(reader, writer, key)
        finally:
            tasks.discard(task)

    try:
        server = await asyncio.start_server(client, "127.0.0.1", proxy_config.port)
    except OSError:
        report(error="port_unavailable")
        return
    report(ready=True)
    async with server:
        while not stop.is_set():
            report(active=stats.connections_active, up=stats.bytes_up,
                   down=stats.bytes_down, errors=stats.ws_errors,
                   ws=stats.connections_ws, tcp=stats.connections_tcp_fallback)
            try:
                await asyncio.wait_for(stop.wait(), timeout=3)
            except asyncio.TimeoutError:
                pass
    for task in list(tasks):
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def main():
    logging.disable(logging.CRITICAL)  # never log proxy secrets or destinations
    try:
        raw = sys.stdin.buffer.readline(4097)
        if len(raw) > 4096 or not raw.endswith(b"\n"):
            raise ValueError("invalid_config")
        asyncio.run(serve(json.loads(raw)))
    except (ValueError, TypeError, AttributeError):
        report(error="invalid_config")
    except Exception:
        report(error="helper_failed")


if __name__ == "__main__":
    main()
