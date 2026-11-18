"""Gemensam uppsättning för karakteriseringstesterna av src/legacy/price_calc.py.

Modulen ansluter till databasen när den läses in, så miljön måste vara satt
före import. Bara testdatabasen används (databasnamnet måste sluta på _test).
"""

import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import psycopg
import pytest

REPO = Path(__file__).resolve().parents[2]
LEGACY_DIR = os.environ.get("LEGACY_DIR", str(REPO / "src" / "legacy"))

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/butik_test"
)

_dbname = urlparse(TEST_DB_URL).path.lstrip("/")
if not _dbname.endswith("_test"):
    pytest.exit(
        "Avbryter: databasnamnet måste sluta på _test (fick %r)." % _dbname,
        returncode=2,
    )

# Måste ske före import av price_calc.
os.environ["DATABASE_URL"] = TEST_DB_URL
sys.path.insert(0, LEGACY_DIR)

_SCHEMA = (REPO / "db" / "schema.sql").read_text(encoding="utf8")
_SEED = (REPO / "db" / "seed.sql").read_text(encoding="utf8")


def reset_db():
    """Schema + testdata via en egen anslutning (autocommit)."""
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        c.execute("SET client_min_messages TO warning")
        c.execute(_SCHEMA)
        c.execute(_SEED)


@pytest.fixture(autouse=True)
def fresh_db():
    reset_db()
    yield


@pytest.fixture
def db():
    """Egen anslutning för att lägga in tillfälliga testrader."""
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        yield c
