"""Backend API tests for AJVJ Fitosanidad - Iteration 2."""
import os
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@ajvj.com"
ADMIN_PASSWORD = "admin123"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="session")
def admin_headers():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def _ensure_user(admin_headers, email, pwd, rol, nombre):
    requests.post(f"{API}/users", headers=admin_headers, json={
        "email": email, "password": pwd, "nombre": nombre, "rol": rol,
    }, timeout=15)
    rl = _login(email, pwd)
    assert rl.status_code == 200, f"login {email} failed: {rl.text}"
    return {"Authorization": f"Bearer {rl.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def monitor_headers(admin_headers):
    return _ensure_user(admin_headers, "TEST_monitor@ajvj.com", "monitor123", "monitor", "Monitor Test")


@pytest.fixture(scope="session")
def jefe_headers(admin_headers):
    return _ensure_user(admin_headers, "TEST_jefe@ajvj.com", "jefe12345", "jefe", "Jefe Test")


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["rol"] == "admin"
        assert isinstance(d["access_token"], str) and len(d["access_token"]) > 20

    def test_login_invalid(self):
        r = _login(ADMIN_EMAIL, "wrong")
        assert r.status_code == 401

    def test_me_requires_token(self):
        assert requests.get(f"{API}/auth/me").status_code == 401

    def test_me_ok(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200 and r.json()["email"] == ADMIN_EMAIL


# ---------- Config ----------
class TestConfig:
    def test_config_has_monitor_field(self, admin_headers):
        r = requests.get(f"{API}/config", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "monitor" in d
        assert "jefe_produccion" not in d

    def test_put_config_monitor(self, admin_headers):
        payload = {
            "empresa": "AJVJ Hidropónicos", "razon_social": "AJVJ TEST",
            "asesor": "Asesor T", "monitor": "Mon T",
            "objetivos": ["plagas"], "categorias_producto": ["fungicida"],
        }
        r = requests.put(f"{API}/config", headers=admin_headers, json=payload)
        assert r.status_code == 200
        rg = requests.get(f"{API}/config", headers=admin_headers).json()
        assert rg["monitor"] == "Mon T"


# ---------- Productos dup validation ----------
class TestProductosDup:
    def test_duplicate_name_rejected(self, admin_headers):
        base_name = f"TEST_DUP_{datetime.now().strftime('%H%M%S%f')}"
        r1 = requests.post(f"{API}/productos", headers=admin_headers, json={
            "nombre": base_name, "categoria": "fungicida", "unidad_habitual": "L",
            "precio_unitario": 50.0, "dosis_habitual": 1.0,
        })
        assert r1.status_code == 200, r1.text
        pid = r1.json()["id"]
        # duplicate case-insensitive
        r2 = requests.post(f"{API}/productos", headers=admin_headers, json={
            "nombre": base_name.lower(), "unidad_habitual": "L",
        })
        assert r2.status_code == 400, r2.text
        # cleanup
        requests.delete(f"{API}/productos/{pid}", headers=admin_headers)


# ---------- Workspace + Compras multi-item + unit conv ----------
@pytest.fixture(scope="module")
def workspace(admin_headers):
    ts = datetime.now().strftime('%H%M%S%f')
    nombre_mod = f"TEST_MOD_{ts}"
    rm = requests.post(f"{API}/modulos", headers=admin_headers, json={
        "nombre": nombre_mod,
        "ciclos": [
            {"numero": 1, "cultivo": "jitomate", "variedad": "Saladette",
             "num_plantas": 1000, "superficie_m2": 1500, "caldo_foliar_L": 200, "activo": True},
        ],
    })
    assert rm.status_code == 200, rm.text
    modulo_id = rm.json()["id"]

    # Producto A en L (unidad_habitual L). Compramos en mL → convierte a L
    rp_a = requests.post(f"{API}/productos", headers=admin_headers, json={
        "nombre": f"TEST_PRODA_{ts}", "categoria": "fungicida", "unidad_habitual": "L",
        "precio_unitario": 100.0, "dosis_habitual": 1.0,
    })
    assert rp_a.status_code == 200, rp_a.text
    prod_a = rp_a.json()

    # Producto B en g (unidad_habitual g). Compramos en kg → convierte a g
    rp_b = requests.post(f"{API}/productos", headers=admin_headers, json={
        "nombre": f"TEST_PRODB_{ts}", "categoria": "insecticida", "unidad_habitual": "g",
        "precio_unitario": 2.0, "dosis_habitual": 1.0,
    })
    assert rp_b.status_code == 200, rp_b.text
    prod_b = rp_b.json()

    yield {"modulo_id": modulo_id, "prod_a": prod_a, "prod_b": prod_b, "ts": ts}

    requests.delete(f"{API}/modulos/{modulo_id}", headers=admin_headers)
    requests.delete(f"{API}/productos/{prod_a['id']}", headers=admin_headers)
    requests.delete(f"{API}/productos/{prod_b['id']}", headers=admin_headers)


class TestComprasMulti:
    def test_compra_multi_item_converts_units(self, admin_headers, workspace):
        pa, pb = workspace["prod_a"], workspace["prod_b"]
        # A: compra 2000 mL (→ 2 L). B: compra 1.5 kg (→ 1500 g).
        payload = {
            "fecha": "2026-01-10", "proveedor": "ProvMulti", "notas": "test",
            "items": [
                {"producto_id": pa["id"], "nombre_producto": pa["nombre"],
                 "cantidad": 2000, "unidad": "mL", "precio_unitario": 100.0},
                {"producto_id": pb["id"], "nombre_producto": pb["nombre"],
                 "cantidad": 1.5, "unidad": "kg", "precio_unitario": 2.0},
            ],
        }
        r = requests.post(f"{API}/compras", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        compra = r.json()
        # precio_total = 2L*100 + 1500g*2 = 200 + 3000 = 3200
        assert compra["precio_total"] == 3200.0, compra
        assert len(compra["items"]) == 2
        # Validar conversion info
        a_it = next(i for i in compra["items"] if i["producto_id"] == pa["id"])
        assert a_it["cantidad_convertida"] == 2.0
        assert a_it["unidad_base"] == "L"
        b_it = next(i for i in compra["items"] if i["producto_id"] == pb["id"])
        assert b_it["cantidad_convertida"] == 1500.0
        assert b_it["unidad_base"] == "g"

        # Inventario
        inv = requests.get(f"{API}/inventario", headers=admin_headers).json()
        inv_a = next(i for i in inv if i["producto_id"] == pa["id"])
        inv_b = next(i for i in inv if i["producto_id"] == pb["id"])
        assert inv_a["cantidad"] == 2.0 and inv_a["unidad"] == "L"
        assert inv_b["cantidad"] == 1500.0 and inv_b["unidad"] == "g"

        # DELETE compra revierte ambos items
        rd = requests.delete(f"{API}/compras/{compra['id']}", headers=admin_headers)
        assert rd.status_code == 200
        inv2 = requests.get(f"{API}/inventario", headers=admin_headers).json()
        inv_a2 = next(i for i in inv2 if i["producto_id"] == pa["id"])
        inv_b2 = next(i for i in inv2 if i["producto_id"] == pb["id"])
        assert inv_a2["cantidad"] == 0.0
        assert inv_b2["cantidad"] == 0.0


# ---------- Bitacoras batch + a_pedir ----------
class TestBitacorasBatchPedidos:
    def test_batch_creates_n_and_a_pedir(self, admin_headers, workspace):
        pa = workspace["prod_a"]
        # Re-aprovisionar: compra 5 L
        rc = requests.post(f"{API}/compras", headers=admin_headers, json={
            "fecha": "2026-01-05", "proveedor": "Prov",
            "items": [{"producto_id": pa["id"], "nombre_producto": pa["nombre"],
                       "cantidad": 5.0, "unidad": "L", "precio_unitario": 100.0}],
        })
        assert rc.status_code == 200, rc.text
        compra_id = rc.json()["id"]

        # Batch de 3 bitácoras, cada una consume 1 L
        def bit(fecha):
            return {
                "fecha": fecha, "tipo": "semanal", "semana_inicio": "2026-01-12",
                "modulo_id": workspace["modulo_id"], "ciclo_numero": 1,
                "aplicaciones": [{
                    "tipo": "foliar", "objetivo": "plagas",
                    "productos": [{
                        "producto_id": pa["id"], "nombre": pa["nombre"],
                        "dosis": 1, "unidad": "L/ha",
                        "cantidad_usada_total": 1.0, "costo_linea": 100.0,
                        "precio_unitario": 100.0,
                    }],
                }],
            }
        rb = requests.post(f"{API}/bitacoras/batch", headers=admin_headers, json={
            "bitacoras": [bit("2026-01-12"), bit("2026-01-13"), bit("2026-01-14")],
        })
        assert rb.status_code == 200, rb.text
        assert rb.json()["creadas"] == 3
        bit_ids = [b["id"] for b in rb.json()["bitacoras"]]

        # Inventario: 5 - 3 = 2
        inv = requests.get(f"{API}/inventario", headers=admin_headers).json()
        inv_a = next(i for i in inv if i["producto_id"] == pa["id"])
        assert inv_a["cantidad"] == 2.0

        # Pedidos: necesito 3, tengo 2, a_pedir = 1
        rp = requests.post(f"{API}/pedidos/calcular", headers=admin_headers, json={
            "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31",
            "modulo_ids": [workspace["modulo_id"]],
        })
        assert rp.status_code == 200
        row = next(x for x in rp.json()["items"] if x["producto_id"] == pa["id"])
        assert row["necesito"] == 3.0
        assert row["tengo"] == 2.0
        assert row["cantidad_a_pedir"] == 1.0

        # PDF simplificado
        rpdf = requests.post(f"{API}/pedidos/pdf", headers=admin_headers, json={
            "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31",
            "modulo_ids": [workspace["modulo_id"]],
        })
        assert rpdf.status_code == 200
        assert rpdf.content[:4] == b"%PDF"

        # Cleanup
        for bid in bit_ids:
            requests.delete(f"{API}/bitacoras/{bid}", headers=admin_headers)
        requests.delete(f"{API}/compras/{compra_id}", headers=admin_headers)

    def test_a_pedir_zero_when_stock_exceeds(self, admin_headers, workspace):
        pa = workspace["prod_a"]
        rc = requests.post(f"{API}/compras", headers=admin_headers, json={
            "fecha": "2026-01-06", "proveedor": "P",
            "items": [{"producto_id": pa["id"], "nombre_producto": pa["nombre"],
                       "cantidad": 20.0, "unidad": "L", "precio_unitario": 100.0}],
        })
        assert rc.status_code == 200
        cid = rc.json()["id"]
        # necesito 2 vs stock 20 → a_pedir 0
        rb = requests.post(f"{API}/bitacoras", headers=admin_headers, json={
            "fecha": "2026-01-15", "tipo": "individual",
            "modulo_id": workspace["modulo_id"], "ciclo_numero": 1,
            "aplicaciones": [{
                "tipo": "foliar", "objetivo": "plagas",
                "productos": [{
                    "producto_id": pa["id"], "nombre": pa["nombre"],
                    "dosis": 1, "unidad": "L/ha",
                    "cantidad_usada_total": 2.0, "costo_linea": 200.0, "precio_unitario": 100.0,
                }],
            }],
        })
        assert rb.status_code == 200
        bid = rb.json()["id"]
        rp = requests.post(f"{API}/pedidos/calcular", headers=admin_headers, json={
            "fecha_inicio": "2026-01-14", "fecha_fin": "2026-01-20",
            "modulo_ids": [workspace["modulo_id"]],
        })
        row = next(x for x in rp.json()["items"] if x["producto_id"] == pa["id"])
        assert row["cantidad_a_pedir"] == 0.0
        assert row["tengo"] >= row["necesito"]
        requests.delete(f"{API}/bitacoras/{bid}", headers=admin_headers)
        requests.delete(f"{API}/compras/{cid}", headers=admin_headers)


# ---------- Dashboard RBAC + normalization ----------
class TestDashboard:
    def test_dashboard_admin_only(self, admin_headers, monitor_headers, jefe_headers):
        r_adm = requests.get(f"{API}/dashboard/stats", headers=admin_headers)
        assert r_adm.status_code == 200
        r_mon = requests.get(f"{API}/dashboard/stats", headers=monitor_headers)
        assert r_mon.status_code == 403
        r_jefe = requests.get(f"{API}/dashboard/stats", headers=jefe_headers)
        assert r_jefe.status_code == 403

    def test_cultivo_normalized_and_variedad(self, admin_headers, workspace):
        d = requests.get(f"{API}/dashboard/stats", headers=admin_headers).json()
        assert "costo_por_cultivo" in d and "costo_por_cultivo_variedad" in d
        # Keys normalizadas: "jitomate" -> "Jitomate"
        names = [x["name"] for x in d["costo_por_cultivo"]]
        assert all(n == n[:1].upper() + n[1:].lower() or n == "Sin asignar" for n in names), names


# ---------- Inventario ajustes con jefe y pendientes ----------
class TestAjustes:
    @pytest.fixture(scope="class")
    def ajuste_prod(self, admin_headers):
        ts = datetime.now().strftime('%H%M%S%f')
        rp = requests.post(f"{API}/productos", headers=admin_headers, json={
            "nombre": f"TEST_AJU_{ts}", "categoria": "fungicida", "unidad_habitual": "L",
            "precio_unitario": 10.0, "dosis_habitual": 1.0,
        })
        assert rp.status_code == 200, rp.text
        pid = rp.json()["id"]
        yield pid
        requests.delete(f"{API}/productos/{pid}", headers=admin_headers)

    def test_ajuste_admin_revisado_true(self, admin_headers, ajuste_prod):
        r = requests.post(f"{API}/inventario/ajuste", headers=admin_headers, json={
            "producto_id": ajuste_prod, "nueva_cantidad": 25.0, "justificacion": "admin TEST",
        })
        assert r.status_code == 200
        assert r.json()["requiere_revision"] is False

    def test_ajuste_jefe_requires_review(self, admin_headers, jefe_headers, ajuste_prod):
        r = requests.post(f"{API}/inventario/ajuste", headers=jefe_headers, json={
            "producto_id": ajuste_prod, "nueva_cantidad": 30.0, "justificacion": "jefe TEST",
        })
        assert r.status_code == 200, r.text
        assert r.json()["requiere_revision"] is True
        # Admin ve ajuste pendiente
        rp = requests.get(f"{API}/inventario/ajustes/pendientes", headers=admin_headers)
        assert rp.status_code == 200
        pend = rp.json()
        mine = [m for m in pend if m["producto_id"] == ajuste_prod and not m.get("revisado")]
        assert len(mine) >= 1
        mov_id = mine[0]["id"]
        # Marcar revisado
        rr = requests.post(f"{API}/inventario/ajustes/{mov_id}/revisar", headers=admin_headers)
        assert rr.status_code == 200
        # Ya no debe estar en pendientes
        pend2 = requests.get(f"{API}/inventario/ajustes/pendientes", headers=admin_headers).json()
        assert all(m["id"] != mov_id for m in pend2)

    def test_monitor_cannot_ajustar(self, monitor_headers, ajuste_prod):
        r = requests.post(f"{API}/inventario/ajuste", headers=monitor_headers, json={
            "producto_id": ajuste_prod, "nueva_cantidad": 1.0, "justificacion": "x",
        })
        assert r.status_code == 403

    def test_monitor_cannot_see_pendientes(self, monitor_headers):
        r = requests.get(f"{API}/inventario/ajustes/pendientes", headers=monitor_headers)
        assert r.status_code == 403
