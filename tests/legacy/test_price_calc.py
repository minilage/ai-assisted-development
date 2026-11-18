"""Karakteriseringstester för src/legacy/price_calc.py.

De låser det NUVARANDE beteendet, inklusive kända fel. De säger inte att
beteendet är riktigt. Produktionskoden ändras inte.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from decimal import Decimal

import pytest

import price_calc as pc
from conftest import REPO, LEGACY_DIR, TEST_DB_URL


@pytest.fixture
def logg(tmp_path, monkeypatch):
    """Pekar om modulens loggfil till tmp_path."""
    sokvag = tmp_path / "price_calc.log"
    monkeypatch.setattr(pc, "LOGG", str(sokvag))
    return sokvag


def _belopp(p):
    return (p.net, p.vat, p.total)


def test_utan_rabatt_order_1042(logg):
    p = pc.calc_price(1042)
    assert _belopp(p) == (Decimal("950.00"), Decimal("237.50"), Decimal("1187.50"))
    # Nuvarande beteende, inte nödvändigtvis rätt: _kapa delar ett heltal med
    # 100, så Decimal tappar de avslutande nollorna i str: "950", inte "950.00".
    assert (str(p.net), str(p.vat), str(p.total)) == ("950", "237.5", "1187.5")


def test_procentrabatt_sommar20_order_1041(logg):
    p = pc.calc_price(1041)
    assert _belopp(p) == (Decimal("588.80"), Decimal("147.20"), Decimal("736.00"))


def test_avrundningen_kapar_order_1044(logg):
    # Nuvarande beteende, inte nödvändigtvis rätt: _kapa använder int(x * 100)
    # och kapar därför i stället för att avrunda. Momsen 44.9775 blir 44.97
    # (avrundning hade gett 44.98).
    p = pc.calc_price(1044)
    assert _belopp(p) == (Decimal("179.91"), Decimal("44.97"), Decimal("224.88"))


def test_utgangen_rabattkod_tillampas_order_1045(logg):
    # Nuvarande beteende, inte nödvändigtvis rätt: discounts.valid_to
    # (2024-12-31 för GAMMAL15) kontrolleras aldrig, så 15 % dras av ändå.
    p = pc.calc_price(1045)
    assert _belopp(p) == (Decimal("551.65"), Decimal("137.91"), Decimal("689.56"))


def test_order_utan_rader_ger_noll_order_1043(logg):
    # Nuvarande beteende, inte nödvändigtvis rätt: en order utan rader ger
    # pris 0 i stället för ett fel.
    p = pc.calc_price(1043)
    assert _belopp(p) == (Decimal("0.00"), Decimal("0.00"), Decimal("0.00"))
    assert (str(p.net), str(p.vat), str(p.total)) == ("0", "0", "0")


def test_order_som_saknas_ger_none(logg):
    assert pc.calc_price(999999) is None


def test_okand_rabattkod_ignoreras_tyst(logg, db):
    # Nuvarande beteende, inte nödvändigtvis rätt: en kod som inte finns i
    # discounts ger varken fel eller rabatt.
    db.execute(
        "insert into orders (id, customer_id, status, discount_code) "
        "values (9001, 1, 'new', 'FINNSINTE')"
    )
    db.execute(
        "insert into order_lines (order_id, product, quantity, unit_price) "
        "values (9001, 'Testvara', 2, 100.00)"
    )
    p = pc.calc_price(9001)
    assert _belopp(p) == (Decimal("200.00"), Decimal("50.00"), Decimal("250.00"))


def _kopiera_till(tmp_path):
    (tmp_path / "src" / "legacy").mkdir(parents=True)
    (tmp_path / "jobs").mkdir()
    shutil.copy(os.path.join(LEGACY_DIR, "price_calc.py"), tmp_path / "src" / "legacy")
    shutil.copy(REPO / "jobs" / "nightly_report.py", tmp_path / "jobs")


def _kor(tmp_path, skript, *args):
    env = dict(os.environ, DATABASE_URL=TEST_DB_URL)
    return subprocess.run(
        [sys.executable, str(tmp_path / skript), *args],
        capture_output=True,
        text=True,
        env=env,
        cwd=str(tmp_path),
        timeout=60,
    )


def test_cli_skriver_json_och_exit_0(tmp_path):
    # Det här är vad src/pricing/legacyPrice.ts är beroende av.
    # Nuvarande beteende, inte nödvändigtvis rätt: beloppen är strängar utan
    # avslutande nollor ("950", "237.5", "1187.5"), inte "950.00" osv.
    _kopiera_till(tmp_path)
    r = _kor(tmp_path, "src/legacy/price_calc.py", "1042")
    assert r.returncode == 0
    assert r.stdout == '{"net": "950", "vat": "237.5", "total": "1187.5"}\n'
    assert json.loads(r.stdout) == {"net": "950", "vat": "237.5", "total": "1187.5"}


def test_cli_okand_order_ger_fel_och_exit_1(tmp_path):
    _kopiera_till(tmp_path)
    r = _kor(tmp_path, "src/legacy/price_calc.py", "999999")
    assert r.returncode == 1
    assert r.stdout == '{"error": "finns inte"}\n'


def test_nightly_report_summerar_betalda_ordrar(tmp_path):
    _kopiera_till(tmp_path)
    r = _kor(tmp_path, "jobs/nightly_report.py", "2026-10-01")
    assert r.returncode == 0
    # Nuvarande beteende, inte nödvändigtvis rätt: "1187.5 kr" (inga avslutande nollor).
    assert r.stdout == "2026-10-01: 1 betalda ordrar, totalt 1187.5 kr\n"
    # Datum utan betalda ordrar (1043 är 'new').
    r = _kor(tmp_path, "jobs/nightly_report.py", "2026-10-03")
    assert r.returncode == 0
    assert r.stdout == "2026-10-03: 0 betalda ordrar, totalt 0 kr\n"


def test_ett_anrop_loggar_exakt_en_rad(logg):
    pc.calc_price(1042)
    rader = logg.read_text().splitlines()
    assert len(rader) == 1
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6} 1042 1187\.5", rader[0])


def test_ologgbar_loggfil_svaljs_tyst(tmp_path, monkeypatch):
    # Nuvarande beteende, inte nödvändigtvis rätt: det blanka except: pass
    # sväljer felet när loggen inte kan skrivas, och priset returneras ändå.
    monkeypatch.setattr(pc, "LOGG", str(tmp_path / "finns_inte" / "price_calc.log"))
    p = pc.calc_price(1042)
    assert _belopp(p) == (Decimal("950.00"), Decimal("237.50"), Decimal("1187.50"))
    assert not (tmp_path / "finns_inte").exists()


def test_sql_injektion_via_order_id(logg, db):
    # Nuvarande beteende, inte nödvändigtvis rätt: order_id sätts in i SQL med
    # %-formatering. "1042 OR 1=1" matchar alla ordrar och alla rader, så
    # summan blir alla orderrader (4861.90) i stället för 1042:s. Det körs
    # bara SELECT: antalet rader är oförändrat.
    p = pc.calc_price("1042 OR 1=1")
    assert p is not None
    assert p.net == Decimal("4861.90")
    antal = db.execute("select (select count(*) from orders), (select count(*) from order_lines)").fetchone()
    assert antal == (8, 10)
