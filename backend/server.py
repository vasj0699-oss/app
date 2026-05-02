from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

# ---------- Setup ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

app = FastAPI(title="AJVJ Fitosanidad API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("ajvj")

# ---------- Helpers ----------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False

def create_token(user_id: str, email: str, rol: str) -> str:
    payload = {
        "sub": user_id, "email": email, "rol": rol,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

def convertir_unidad(cantidad: float, desde: str, hacia: str) -> Optional[float]:
    """Convierte cantidad entre unidades del mismo tipo. None si son incompatibles."""
    if cantidad is None:
        return 0
    if desde == hacia:
        return cantidad
    # Volumen L <-> mL
    if desde == "L" and hacia == "mL":
        return cantidad * 1000
    if desde == "mL" and hacia == "L":
        return cantidad / 1000
    # Masa kg <-> g
    if desde == "kg" and hacia == "g":
        return cantidad * 1000
    if desde == "g" and hacia == "kg":
        return cantidad / 1000
    return None

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") != "admin":
        raise HTTPException(status_code=403, detail="Se requiere rol admin")
    return user

def require_admin_or_jefe(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ("admin", "jefe"):
        raise HTTPException(status_code=403, detail="Rol insuficiente")
    return user

# ---------- Models ----------
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    nombre: str
    rol: Literal["admin", "monitor", "jefe"] = "monitor"

class UserOut(BaseModel):
    id: str
    email: str
    nombre: str
    rol: str
    creado_en: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class ConfigDoc(BaseModel):
    empresa: str = "AJVJ Hidropónicos"
    razon_social: str = "AJVJ Hidropónicos SPR DE RI DE CV"
    asesor: str = ""
    monitor: str = ""  # antes jefe_produccion
    objetivos: List[str] = []
    categorias_producto: List[str] = []

class CicloIn(BaseModel):
    numero: int
    cultivo: str = ""
    variedad: str = ""
    num_plantas: float = 0
    superficie_m2: float = 0
    caldo_foliar_L: float = 0
    fecha_trasplante: Optional[str] = None
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    activo: bool = True

class ModuloIn(BaseModel):
    nombre: str
    ciclos: List[CicloIn] = []

class ModuloOut(ModuloIn):
    id: str

class ProductoIn(BaseModel):
    nombre: str
    categoria: str = ""
    dosis_habitual: float = 0
    unidad_habitual: str = "L"  # unidad base del inventario / precio_unitario
    precio_unitario: float = 0  # $ por unidad_habitual
    notas: str = ""

class ProductoOut(ProductoIn):
    id: str

class ProductoAplicado(BaseModel):
    producto_id: str
    nombre: str
    dosis: float
    unidad: str
    cantidad_usada_total: float
    costo_linea: float
    precio_unitario: float = 0

class AplicacionIn(BaseModel):
    tipo: Literal["foliar", "suelo", "drench", "riego"]
    objetivo: str
    productos: List[ProductoAplicado]
    costo_total_aplicacion: float = 0

class BitacoraIn(BaseModel):
    fecha: str
    semana_inicio: Optional[str] = None
    tipo: Literal["semanal", "individual"] = "individual"
    modulo_id: str
    ciclo_numero: int
    asesor: str = ""
    monitor: str = ""
    aplicaciones: List[AplicacionIn]
    notas: str = ""

class BitacoraOut(BitacoraIn):
    id: str
    costo_total_bitacora: float
    guardada_en: str
    creado_por: Optional[str] = None

class BitacoraBatchIn(BaseModel):
    bitacoras: List[BitacoraIn]

class CompraItemIn(BaseModel):
    producto_id: str
    nombre_producto: str
    cantidad: float  # en la unidad capturada (CompraItemIn.unidad)
    unidad: str  # unidad capturada (L, mL, kg, g)
    precio_unitario: float  # precio por unidad_habitual del producto

class CompraIn(BaseModel):
    fecha: str
    proveedor: str = ""
    notas: str = ""
    items: List[CompraItemIn]

class CompraOut(BaseModel):
    id: str
    fecha: str
    proveedor: str = ""
    notas: str = ""
    items: List[dict]
    precio_total: float
    creado_por: str
    creado_en: str

class AjusteInventarioIn(BaseModel):
    producto_id: str
    nueva_cantidad: float
    justificacion: str = ""

class PedidoQueryIn(BaseModel):
    fecha_inicio: str
    fecha_fin: str
    modulo_ids: List[str] = []

# ---------- Auth Endpoints ----------
@api.post("/auth/login", response_model=TokenOut)
async def login(payload: LoginIn):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_token(user["id"], user["email"], user["rol"])
    return TokenOut(
        access_token=token,
        user=UserOut(id=user["id"], email=user["email"], nombre=user["nombre"], rol=user["rol"], creado_en=user["creado_en"]),
    )

@api.get("/auth/me", response_model=UserOut)
async def auth_me(user: dict = Depends(get_current_user)):
    return UserOut(**user)

# ---------- Users (admin) ----------
@api.get("/users", response_model=List[UserOut])
async def list_users(_: dict = Depends(require_admin)):
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("creado_en", -1).to_list(500)
    return items

@api.post("/users", response_model=UserOut)
async def create_user(payload: UserCreate, _: dict = Depends(require_admin)):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")
    u = {
        "id": new_id(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "nombre": payload.nombre,
        "rol": payload.rol,
        "creado_en": now_iso(),
    }
    await db.users.insert_one(u)
    return UserOut(id=u["id"], email=u["email"], nombre=u["nombre"], rol=u["rol"], creado_en=u["creado_en"])

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, current: dict = Depends(require_admin)):
    if user_id == current["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}

# ---------- Config ----------
@api.get("/config", response_model=ConfigDoc)
async def get_config(_: dict = Depends(get_current_user)):
    cfg = await db.config.find_one({"id": "main"}, {"_id": 0, "id": 0})
    if not cfg:
        cfg = ConfigDoc().model_dump()
    # Migración suave: si existe campo antiguo jefe_produccion, migrar a monitor
    if "jefe_produccion" in cfg and not cfg.get("monitor"):
        cfg["monitor"] = cfg.pop("jefe_produccion")
    cfg.pop("jefe_produccion", None)
    return ConfigDoc(**cfg)

@api.put("/config", response_model=ConfigDoc)
async def put_config(payload: ConfigDoc, _: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = "main"
    await db.config.update_one({"id": "main"}, {"$set": doc}, upsert=True)
    return payload

# ---------- Modulos ----------
@api.get("/modulos", response_model=List[ModuloOut])
async def list_modulos(_: dict = Depends(get_current_user)):
    items = await db.modulos.find({}, {"_id": 0}).sort("nombre", 1).to_list(100)
    return items

@api.post("/modulos", response_model=ModuloOut)
async def create_modulo(payload: ModuloIn, _: dict = Depends(require_admin)):
    if await db.modulos.find_one({"nombre": payload.nombre}):
        raise HTTPException(status_code=400, detail="Ya existe un módulo con ese nombre")
    doc = payload.model_dump()
    doc["id"] = new_id()
    await db.modulos.insert_one(doc.copy())
    return ModuloOut(**doc)

@api.put("/modulos/{modulo_id}", response_model=ModuloOut)
async def update_modulo(modulo_id: str, payload: ModuloIn, _: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["id"] = modulo_id
    res = await db.modulos.update_one({"id": modulo_id}, {"$set": doc})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    return ModuloOut(**doc)

@api.delete("/modulos/{modulo_id}")
async def delete_modulo(modulo_id: str, _: dict = Depends(require_admin)):
    await db.modulos.delete_one({"id": modulo_id})
    return {"ok": True}

# ---------- Productos ----------
@api.get("/productos", response_model=List[ProductoOut])
async def list_productos(_: dict = Depends(get_current_user)):
    items = await db.productos.find({}, {"_id": 0}).sort("nombre", 1).to_list(2000)
    return items

@api.post("/productos", response_model=ProductoOut)
async def create_producto(payload: ProductoIn, _: dict = Depends(require_admin)):
    # Validar duplicado por nombre (case-insensitive)
    existing = await db.productos.find_one({"nombre": {"$regex": f"^{payload.nombre.strip()}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un producto con el nombre '{payload.nombre.strip()}'")
    doc = payload.model_dump()
    doc["nombre"] = payload.nombre.strip()
    doc["id"] = new_id()
    await db.productos.insert_one(doc.copy())
    await db.inventario.update_one(
        {"producto_id": doc["id"]},
        {"$setOnInsert": {
            "producto_id": doc["id"], "nombre": doc["nombre"],
            "cantidad": 0, "unidad": doc["unidad_habitual"],
            "ultima_actualizacion": now_iso(),
        }},
        upsert=True,
    )
    return ProductoOut(**doc)

@api.put("/productos/{producto_id}", response_model=ProductoOut)
async def update_producto(producto_id: str, payload: ProductoIn, _: dict = Depends(require_admin)):
    # Validar duplicado en otro id
    existing = await db.productos.find_one({
        "nombre": {"$regex": f"^{payload.nombre.strip()}$", "$options": "i"},
        "id": {"$ne": producto_id},
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Otro producto ya usa el nombre '{payload.nombre.strip()}'")
    doc = payload.model_dump()
    doc["nombre"] = payload.nombre.strip()
    doc["id"] = producto_id
    res = await db.productos.update_one({"id": producto_id}, {"$set": doc})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    await db.inventario.update_one({"producto_id": producto_id}, {"$set": {"nombre": doc["nombre"], "unidad": doc["unidad_habitual"]}})
    return ProductoOut(**doc)

@api.delete("/productos/{producto_id}")
async def delete_producto(producto_id: str, _: dict = Depends(require_admin)):
    await db.productos.delete_one({"id": producto_id})
    await db.inventario.delete_one({"producto_id": producto_id})
    return {"ok": True}

# ---------- Inventario ----------
@api.get("/inventario")
async def list_inventario(_: dict = Depends(get_current_user)):
    items = await db.inventario.find({}, {"_id": 0}).sort("nombre", 1).to_list(2000)
    return items

@api.get("/inventario/{producto_id}/movimientos")
async def list_movimientos(producto_id: str, _: dict = Depends(get_current_user)):
    items = await db.movimientos.find({"producto_id": producto_id}, {"_id": 0}).sort("fecha", -1).to_list(500)
    return items

@api.post("/inventario/ajuste")
async def ajuste_manual(payload: AjusteInventarioIn, user: dict = Depends(require_admin_or_jefe)):
    """Admin y Jefe pueden ajustar. Si no es admin, se marca para revisión."""
    inv = await db.inventario.find_one({"producto_id": payload.producto_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Producto no encontrado en inventario")
    diff = payload.nueva_cantidad - inv["cantidad"]
    await db.inventario.update_one(
        {"producto_id": payload.producto_id},
        {"$set": {"cantidad": payload.nueva_cantidad, "ultima_actualizacion": now_iso()}},
    )
    await db.movimientos.insert_one({
        "id": new_id(),
        "tipo": "ajuste",
        "producto_id": payload.producto_id,
        "nombre_producto": inv["nombre"],
        "cantidad": diff,
        "unidad": inv["unidad"],
        "referencia": "ajuste_manual",
        "justificacion": payload.justificacion,
        "fecha": now_iso(),
        "usuario": user["email"],
        "rol_usuario": user.get("rol", "monitor"),
        "revisado": user.get("rol") == "admin",  # admin: auto-revisado
        "cantidad_anterior": inv["cantidad"],
        "cantidad_nueva": payload.nueva_cantidad,
    })
    return {"ok": True, "nueva_cantidad": payload.nueva_cantidad, "requiere_revision": user.get("rol") != "admin"}

@api.get("/inventario/ajustes/pendientes")
async def ajustes_pendientes(_: dict = Depends(require_admin)):
    items = await db.movimientos.find(
        {"tipo": "ajuste", "revisado": False}, {"_id": 0}
    ).sort("fecha", -1).to_list(200)
    return items

@api.post("/inventario/ajustes/{mov_id}/revisar")
async def marcar_revisado(mov_id: str, _: dict = Depends(require_admin)):
    await db.movimientos.update_one({"id": mov_id}, {"$set": {"revisado": True}})
    return {"ok": True}

# ---------- Compras ----------
async def _aplicar_compra_item(item: dict, user_email: str, fecha: str, compra_id: str):
    """Aplica un ítem de compra al inventario: convierte a unidad habitual y crea movimiento."""
    prod = await db.productos.find_one({"id": item["producto_id"]}, {"_id": 0})
    unidad_base = prod["unidad_habitual"] if prod else item["unidad"]
    cantidad_convertida = convertir_unidad(item["cantidad"], item["unidad"], unidad_base)
    if cantidad_convertida is None:
        cantidad_convertida = item["cantidad"]  # fallback si unidades incompatibles
        unidad_base = item["unidad"]
    inv = await db.inventario.find_one({"producto_id": item["producto_id"]}, {"_id": 0})
    if inv:
        await db.inventario.update_one(
            {"producto_id": item["producto_id"]},
            {"$set": {"cantidad": inv["cantidad"] + cantidad_convertida, "unidad": unidad_base, "ultima_actualizacion": now_iso()}},
        )
    else:
        await db.inventario.insert_one({
            "producto_id": item["producto_id"],
            "nombre": item["nombre_producto"],
            "cantidad": cantidad_convertida,
            "unidad": unidad_base,
            "ultima_actualizacion": now_iso(),
        })
    await db.movimientos.insert_one({
        "id": new_id(),
        "tipo": "entrada",
        "producto_id": item["producto_id"],
        "nombre_producto": item["nombre_producto"],
        "cantidad": cantidad_convertida,
        "unidad": unidad_base,
        "cantidad_original": item["cantidad"],
        "unidad_original": item["unidad"],
        "referencia": f"compra:{compra_id}",
        "fecha": fecha,
        "usuario": user_email,
    })
    # Actualizar precio del producto (precio por unidad habitual)
    if prod:
        await db.productos.update_one(
            {"id": item["producto_id"]},
            {"$set": {"precio_unitario": item["precio_unitario"]}},
        )
    return cantidad_convertida, unidad_base

@api.get("/compras", response_model=List[CompraOut])
async def list_compras(_: dict = Depends(get_current_user)):
    items = await db.compras.find({}, {"_id": 0}).sort("fecha", -1).to_list(2000)
    return items

@api.post("/compras", response_model=CompraOut)
async def create_compra(payload: CompraIn, user: dict = Depends(get_current_user)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Debe incluir al menos un producto")
    compra_id = new_id()
    items_out = []
    precio_total = 0.0
    for item in payload.items:
        item_dict = item.model_dump()
        # Calcular precio_total del item: cantidad convertida a unidad_habitual * precio_unitario
        prod = await db.productos.find_one({"id": item.producto_id}, {"_id": 0})
        unidad_base = prod["unidad_habitual"] if prod else item.unidad
        cant_convertida = convertir_unidad(item.cantidad, item.unidad, unidad_base)
        if cant_convertida is None:
            cant_convertida = item.cantidad
        item_dict["cantidad_convertida"] = round(cant_convertida, 4)
        item_dict["unidad_base"] = unidad_base
        item_dict["precio_total_item"] = round(cant_convertida * item.precio_unitario, 4)
        precio_total += item_dict["precio_total_item"]
        items_out.append(item_dict)
        await _aplicar_compra_item(item.model_dump(), user["email"], payload.fecha, compra_id)

    doc = {
        "id": compra_id,
        "fecha": payload.fecha,
        "proveedor": payload.proveedor,
        "notas": payload.notas,
        "items": items_out,
        "precio_total": round(precio_total, 2),
        "creado_por": user["email"],
        "creado_en": now_iso(),
    }
    await db.compras.insert_one(doc.copy())
    return CompraOut(**doc)

@api.delete("/compras/{compra_id}")
async def delete_compra(compra_id: str, _: dict = Depends(require_admin)):
    compra = await db.compras.find_one({"id": compra_id}, {"_id": 0})
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    # Revertir inventario por cada item
    for item in compra.get("items", []):
        pid = item["producto_id"]
        cant = item.get("cantidad_convertida", item["cantidad"])
        inv = await db.inventario.find_one({"producto_id": pid}, {"_id": 0})
        if inv:
            await db.inventario.update_one(
                {"producto_id": pid},
                {"$set": {"cantidad": inv["cantidad"] - cant, "ultima_actualizacion": now_iso()}},
            )
    await db.movimientos.delete_many({"referencia": f"compra:{compra_id}"})
    await db.compras.delete_one({"id": compra_id})
    return {"ok": True}

# ---------- Bitácoras ----------
async def _crear_bitacora(payload: BitacoraIn, user_email: str) -> dict:
    bit_id = new_id()
    costo_total = 0.0
    aplicaciones = []
    for ap in payload.aplicaciones:
        ap_total = 0.0
        for p in ap.productos:
            ap_total += p.costo_linea
        ap_dict = ap.model_dump()
        ap_dict["costo_total_aplicacion"] = round(ap_total, 4)
        aplicaciones.append(ap_dict)
        costo_total += ap_total
    doc = payload.model_dump()
    doc["id"] = bit_id
    doc["aplicaciones"] = aplicaciones
    doc["costo_total_bitacora"] = round(costo_total, 4)
    doc["guardada_en"] = now_iso()
    doc["creado_por"] = user_email
    await db.bitacoras.insert_one(doc.copy())
    # Descontar inventario
    for ap in aplicaciones:
        for p in ap["productos"]:
            inv = await db.inventario.find_one({"producto_id": p["producto_id"]}, {"_id": 0})
            cantidad = float(p["cantidad_usada_total"])
            if inv:
                await db.inventario.update_one(
                    {"producto_id": p["producto_id"]},
                    {"$set": {"cantidad": inv["cantidad"] - cantidad, "ultima_actualizacion": now_iso()}},
                )
            else:
                await db.inventario.insert_one({
                    "producto_id": p["producto_id"],
                    "nombre": p["nombre"],
                    "cantidad": -cantidad,
                    "unidad": p["unidad"],
                    "ultima_actualizacion": now_iso(),
                })
            await db.movimientos.insert_one({
                "id": new_id(),
                "tipo": "salida",
                "producto_id": p["producto_id"],
                "nombre_producto": p["nombre"],
                "cantidad": cantidad,
                "unidad": p["unidad"],
                "referencia": f"bitacora:{bit_id}",
                "fecha": doc["fecha"],
                "usuario": user_email,
            })
    return doc

@api.get("/bitacoras", response_model=List[BitacoraOut])
async def list_bitacoras(
    modulo_id: Optional[str] = None,
    ciclo_numero: Optional[int] = None,
    cultivo: Optional[str] = None,
    producto_id: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    q: dict = {}
    if modulo_id:
        q["modulo_id"] = modulo_id
    if ciclo_numero is not None:
        q["ciclo_numero"] = ciclo_numero
    if producto_id:
        q["aplicaciones.productos.producto_id"] = producto_id
    if fecha_inicio or fecha_fin:
        q["fecha"] = {}
        if fecha_inicio:
            q["fecha"]["$gte"] = fecha_inicio
        if fecha_fin:
            q["fecha"]["$lte"] = fecha_fin
    items = await db.bitacoras.find(q, {"_id": 0}).sort("fecha", -1).to_list(2000)
    if cultivo:
        modulos = {m["id"]: m for m in await db.modulos.find({}, {"_id": 0}).to_list(100)}
        filt = []
        cultivo_norm = cultivo.strip().lower()
        for b in items:
            m = modulos.get(b["modulo_id"])
            if not m:
                continue
            ciclo = next((c for c in m.get("ciclos", []) if c.get("numero") == b.get("ciclo_numero")), None)
            if ciclo and ciclo.get("cultivo", "").strip().lower() == cultivo_norm:
                filt.append(b)
        items = filt
    return items

@api.post("/bitacoras", response_model=BitacoraOut)
async def create_bitacora(payload: BitacoraIn, user: dict = Depends(get_current_user)):
    doc = await _crear_bitacora(payload, user["email"])
    return BitacoraOut(**doc)

@api.post("/bitacoras/batch")
async def create_bitacoras_batch(payload: BitacoraBatchIn, user: dict = Depends(get_current_user)):
    """Crea múltiples bitácoras (p.ej. semanal 7 días × N módulos)."""
    creadas = []
    for b in payload.bitacoras:
        doc = await _crear_bitacora(b, user["email"])
        creadas.append({"id": doc["id"], "fecha": doc["fecha"], "modulo_id": doc["modulo_id"]})
    return {"ok": True, "creadas": len(creadas), "bitacoras": creadas}

@api.get("/bitacoras/{bit_id}", response_model=BitacoraOut)
async def get_bitacora(bit_id: str, _: dict = Depends(get_current_user)):
    b = await db.bitacoras.find_one({"id": bit_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bitácora no encontrada")
    return b

@api.delete("/bitacoras/{bit_id}")
async def delete_bitacora(bit_id: str, _: dict = Depends(require_admin)):
    b = await db.bitacoras.find_one({"id": bit_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Bitácora no encontrada")
    movs = await db.movimientos.find({"referencia": f"bitacora:{bit_id}"}, {"_id": 0}).to_list(2000)
    for m in movs:
        inv = await db.inventario.find_one({"producto_id": m["producto_id"]}, {"_id": 0})
        if inv:
            await db.inventario.update_one(
                {"producto_id": m["producto_id"]},
                {"$set": {"cantidad": inv["cantidad"] + m["cantidad"], "ultima_actualizacion": now_iso()}},
            )
    await db.movimientos.delete_many({"referencia": f"bitacora:{bit_id}"})
    await db.bitacoras.delete_one({"id": bit_id})
    return {"ok": True}

# ---------- Pedidos ----------
async def _calcular_pedido(fecha_inicio: str, fecha_fin: str, modulo_ids: List[str]):
    q: dict = {"fecha": {"$gte": fecha_inicio, "$lte": fecha_fin}}
    if modulo_ids:
        q["modulo_id"] = {"$in": modulo_ids}
    bitacoras = await db.bitacoras.find(q, {"_id": 0}).to_list(5000)

    requerido: dict = {}
    for b in bitacoras:
        for ap in b.get("aplicaciones", []):
            for p in ap.get("productos", []):
                pid = p["producto_id"]
                requerido.setdefault(pid, {
                    "producto_id": pid, "nombre": p["nombre"], "unidad": p["unidad"],
                    "necesito": 0.0, "precio_unitario": p.get("precio_unitario", 0),
                })
                requerido[pid]["necesito"] += float(p["cantidad_usada_total"])

    inventario = {i["producto_id"]: i for i in await db.inventario.find({}, {"_id": 0}).to_list(2000)}
    productos_cat = {p["id"]: p for p in await db.productos.find({}, {"_id": 0}).to_list(2000)}

    rows = []
    for pid, r in requerido.items():
        inv = inventario.get(pid, {"cantidad": 0, "unidad": r["unidad"]})
        cat = productos_cat.get(pid, {})
        stock = inv.get("cantidad", 0) or 0
        necesito = r["necesito"]
        # Lógica: si stock >= necesito → a_pedir = 0
        # Si stock < necesito → a_pedir = necesito - stock (valor absoluto de la resta cuando es negativa)
        a_pedir = max(0, necesito - stock)
        precio = cat.get("precio_unitario", r.get("precio_unitario", 0)) or 0
        # Unidad base para reportar "a pedir": unidad habitual del producto
        unidad_reporte = cat.get("unidad_habitual", r["unidad"]) or r["unidad"]
        rows.append({
            "producto_id": pid,
            "nombre": r["nombre"],
            "categoria": cat.get("categoria", ""),
            "unidad": unidad_reporte,
            "necesito": round(necesito, 4),
            "tengo": round(stock, 4),
            "diferencia": round(necesito - stock, 4),
            "cantidad_a_pedir": round(a_pedir, 4),
            "precio_unitario": precio,
            "total_estimado": round(a_pedir * precio, 2),
        })
    rows.sort(key=lambda x: (x["categoria"], x["nombre"]))
    return rows

@api.post("/pedidos/calcular")
async def calcular_pedido(payload: PedidoQueryIn, _: dict = Depends(get_current_user)):
    rows = await _calcular_pedido(payload.fecha_inicio, payload.fecha_fin, payload.modulo_ids)
    total = sum(r["total_estimado"] for r in rows)
    return {"items": rows, "total_general": round(total, 2)}

@api.post("/pedidos/pdf")
async def pedido_pdf(payload: PedidoQueryIn, _: dict = Depends(get_current_user)):
    """PDF simplificado: Título, Periodo, Tabla (Producto, Unidad, A Pedir). Nada más."""
    rows = await _calcular_pedido(payload.fecha_inicio, payload.fecha_fin, payload.modulo_ids)
    rows = [r for r in rows if r["cantidad_a_pedir"] > 0]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title="Orden de Requerimiento AJVJ",
    )
    styles = getSampleStyleSheet()
    brand_dark = colors.HexColor("#4B5828")
    brand_accent = colors.HexColor("#8FAD3C")
    brand_cream = colors.HexColor("#C8D4A0")

    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#1C1C1A"))
    elements = []

    # Logo textual simple arriba
    elements.append(Paragraph(
        '<font color="#4B5828" size="22"><b>AJVJ</b></font> <font color="#8FAD3C" size="16"><b>HIDROPÓNICOS</b></font>',
        ParagraphStyle("logo", fontSize=22, leading=26)
    ))
    elements.append(Spacer(1, 4))

    # Título principal
    elements.append(Paragraph(
        '<font color="#4B5828" size="16"><b>Orden de Requerimiento de Agroquímicos</b></font>',
        ParagraphStyle("title", fontSize=16, leading=20, spaceAfter=6)
    ))
    # Periodo
    elements.append(Paragraph(
        f'<b>Periodo:</b> {payload.fecha_inicio} al {payload.fecha_fin}',
        small
    ))
    elements.append(Spacer(1, 14))

    # Tabla simplificada: Producto | Unidad | A Pedir
    table_header = ["Producto", "Unidad", "A Pedir"]
    table_data = [table_header]
    for r in rows:
        table_data.append([
            r["nombre"],
            r["unidad"],
            f'{r["cantidad_a_pedir"]:.2f}',
        ])

    if len(table_data) == 1:
        table_data.append(["No hay productos pendientes por pedir", "", ""])

    tbl = Table(table_data, repeatRows=1, colWidths=[105 * mm, 30 * mm, 30 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), brand_dark),
        ("TEXTCOLOR", (0, 0), (-1, 0), brand_cream),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("FONTSIZE", (0, 1), (-1, -1), 10),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ALIGN", (2, 1), (2, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F0")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, 0), 2, brand_accent),
    ]))
    elements.append(tbl)

    doc.build(elements)
    buf.seek(0)
    fname = f"pedido_AJVJ_{payload.fecha_inicio}_{payload.fecha_fin}.pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}"'})

# ---------- Dashboard ----------
def _norm_cultivo(s: str) -> str:
    if not s:
        return ""
    t = s.strip().lower()
    return t.capitalize()

@api.get("/dashboard/stats")
async def dashboard_stats(
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    ciclo_numero: Optional[int] = None,
    _: dict = Depends(require_admin),
):
    q: dict = {}
    if fecha_inicio or fecha_fin:
        q["fecha"] = {}
        if fecha_inicio:
            q["fecha"]["$gte"] = fecha_inicio
        if fecha_fin:
            q["fecha"]["$lte"] = fecha_fin
    if ciclo_numero is not None:
        q["ciclo_numero"] = ciclo_numero
    bitacoras = await db.bitacoras.find(q, {"_id": 0}).to_list(5000)
    modulos = {m["id"]: m for m in await db.modulos.find({}, {"_id": 0}).to_list(100)}
    productos_cat = {p["id"]: p for p in await db.productos.find({}, {"_id": 0}).to_list(2000)}
    inventario = await db.inventario.find({}, {"_id": 0}).to_list(2000)

    costo_modulo: dict = {}
    costo_obj: dict = {}
    costo_cultivo: dict = {}  # normalizado
    costo_cultivo_variedad: dict = {}  # "Jitomate - Saladette"
    costo_tipo: dict = {"foliar": 0, "suelo": 0, "drench": 0, "riego": 0}
    costo_mes: dict = {}
    top_cost: dict = {}
    aplicaciones_count = 0
    total_gastado = 0.0

    for b in bitacoras:
        m = modulos.get(b["modulo_id"], {})
        nombre_mod = f'Módulo {m.get("nombre", "?")}'
        ciclo_obj = next((c for c in m.get("ciclos", []) if c.get("numero") == b.get("ciclo_numero")), None)
        cultivo_raw = ciclo_obj.get("cultivo") if ciclo_obj else ""
        variedad_raw = ciclo_obj.get("variedad") if ciclo_obj else ""
        cultivo_norm = _norm_cultivo(cultivo_raw) or "Sin asignar"
        variedad = variedad_raw.strip() if variedad_raw else ""
        key_variedad = f"{cultivo_norm}{(' - ' + variedad) if variedad else ''}"
        mes = (b.get("fecha") or "")[:7]
        for ap in b.get("aplicaciones", []):
            aplicaciones_count += 1
            ap_total = ap.get("costo_total_aplicacion", 0)
            costo_modulo[nombre_mod] = costo_modulo.get(nombre_mod, 0) + ap_total
            costo_obj[ap.get("objetivo", "Sin objetivo")] = costo_obj.get(ap.get("objetivo", "Sin objetivo"), 0) + ap_total
            costo_cultivo[cultivo_norm] = costo_cultivo.get(cultivo_norm, 0) + ap_total
            costo_cultivo_variedad[key_variedad] = costo_cultivo_variedad.get(key_variedad, 0) + ap_total
            costo_tipo[ap.get("tipo", "foliar")] = costo_tipo.get(ap.get("tipo", "foliar"), 0) + ap_total
            costo_mes[mes] = costo_mes.get(mes, 0) + ap_total
            total_gastado += ap_total
            for p in ap.get("productos", []):
                top_cost[p["nombre"]] = top_cost.get(p["nombre"], 0) + float(p.get("costo_linea", 0))

    valor_inventario = 0.0
    inv_rows = []
    for inv in inventario:
        cat = productos_cat.get(inv["producto_id"], {})
        precio = cat.get("precio_unitario", 0) or 0
        valor = float(inv.get("cantidad", 0)) * precio
        valor_inventario += valor
        inv_rows.append({
            "producto_id": inv["producto_id"], "nombre": inv["nombre"],
            "cantidad": inv.get("cantidad", 0), "unidad": inv.get("unidad", ""),
            "precio_unitario": precio, "valor": round(valor, 2),
            "categoria": cat.get("categoria", ""),
        })
    inv_rows.sort(key=lambda x: x["valor"], reverse=True)

    def to_list(d):
        return [{"name": k, "value": round(v, 2)} for k, v in d.items()]

    top10_cost = sorted(top_cost.items(), key=lambda x: x[1], reverse=True)[:10]
    # Ajustes pendientes (no revisados por admin)
    ajustes_pend = await db.movimientos.count_documents({"tipo": "ajuste", "revisado": False})

    return {
        "kpis": {
            "total_gastado": round(total_gastado, 2),
            "aplicaciones_registradas": aplicaciones_count,
            "productos_catalogo": len(productos_cat),
            "valor_inventario": round(valor_inventario, 2),
            "ajustes_pendientes": ajustes_pend,
        },
        "costo_por_modulo": to_list(costo_modulo),
        "costo_por_objetivo": sorted(to_list(costo_obj), key=lambda x: x["value"], reverse=True),
        "costo_por_cultivo": to_list(costo_cultivo),
        "costo_por_cultivo_variedad": to_list(costo_cultivo_variedad),
        "costo_por_tipo": to_list(costo_tipo),
        "costo_por_mes": sorted(to_list(costo_mes), key=lambda x: x["name"]),
        "top_productos_costo": [{"name": k, "value": round(v, 2)} for k, v in top10_cost],
        "inventario_valorizado": inv_rows,
    }

# ---------- Health ----------
@api.get("/")
async def root():
    return {"message": "AJVJ Fitosanidad API", "ok": True}

# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.modulos.create_index("nombre", unique=True)
    await db.productos.create_index("nombre")
    await db.bitacoras.create_index("fecha")
    await db.bitacoras.create_index("modulo_id")
    await db.inventario.create_index("producto_id", unique=True)
    await db.movimientos.create_index("producto_id")
    await db.movimientos.create_index("referencia")

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@ajvj.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "nombre": "Administrador",
            "rol": "admin",
            "creado_en": now_iso(),
        })
        logger.info(f"Admin seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )

    # Migración: compras con formato antiguo (producto_id al top-level) → items[]
    async for compra in db.compras.find({"items": {"$exists": False}, "producto_id": {"$exists": True}}):
        new_items = [{
            "producto_id": compra.get("producto_id"),
            "nombre_producto": compra.get("nombre_producto", ""),
            "cantidad": compra.get("cantidad", 0),
            "unidad": compra.get("unidad", "L"),
            "precio_unitario": compra.get("precio_unitario", 0),
            "cantidad_convertida": compra.get("cantidad", 0),
            "unidad_base": compra.get("unidad", "L"),
            "precio_total_item": compra.get("precio_total", 0),
        }]
        await db.compras.update_one(
            {"_id": compra["_id"]},
            {
                "$set": {"items": new_items, "precio_total": compra.get("precio_total", 0)},
                "$unset": {"producto_id": "", "nombre_producto": "", "cantidad": "", "unidad": "", "precio_unitario": ""},
            },
        )
        logger.info(f"Migrated compra {compra.get('id', '?')} to multi-item format")

    # Migración: config jefe_produccion → monitor
    cfg = await db.config.find_one({"id": "main"})
    if cfg and "jefe_produccion" in cfg and not cfg.get("monitor"):
        await db.config.update_one(
            {"id": "main"},
            {"$set": {"monitor": cfg["jefe_produccion"]}, "$unset": {"jefe_produccion": ""}},
        )

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
