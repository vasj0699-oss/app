"""Backend API tests for AJVJ Fitosanidad - Iteration 3.

Cubre:
- POST /api/bitacoras crea aplicada=False por defecto (NO descuenta inventario)
- POST /api/bitacoras/{id}/aplicar marca aplicada=True, descuenta y crea movimientos tipo=salida
- aplicar idempotente: segunda llamada {ya_aplicada: true}
- POST /api/bitacoras/{id}/desaplicar revierte: aplicada=False, suma de vuelta
- DELETE bitacora aplicada=True revierte; DELETE bitacora aplicada=False no toca inventario
- /api/pedidos/calcular solo cuenta planes (aplicada=False) y NO los aplicados
- /api/pedidos/calcular respuesta incluye compras_en_rango por producto
- a_pedir = max(0, necesito - tengo)
"""
import os
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@ajvj.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def workspace(admin_headers):
    """Modulo + producto en L para iteration3."""
    ts = datetime.now().strftime('%H%M%S%f')
    nombre_mod = f"TEST_IT3_MOD_{ts}"
    rm = requests.post(f"{API}/modulos", headers=admin_headers, json={
        "nombre": nombre_mod,
        "ciclos": [{"numero": 1, "cultivo": "jitomate", "variedad": "Saladette",
                    "num_plantas": 1000, "superficie_m2": 1500,
                    "caldo_foliar_L": 200, "activo": True}],
    })
    assert rm.status_code == 200, rm.text
    modulo_id = rm.json()["id"]

    rp = requests.post(f"{API}/productos", headers=admin_headers, json={
        "nombre": f"TEST_IT3_PROD_{ts}", "categoria": "fungicida",
        "unidad_habitual": "L", "precio_unitario": 100.0, "dosis_habitual": 1.0,
    })
    assert rp.status_code == 200, rp.text
    prod = rp.json()

    # Aprovisionar 10 L
    rc = requests.post(f"{API}/compras", headers=admin_headers, json={
        "fecha": "2026-01-05", "proveedor": "ProvIT3",
        "items": [{"producto_id": prod["id"], "nombre_producto": prod["nombre"],
                   "cantidad": 10.0, "unidad": "L", "precio_unitario": 100.0}],
    })
    assert rc.status_code == 200, rc.text
    compra_id = rc.json()["id"]

    yield {"modulo_id": modulo_id, "prod": prod, "compra_id": compra_id}

    # cleanup
    requests.delete(f"{API}/compras/{compra_id}", headers=admin_headers)
    requests.delete(f"{API}/productos/{prod['id']}", headers=admin_headers)
    requests.delete(f"{API}/modulos/{modulo_id}", headers=admin_headers)


def _bit_payload(modulo_id, prod, fecha, cant=1.0, aplicada=None):
    p = {
        "fecha": fecha, "tipo": "individual",
        "modulo_id": modulo_id, "ciclo_numero": 1,
        "aplicaciones": [{
            "tipo": "foliar", "objetivo": "plagas",
            "productos": [{
                "producto_id": prod["id"], "nombre": prod["nombre"],
                "dosis": 1, "unidad": "L/ha",
                "cantidad_usada_total": cant, "costo_linea": cant * 100.0,
                "precio_unitario": 100.0,
            }],
        }],
    }
    if aplicada is not None:
        p["aplicada"] = aplicada
    return p


def _inv_qty(headers, prod_id):
    inv = requests.get(f"{API}/inventario", headers=headers).json()
    item = next((i for i in inv if i["producto_id"] == prod_id), None)
    return item["cantidad"] if item else 0.0


