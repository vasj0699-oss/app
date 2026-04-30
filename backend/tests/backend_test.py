"""Backend API tests for AJVJ Fitosanidad."""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agroquim-control.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@ajvj.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    assert data["user"]["rol"] == "admin"
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def monitor_user(admin_headers):
    """Crea (o reutiliza) un usuario monitor para tests de permisos."""
    email = "TEST_monitor@ajvj.com"
    pwd = "monitor123"
    # try create
    r = requests.post(f"{API}/users", headers=admin_headers, json={
        "email": email, "password": pwd, "nombre": "Monitor Test", "rol": "monitor",
    }, timeout=15)
    if r.status_code == 400:
        # Already exists - that's fine for re-runs
        pass
    else:
        assert r.status_code == 200, r.text
    # login
    rl = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert rl.status_code == 200, rl.text
    return {"email": email, "token": rl.json()["access_token"], "id": rl.json()["user"]["id"]}


@pytest.fixture(scope="session")
def monitor_headers(monitor_user):
    return {"Authorization": f"Bearer {monitor_user['token']}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert d["token_type"] == "bearer"
        assert d["user"]["email"] == ADMIN_EMAIL
        assert d["user"]["rol"] == "admin"
        assert isinstance(d["access_token"], str) and len(d["access_token"]) > 20

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_requires_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_ok(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ---------- Users ----------
class TestUsers:
    def test_list_users_admin(self, admin_headers):
        r = requests.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_and_delete_user(self, admin_headers):
        email = "TEST_delete_me@ajvj.com"
        # cleanup if exists
        users = requests.get(f"{API}/users", headers=admin_headers).json()
        for u in users:
            if u["email"] == email:
                requests.delete(f"{API}/users/{u['id']}", headers=admin_headers)
        r = requests.post(f"{API}/users", headers=admin_headers, json={
            "email": email, "password": "x12345", "nombre": "Borrar", "rol": "monitor",
        })
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        assert r.json()["rol"] == "monitor"
        rd = requests.delete(f"{API}/users/{uid}", headers=admin_headers)
        assert rd.status_code == 200


# ---------- Config ----------
class TestConfig:
    def test_put_get_config(self, admin_headers):
        payload = {
            "empresa": "AJVJ Hidropónicos", "razon_social": "AJVJ TEST SPR",
            "asesor": "Asesor T", "jefe_produccion": "Jefe T",
            "objetivos": ["plagas", "fungoso"],
            "categorias_producto": ["fungicida", "insecticida"],
        }
        r = requests.put(f"{API}/config", headers=admin_headers, json=payload)
        assert r.status_code == 200
        rg = requests.get(f"{API}/config", headers=admin_headers)
        assert rg.status_code == 200
        d = rg.json()
        assert "plagas" in d["objetivos"]
        assert "fungicida" in d["categorias_producto"]


# ---------- Modulos / Productos / Compras / Bitacoras / Pedidos / Dashboard ----------
class TestE2E:
    @pytest.fixture(scope="class")
    def workspace(self, admin_headers):
        """Crea modulo+producto+compra+bitacora y devuelve ids para validaciones cruzadas."""
        nombre_mod = f"TEST_MOD_{datetime.now().strftime('%H%M%S%f')}"
        # módulo
        rm = requests.post(f"{API}/modulos", headers=admin_headers, json={
            "nombre": nombre_mod,
            "ciclos": [{
                "numero": 1, "cultivo": "Tomate", "variedad": "Roma",
                "num_plantas": 1000, "superficie_m2": 1500,
                "caldo_foliar_L": 200, "activo": True,
            }],
        })
        assert rm.status_code == 200, rm.text
        modulo_id = rm.json()["id"]

        # producto
        rp = requests.post(f"{API}/productos", headers=admin_headers, json={
            "nombre": f"TEST_PROD_{datetime.now().strftime('%H%M%S%f')}",
            "categoria": "fungicida", "dosis_habitual": 1.0, "unidad_habitual": "L",
            "precio_unitario": 100.0,
        })
        assert rp.status_code == 200, rp.text
        producto_id = rp.json()["id"]
        nombre_prod = rp.json()["nombre"]

        # compra (suma 10 L)
        rc = requests.post(f"{API}/compras", headers=admin_headers, json={
            "fecha": "2026-01-10", "producto_id": producto_id, "nombre_producto": nombre_prod,
            "cantidad": 10.0, "unidad": "L", "precio_unitario": 100.0, "proveedor": "Prov",
        })
        assert rc.status_code == 200, rc.text
        assert rc.json()["precio_total"] == 1000.0

        yield {
            "modulo_id": modulo_id, "producto_id": producto_id, "nombre_prod": nombre_prod,
        }

        # cleanup
        requests.delete(f"{API}/modulos/{modulo_id}", headers=admin_headers)
        requests.delete(f"{API}/productos/{producto_id}", headers=admin_headers)

    def test_modulo_listed(self, admin_headers, workspace):
        r = requests.get(f"{API}/modulos", headers=admin_headers)
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert workspace["modulo_id"] in ids

    def test_inventario_after_compra(self, admin_headers, workspace):
        r = requests.get(f"{API}/inventario", headers=admin_headers)
        assert r.status_code == 200
        item = next((i for i in r.json() if i["producto_id"] == workspace["producto_id"]), None)
        assert item is not None
        assert item["cantidad"] == 10.0

    def test_bitacora_descuenta_inventario(self, admin_headers, workspace):
        # bitacora consume 2 L
        rb = requests.post(f"{API}/bitacoras", headers=admin_headers, json={
            "fecha": "2026-01-12", "tipo": "individual",
            "modulo_id": workspace["modulo_id"], "ciclo_numero": 1,
            "asesor": "A", "monitor": "M",
            "aplicaciones": [{
                "tipo": "foliar", "objetivo": "plagas",
                "productos": [{
                    "producto_id": workspace["producto_id"], "nombre": workspace["nombre_prod"],
                    "dosis": 10, "unidad": "mL/L", "cantidad_usada_total": 2.0,
                    "costo_linea": 200.0, "precio_unitario": 100.0,
                }],
            }],
        })
        assert rb.status_code == 200, rb.text
        bit = rb.json()
        assert bit["costo_total_bitacora"] == 200.0
        bit_id = bit["id"]

        # Verificar inventario = 10 - 2 = 8
        r = requests.get(f"{API}/inventario", headers=admin_headers)
        item = next(i for i in r.json() if i["producto_id"] == workspace["producto_id"])
        assert item["cantidad"] == 8.0

        # Pedidos calcular: necesito 2, tengo 8, dif -6
        rp = requests.post(f"{API}/pedidos/calcular", headers=admin_headers, json={
            "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31",
            "modulo_ids": [workspace["modulo_id"]],
        })
        assert rp.status_code == 200, rp.text
        rows = rp.json()["items"]
        prod_row = next((x for x in rows if x["producto_id"] == workspace["producto_id"]), None)
        assert prod_row is not None
        assert prod_row["necesito"] == 2.0
        assert prod_row["tengo"] == 8.0
        assert prod_row["diferencia"] == -6.0
        assert prod_row["cantidad_a_pedir"] == 0.0

        # PDF
        rpdf = requests.post(f"{API}/pedidos/pdf", headers=admin_headers, json={
            "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31",
            "modulo_ids": [workspace["modulo_id"]],
        })
        assert rpdf.status_code == 200
        assert rpdf.headers.get("content-type", "").startswith("application/pdf")
        assert rpdf.content[:4] == b"%PDF"

        # Dashboard
        rd = requests.get(f"{API}/dashboard/stats", headers=admin_headers)
        assert rd.status_code == 200
        d = rd.json()
        assert "kpis" in d
        for k in ["costo_por_modulo", "costo_por_objetivo", "costo_por_cultivo",
                  "costo_por_tipo", "costo_por_mes", "top_productos_cantidad",
                  "top_productos_costo", "inventario_valorizado"]:
            assert k in d, f"missing {k}"

        # Eliminar bitácora -> revertir inventario a 10
        rdel = requests.delete(f"{API}/bitacoras/{bit_id}", headers=admin_headers)
        assert rdel.status_code == 200
        r2 = requests.get(f"{API}/inventario", headers=admin_headers)
        item2 = next(i for i in r2.json() if i["producto_id"] == workspace["producto_id"])
        assert item2["cantidad"] == 10.0

    def test_inventario_ajuste(self, admin_headers, workspace):
        r = requests.post(f"{API}/inventario/ajuste", headers=admin_headers, json={
            "producto_id": workspace["producto_id"], "nueva_cantidad": 50.0,
            "justificacion": "Conteo físico TEST",
        })
        assert r.status_code == 200
        assert r.json()["nueva_cantidad"] == 50.0
        rg = requests.get(f"{API}/inventario", headers=admin_headers)
        item = next(i for i in rg.json() if i["producto_id"] == workspace["producto_id"])
        assert item["cantidad"] == 50.0


# ---------- Permissions ----------
class TestPermissions:
    def test_monitor_cannot_create_user(self, monitor_headers):
        r = requests.post(f"{API}/users", headers=monitor_headers, json={
            "email": "TEST_x@x.com", "password": "x", "nombre": "x", "rol": "monitor",
        })
        assert r.status_code == 403

    def test_monitor_cannot_create_modulo(self, monitor_headers):
        r = requests.post(f"{API}/modulos", headers=monitor_headers, json={"nombre": "TEST_no", "ciclos": []})
        assert r.status_code == 403

    def test_monitor_cannot_create_producto(self, monitor_headers):
        r = requests.post(f"{API}/productos", headers=monitor_headers, json={"nombre": "TEST_no_p"})
        assert r.status_code == 403

    def test_monitor_cannot_ajuste(self, monitor_headers):
        r = requests.post(f"{API}/inventario/ajuste", headers=monitor_headers, json={
            "producto_id": "x", "nueva_cantidad": 1.0, "justificacion": "x",
        })
        assert r.status_code == 403

    def test_monitor_can_read_modulos(self, monitor_headers):
        r = requests.get(f"{API}/modulos", headers=monitor_headers)
        assert r.status_code == 200
