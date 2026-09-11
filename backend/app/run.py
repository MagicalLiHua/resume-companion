import argparse
import logging

import uvicorn


def main():
    parser = argparse.ArgumentParser(description="启动简历随行后端（单进程）")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18080)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        workers=1,
        access_log=False,
        proxy_headers=False,
        server_header=False,
        timeout_keep_alive=5,
        timeout_graceful_shutdown=50,
        limit_concurrency=64,
        h11_max_incomplete_event_size=16384,
    )


if __name__ == "__main__":
    main()
