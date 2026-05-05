import asyncio

from app.db import init_db
from app.scheduler import start_scheduler, stop_scheduler


async def main() -> None:
    init_db()
    start_scheduler()
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        stop_scheduler()


if __name__ == "__main__":
    asyncio.run(main())
