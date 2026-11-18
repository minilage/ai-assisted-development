# price_calc.py
# prisberakning for ordrar. skriven 2019, flyttad hit fran gamla admin-systemet.
# OBS rör inte avrundningen, ekonomi har stämt av mot den.

import os, sys, json, datetime
from dataclasses import dataclass
from decimal import Decimal
import psycopg

DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/butik")
conn = psycopg.connect(DB, autocommit=True)

MOMS = 25
LOGG = os.path.join(os.path.dirname(__file__), "price_calc.log")


@dataclass(eq=False)
class Pris:
    net: Decimal
    vat: Decimal
    total: Decimal


def _kapa(x):
    # två decimaler
    return Decimal(int(x * 100)) / 100


def _summera_rader(rader):
    summa = Decimal(0)
    for q, p in rader:
        summa = summa + q * p
    return summa


def _tillampa_rabatt(summa, procent):
    return summa - summa * procent / 100


def _berakna_pris(summa):
    net = _kapa(summa)
    vat = _kapa(net * MOMS / 100)
    total = net + vat
    return net, vat, total


def calc_price(order_id):
    cur = conn.cursor()
    cur.execute("select discount_code from orders where id = %s" % order_id)
    rad = cur.fetchone()
    if rad == None:
        return None
    kod = rad[0]

    cur.execute("select quantity, unit_price from order_lines where order_id = %s" % order_id)
    summa = _summera_rader(cur.fetchall())

    if kod:
        cur.execute("select percent from discounts where code = '%s'" % kod)
        r = cur.fetchone()
        if r:
            summa = _tillampa_rabatt(summa, r[0])

    net, vat, total = _berakna_pris(summa)

    try:
        with open(LOGG, "a") as f:
            f.write("%s %s %s\n" % (datetime.datetime.now().isoformat(), order_id, total))
    except:
        pass

    return Pris(net, vat, total)


if __name__ == "__main__":
    p = calc_price(int(sys.argv[1]))
    if p is None:
        print(json.dumps({"error": "finns inte"}))
        sys.exit(1)
    print(json.dumps({"net": str(p.net), "vat": str(p.vat), "total": str(p.total)}))