# ---------- Plan por defecto (no descuenta) ----------
class TestBitacoraPlanDefault:
    def test_create_default_aplicada_false_no_descuenta(self, admin_headers, workspace):
        prod = workspace["prod"]
        before = _inv_qty(admin_headers, prod["id"])

        rb = requests.post(f"{API}/bitacoras", headers=admin_headers,
                           json=_bit_payload(workspace["modulo_id"], prod,
                                             "2026-02-01", cant=2.0))
        assert rb.status_code == 200, rb.text
        body = rb.json()
        assert body["aplicada"] is False
        assert body.get("aplicada_en") in (None, "")
        bid = body["id"]

        # Inventario debe quedar igual
        after = _inv_qty(admin_headers, prod["id"])
        assert after == before, f"plan no debe descontar (before={before} after={after})"

        # No deben existir movimientos tipo salida para esta bitacora
        movs = requests.get(f"{API}/inventario/{prod['id']}/movimientos",
                            headers=admin_headers).json()
        ref = f"bitacora:{bid}"
        salidas = [m for m in movs if m.get("referencia") == ref and m.get("tipo") == "salida"]
        assert len(salidas) == 0

        # cleanup: como no está aplicada, DELETE no debe modificar inventario
        rd = requests.delete(f"{API}/bitacoras/{bid}", headers=admin_headers)
        assert rd.status_code == 200
        assert _inv_qty(admin_headers, prod["id"]) == before


# ---------- Aplicar / Desaplicar ----------
class TestAplicarDesaplicar:
    def test_aplicar_descuenta_y_idempotente(self, admin_headers, workspace):
        prod = workspace["prod"]
        before = _inv_qty(admin_headers, prod["id"])
        rb = requests.post(f"{API}/bitacoras", headers=admin_headers,
                           json=_bit_payload(workspace["modulo_id"], prod,
                                             "2026-02-02", cant=3.0))
        assert rb.status_code == 200
        bid = rb.json()["id"]

        # aplicar
        ra = requests.post(f"{API}/bitacoras/{bid}/aplicar", headers=admin_headers)
        assert ra.status_code == 200, ra.text
        body = ra.json()
        assert body.get("aplicada") is True

        after = _inv_qty(admin_headers, prod["id"])
        assert round(before - after, 4) == 3.0, f"esperado descuento de 3.0 (before={before} after={after})"

        # GET la bitacora debe mostrar aplicada=True y aplicada_en con timestamp
        rg = requests.get(f"{API}/bitacoras/{bid}", headers=admin_headers).json()
        assert rg["aplicada"] is True
        assert rg.get("aplicada_en")

        # movimiento de salida creado
        movs = requests.get(f"{API}/inventario/{prod['id']}/movimientos",
                            headers=admin_headers).json()
        salidas = [m for m in movs if m.get("referencia") == f"bitacora:{bid}"
                   and m.get("tipo") == "salida"]
        assert len(salidas) == 1
        assert salidas[0]["cantidad"] == 3.0

        # idempotente: segunda llamada NO descuenta
        ra2 = requests.post(f"{API}/bitacoras/{bid}/aplicar", headers=admin_headers)
        assert ra2.status_code == 200
        assert ra2.json().get("ya_aplicada") is True
        assert _inv_qty(admin_headers, prod["id"]) == after, "no debe descontar dos veces"

        # cleanup
        requests.delete(f"{API}/bitacoras/{bid}", headers=admin_headers)
        # tras delete (estaba aplicada), inventario vuelve al estado previo
        assert _inv_qty(admin_headers, prod["id"]) == before

    def test_desaplicar_revierte(self, admin_headers, workspace):
        prod = workspace["prod"]
        before = _inv_qty(admin_headers, prod["id"])
        rb = requests.post(f"{API}/bitacoras", headers=admin_headers,
                           json=_bit_payload(workspace["modulo_id"], prod,
                                             "2026-02-03", cant=1.5, aplicada=True))
        assert rb.status_code == 200
        bid = rb.json()["id"]
        # aplicada=True desde la creación → debe descontar
        mid = _inv_qty(admin_headers, prod["id"])
        assert round(before - mid, 4) == 1.5

        # desaplicar
        rd = requests.post(f"{API}/bitacoras/{bid}/desaplicar", headers=admin_headers)
        assert rd.status_code == 200, rd.text
        assert rd.json().get("aplicada") is False
        assert _inv_qty(admin_headers, prod["id"]) == before

        # GET ya no aplicada
        rg = requests.get(f"{API}/bitacoras/{bid}", headers=admin_headers).json()
        assert rg["aplicada"] is False

        # No deben quedar movimientos para esta bitacora
        movs = requests.get(f"{API}/inventario/{prod['id']}/movimientos",
                            headers=admin_headers).json()
        leftover = [m for m in movs if m.get("referencia") == f"bitacora:{bid}"]
        assert len(leftover) == 0

        # cleanup: ahora es plan, DELETE no toca inventario
        requests.delete(f"{API}/bitacoras/{bid}", headers=admin_headers)
        assert _inv_qty(admin_headers, prod["id"]) == before


# ---------- Pedidos: solo planes y compras_en_rango ----------
class TestPedidosPlanes:
    def test_pedidos_solo_planes_y_compras_en_rango(self, admin_headers, workspace):
        prod = workspace["prod"]
        modulo_id = workspace["modulo_id"]

        # Crear plan (aplicada=False) cant=4 dentro de febrero
        rb_plan = requests.post(f"{API}/bitacoras", headers=admin_headers,
                                json=_bit_payload(modulo_id, prod,
                                                  "2026-02-10", cant=4.0))
        assert rb_plan.status_code == 200
        bid_plan = rb_plan.json()["id"]

        # Crear bitacora aplicada=True cant=2 dentro de febrero (NO debe contarse en pedido)
        rb_apl = requests.post(f"{API}/bitacoras", headers=admin_headers,
                               json=_bit_payload(modulo_id, prod,
                                                 "2026-02-11", cant=2.0, aplicada=True))
        assert rb_apl.status_code == 200
        bid_apl = rb_apl.json()["id"]

        # Compra en febrero (en rango): 7 L
        rc = requests.post(f"{API}/compras", headers=admin_headers, json={
            "fecha": "2026-02-15", "proveedor": "ProvFeb",
            "items": [{"producto_id": prod["id"], "nombre_producto": prod["nombre"],
                       "cantidad": 7.0, "unidad": "L", "precio_unitario": 100.0}],
        })
        assert rc.status_code == 200
        cid_feb = rc.json()["id"]

        # Compra fuera de rango (enero) NO debe sumarse a compras_en_rango
        rc2 = requests.post(f"{API}/compras", headers=admin_headers, json={
            "fecha": "2026-01-20", "proveedor": "ProvEne",
            "items": [{"producto_id": prod["id"], "nombre_producto": prod["nombre"],
                       "cantidad": 99.0, "unidad": "L", "precio_unitario": 100.0}],
        })
        assert rc2.status_code == 200
        cid_ene = rc2.json()["id"]

        rp = requests.post(f"{API}/pedidos/calcular", headers=admin_headers, json={
            "fecha_inicio": "2026-02-01", "fecha_fin": "2026-02-28",
            "modulo_ids": [modulo_id],
        })
        assert rp.status_code == 200, rp.text
        rows = rp.json()["items"]
        row = next(x for x in rows if x["producto_id"] == prod["id"])

        # necesito = 4 (solo plan, no la aplicada)
        assert row["necesito"] == 4.0, f"necesito esperado 4 (solo planes), got {row['necesito']}"
        # compras_en_rango = 7 (solo la de febrero)
        assert "compras_en_rango" in row
        assert row["compras_en_rango"] == 7.0, row

        # a_pedir = max(0, necesito - tengo)
        tengo = row["tengo"]
        expected_a_pedir = max(0.0, 4.0 - tengo)
        assert abs(row["cantidad_a_pedir"] - expected_a_pedir) < 0.001

        # cleanup
        requests.delete(f"{API}/bitacoras/{bid_plan}", headers=admin_headers)
        requests.delete(f"{API}/bitacoras/{bid_apl}", headers=admin_headers)
        requests.delete(f"{API}/compras/{cid_feb}", headers=admin_headers)
        requests.delete(f"{API}/compras/{cid_ene}", headers=admin_headers)


# ---------- Migración: bitácoras existentes con aplicada=True ----------
class TestMigracion:
    def test_existing_bitacoras_have_aplicada_field(self, admin_headers):
        # Listar todas las bitácoras existentes (puede que el usuario tenga datos previos)
        r = requests.get(f"{API}/bitacoras", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        # Todas las bitácoras devueltas deben tener el campo aplicada (no None/missing)
        for b in items:
            assert "aplicada" in b, f"bitacora {b.get('id')} no tiene campo aplicada"
            assert isinstance(b["aplicada"], bool)
